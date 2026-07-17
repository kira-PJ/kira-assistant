import { EventEmitter } from 'events';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';
import { TranscriptionEngine, TranscriptionOptions, TranscriptSegment } from './types';

/**
 * AWSTranscribeEngine - Real-time streaming transcription
 *
 * Maintains a SINGLE persistent streaming session per audio source.
 * Audio chunks are fed continuously into the stream, and results
 * arrive in real-time (~1-2 second latency), just like Otter.ai.
 *
 * Architecture:
 * - Audio chunks push into a queue
 * - An async generator feeds the queue to Transcribe continuously
 * - A response listener emits segments as they arrive
 * - Partial results shown immediately, replaced when final arrives
 */
export class AWSTranscribeEngine extends EventEmitter implements TranscriptionEngine {
  private client: TranscribeStreamingClient | null = null;
  private ready = false;
  private segmentCounter = 0;
  private region: string;

  // Persistent stream state
  private micStream: StreamSession | null = null;
  private sysStream: StreamSession | null = null;

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
      this.emit('error', new Error(`Failed to init Transcribe client: ${err}`));
      return false;
    }
  }

  /**
   * Feed audio into the persistent stream.
   * First call starts the session; subsequent calls push more audio.
   */
  async transcribe(pcmData: Buffer, source: 'mic' | 'system'): Promise<TranscriptSegment[]> {
    if (!this.ready || !this.client) return [];
    if (pcmData.length === 0) return [];

    const stream = source === 'mic' ? this.micStream : this.sysStream;

    if (!stream || stream.ended) {
      // Start a new streaming session for this source
      await this.startStream(source);
    }

    // Push audio into the active stream
    const activeStream = source === 'mic' ? this.micStream : this.sysStream;
    activeStream?.pushAudio(pcmData);

    // Collect any segments that arrived since last call
    const segments = activeStream?.drainSegments() ?? [];
    return segments;
  }

  isReady(): boolean {
    return this.ready;
  }

  shutdown(): void {
    this.ready = false;
    this.micStream?.stop();
    this.sysStream?.stop();
    this.micStream = null;
    this.sysStream = null;
    this.client?.destroy();
    this.client = null;
  }

  private async startStream(source: 'mic' | 'system'): Promise<void> {
    if (!this.client) return;

    const session = new StreamSession(this.client, source, () => this.segmentCounter++);

    if (source === 'mic') {
      this.micStream = session;
    } else {
      this.sysStream = session;
    }

    session.on('error', (err) => {
      console.error(`[AWSTranscribe] Stream error (${source}):`, err.message);
      this.emit('error', err);
    });

    await session.start();
  }
}

/**
 * StreamSession - A single persistent Transcribe streaming session
 *
 * Keeps a WebSocket open and feeds audio continuously.
 * Collects results as they arrive.
 */
class StreamSession extends EventEmitter {
  private client: TranscribeStreamingClient;
  private source: 'mic' | 'system';
  private audioQueue: Buffer[] = [];
  private audioResolve: (() => void) | null = null;
  private segments: TranscriptSegment[] = [];
  private getNextId: () => number;
  ended = false;
  private stopping = false;

  constructor(client: TranscribeStreamingClient, source: 'mic' | 'system', getNextId: () => number) {
    super();
    this.client = client;
    this.source = source;
    this.getNextId = getNextId;
  }

  async start(): Promise<void> {
    const self = this;

    // Async generator that yields audio chunks as they arrive
    async function* audioStream(): AsyncGenerator<AudioStream> {
      while (!self.stopping) {
        if (self.audioQueue.length > 0) {
          const chunk = self.audioQueue.shift()!;
          yield { AudioEvent: { AudioChunk: chunk } };
        } else {
          // Wait for more audio
          await new Promise<void>((resolve) => {
            self.audioResolve = resolve;
            // Timeout to prevent hanging forever
            setTimeout(resolve, 100);
          });
        }
      }
      // Signal end of stream
      yield { AudioEvent: { AudioChunk: Buffer.alloc(0) } };
    }

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: LanguageCode.EN_US,
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream(),
      ShowSpeakerLabel: true,
      EnablePartialResultsStabilization: true,
      PartialResultsStability: 'high',
    });

    // Start the stream in background (don't await — it runs until stopped)
    this.processResponse(command).catch((err) => {
      if (!this.stopping) {
        this.emit('error', err);
      }
      this.ended = true;
    });
  }

  private async processResponse(command: StartStreamTranscriptionCommand): Promise<void> {
    try {
      const response = await this.client.send(command);

      if (response.TranscriptResultStream) {
        for await (const event of response.TranscriptResultStream) {
          if (this.stopping) break;

          if (event.TranscriptEvent?.Transcript?.Results) {
            for (const result of event.TranscriptEvent.Transcript.Results) {
              // Show partial results for real-time feel
              for (const alt of result.Alternatives ?? []) {
                const text = alt.Transcript?.trim();
                if (!text || text.length < 2) continue;

                const id = this.getNextId();
                const segment: TranscriptSegment = {
                  id: `aws-${Date.now()}-${id}`,
                  speaker: this.source === 'mic' ? 'you' : 'other',
                  speakerName: this.source === 'mic' ? 'You' : 'Customer',
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
    } catch (err: any) {
      if (!this.stopping) {
        throw err;
      }
    } finally {
      this.ended = true;
    }
  }

  /**
   * Push audio data into the stream
   */
  pushAudio(pcmData: Buffer): void {
    // Feed in smaller chunks (~100ms each) for lower latency
    const chunkSize = 3200; // 100ms at 16kHz 16-bit mono
    for (let i = 0; i < pcmData.length; i += chunkSize) {
      this.audioQueue.push(pcmData.subarray(i, Math.min(i + chunkSize, pcmData.length)));
    }
    // Wake up the generator
    if (this.audioResolve) {
      this.audioResolve();
      this.audioResolve = null;
    }
  }

  /**
   * Drain collected segments since last call
   */
  drainSegments(): TranscriptSegment[] {
    const result = this.segments.splice(0, this.segments.length);
    return result;
  }

  /**
   * Stop the stream
   */
  stop(): void {
    this.stopping = true;
    if (this.audioResolve) {
      this.audioResolve();
      this.audioResolve = null;
    }
  }
}
