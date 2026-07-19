import { EventEmitter } from 'events';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';
import { TranscriptionEngine, TranscriptionOptions, TranscriptSegment } from './types';

/**
 * AWSTranscribeEngine - Real-time persistent streaming transcription
 *
 * ONE session stays open per audio source. Audio pushed continuously.
 * Partial results appear immediately (grey), finals replace them (white).
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

    // Start session if not running
    if (!session || session.ended) {
      session = new PersistentStream(this.client, source, this.region, () => ++this.segmentCounter);
      if (source === 'mic') this.micSession = session;
      else this.sysSession = session;
      session.start();
    }

    // Push audio (non-blocking)
    session.push(pcmData);

    // Return any accumulated results
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
 */
class PersistentStream {
  private client: TranscribeStreamingClient;
  private source: 'mic' | 'system';
  private region: string;
  private getNextId: () => number;
  private segments: TranscriptSegment[] = [];
  private audioChunks: Buffer[] = [];
  private wakeUp: (() => void) | null = null;
  private stopping = false;
  ended = false;

  constructor(client: TranscribeStreamingClient, source: 'mic' | 'system', region: string, getNextId: () => number) {
    this.client = client;
    this.source = source;
    this.region = region;
    this.getNextId = getNextId;
  }

  start(): void {
    this.run().catch((err) => {
      console.error(`[AWSTranscribe] Stream ${this.source} error:`, err?.message?.slice(0, 100));
      this.ended = true;
    });
  }

  push(audio: Buffer): void {
    this.audioChunks.push(audio);
    // Wake up the generator if it's waiting
    if (this.wakeUp) {
      const wake = this.wakeUp;
      this.wakeUp = null;
      wake();
    }
  }

  drain(): TranscriptSegment[] {
    const result = this.segments.splice(0);
    return result;
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
        // Yield all queued chunks
        while (self.audioChunks.length > 0) {
          const chunk = self.audioChunks.shift()!;
          yield { AudioEvent: { AudioChunk: chunk } };
        }
        // Wait for more audio (with timeout to prevent hanging)
        await new Promise<void>((resolve) => {
          self.wakeUp = resolve;
          setTimeout(resolve, 50); // poll every 50ms
        });
      }
      // End signal
      yield { AudioEvent: { AudioChunk: Buffer.alloc(0) } };
    }

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: LanguageCode.EN_US,
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 16000,
      AudioStream: audioGenerator(),
      EnablePartialResultsStabilization: true,
      PartialResultsStability: 'high',
    });

    const response = await this.client.send(command);
    console.log(`[AWSTranscribe] Persistent stream started for: ${this.source}`);

    if (response.TranscriptResultStream) {
      for await (const event of response.TranscriptResultStream) {
        if (this.stopping) break;

        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            for (const alt of result.Alternatives ?? []) {
              const text = alt.Transcript?.trim();
              if (!text || text.length < 2) continue;

              this.segments.push({
                id: `aws-${Date.now()}-${this.getNextId()}`,
                speaker: this.source === 'mic' ? 'you' : 'other',
                speakerName: this.source === 'mic' ? 'You' : 'Customer',
                text,
                timestamp: Date.now(),
                endTimestamp: Date.now(),
                confidence: result.IsPartial ? 0.6 : 0.9,
                isPartial: result.IsPartial ?? false,
              });
            }
          }
        }
      }
    }

    this.ended = true;
  }
}
