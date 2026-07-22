import { EventEmitter } from 'events';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';
import { TranscriptionEngine, TranscriptionOptions, TranscriptSegment } from './types';

/**
 * AWSTranscribeEngine - Real-time streaming transcription with speaker diarization
 *
 * Two streams:
 * - Mic stream: always labeled as "You" (speaker = 'you')
 * - System stream: speaker diarization enabled — identifies Speaker 0, 1, 2, etc.
 *
 * Each speaker on the system channel gets a unique speaker ID that persists
 * across the session. The UI can rename "Speaker 0" → "Timothy", "Speaker 1" → "Ali"
 * and those labels stay consistent for that speaker.
 */
export class AWSTranscribeEngine extends EventEmitter implements TranscriptionEngine {
  private client: TranscribeStreamingClient | null = null;
  private ready = false;
  private segmentCounter = 0;
  private region: string;
  private micSession: PersistentStream | null = null;
  private sysSession: PersistentStream | null = null;

  constructor(region?: string) {
    super();
    this.region = region ?? process.env.AWS_REGION ?? 'us-east-1';
  }

  async initialize(_options: TranscriptionOptions): Promise<boolean> {
    try {
      this.client = new TranscribeStreamingClient({ region: this.region });
      this.ready = true;
      console.log('[AWSTranscribe] Client initialized, region:', this.region);
      this.emit('ready');
      return true;
    } catch (err) {
      console.error('[AWSTranscribe] Init failed:', err);
      return false;
    }
  }

  async transcribe(pcmData: Buffer, source: 'mic' | 'system'): Promise<TranscriptSegment[]> {
    if (!this.ready || !this.client) return [];
    if (pcmData.length === 0) return [];

    let session = source === 'mic' ? this.micSession : this.sysSession;

    // Auto-reconnect if stream died
    if (!session || session.ended) {
      const enableDiarization = source === 'system';
      session = new PersistentStream(
        this.client, source, this.region,
        () => ++this.segmentCounter,
        enableDiarization
      );
      if (source === 'mic') this.micSession = session;
      else this.sysSession = session;
      session.start();
      console.log(`[AWSTranscribe] Stream ${session.ended ? 're' : ''}started for: ${source}`);
    }

    session.push(pcmData);
    return session.drain();
  }

  isReady(): boolean { return this.ready; }

  shutdown(): void {
    this.ready = false;
    this.micSession?.stop();
    this.sysSession?.stop();
    this.client?.destroy();
    this.client = null;
  }
}

/**
 * PersistentStream - single long-lived Transcribe WebSocket session
 * With optional speaker diarization for the system audio channel.
 */
class PersistentStream {
  private client: TranscribeStreamingClient;
  private source: 'mic' | 'system';
  private region: string;
  private getNextId: () => number;
  private enableDiarization: boolean;
  private segments: TranscriptSegment[] = [];
  private audioChunks: Buffer[] = [];
  private wakeUp: (() => void) | null = null;
  private stopping = false;
  ended = false;

  constructor(
    client: TranscribeStreamingClient,
    source: 'mic' | 'system',
    region: string,
    getNextId: () => number,
    enableDiarization = false
  ) {
    this.client = client;
    this.source = source;
    this.region = region;
    this.getNextId = getNextId;
    this.enableDiarization = enableDiarization;
  }

  start(): void {
    this.run().catch((err) => {
      console.error(`[AWSTranscribe] Stream ${this.source} error (will auto-reconnect on next audio):`, err?.message?.slice(0, 200));
      this.ended = true;
    });
  }

  push(audio: Buffer): void {
    this.audioChunks.push(audio);
    if (this.wakeUp) {
      const wake = this.wakeUp;
      this.wakeUp = null;
      wake();
    }
  }

  drain(): TranscriptSegment[] {
    return this.segments.splice(0);
  }

  stop(): void {
    this.stopping = true;
    if (this.wakeUp) {
      const wake = this.wakeUp;
      this.wakeUp = null;
      wake();
    }
  }

  private async run(): Promise<void> {
    const self = this;

    async function* audioGenerator(): AsyncGenerator<AudioStream> {
      while (!self.stopping) {
        while (self.audioChunks.length > 0) {
          const chunk = self.audioChunks.shift()!;
          yield { AudioEvent: { AudioChunk: chunk } };
        }
        await new Promise<void>((resolve) => {
          self.wakeUp = resolve;
          setTimeout(resolve, 50);
        });
      }
      yield { AudioEvent: { AudioChunk: Buffer.alloc(0) } };
    }

    // Build command with optional speaker diarization
    const commandInput: any = {
      LanguageCode: LanguageCode.EN_US,
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 16000,
      AudioStream: audioGenerator(),
      EnablePartialResultsStabilization: true,
      PartialResultsStability: 'high',
    };

    // Enable speaker diarization for system audio (identifies multiple speakers)
    if (this.enableDiarization) {
      commandInput.ShowSpeakerLabel = true;
      console.log(`[AWSTranscribe] Speaker diarization ENABLED for ${this.source}`);
    }

    const command = new StartStreamTranscriptionCommand(commandInput);
    const response = await this.client.send(command);
    console.log(`[AWSTranscribe] Stream started: ${this.source} (diarization: ${this.enableDiarization})`);

    if (response.TranscriptResultStream) {
      for await (const event of response.TranscriptResultStream) {
        if (this.stopping) break;

        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            for (const alt of result.Alternatives ?? []) {
              const text = alt.Transcript?.trim();
              if (!text || text.length < 2) continue;

              // Extract speaker label from diarization (if enabled)
              let speakerLabel = '';
              let speakerId = 'other';

              if (this.enableDiarization && alt.Items) {
                // Find the dominant speaker for this segment
                const speakerCounts: Record<string, number> = {};
                for (const item of alt.Items) {
                  if (item.Speaker) {
                    speakerCounts[item.Speaker] = (speakerCounts[item.Speaker] ?? 0) + 1;
                  }
                }
                // Pick the speaker with the most words in this segment
                const dominant = Object.entries(speakerCounts).sort((a, b) => b[1] - a[1])[0];
                if (dominant) {
                  speakerLabel = dominant[0]; // e.g., "0", "1", "2"
                  speakerId = `speaker_${speakerLabel}`; // Unique per speaker
                }
              }

              const segment: TranscriptSegment = {
                id: `aws-${Date.now()}-${this.getNextId()}`,
                speaker: this.source === 'mic' ? 'you' : speakerId as any,
                speakerName: this.source === 'mic'
                  ? 'You'
                  : speakerLabel ? `Speaker ${parseInt(speakerLabel) + 1}` : 'Other',
                text,
                timestamp: Date.now(),
                endTimestamp: Date.now(),
                confidence: result.IsPartial ? 0.6 : 0.9,
                isPartial: result.IsPartial ?? false,
              };

              this.segments.push(segment);
            }
          }
        }
      }
    }

    this.ended = true;
  }
}
