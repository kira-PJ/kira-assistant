import { EventEmitter } from 'events';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';
import { TranscriptionEngine, TranscriptionOptions, TranscriptSegment } from './types';

/**
 * AWSTranscribeEngine - Cloud transcription via AWS Transcribe Streaming
 *
 * Maintains a single streaming session and feeds audio chunks continuously.
 * Results arrive in real-time (~1-2 second latency).
 *
 * Speaker diarization: uses dual-stream source labeling (mic=You, system=Other)
 * plus optional AWS speaker labels for multi-participant calls.
 *
 * Cost: ~$0.024/min
 */
export class AWSTranscribeEngine extends EventEmitter implements TranscriptionEngine {
  private client: TranscribeStreamingClient | null = null;
  private ready = false;
  private segmentCounter = 0;
  private region: string;
  private pendingChunks: { buffer: Buffer; source: 'mic' | 'system' }[] = [];
  private currentSource: 'mic' | 'system' = 'mic';
  private sessionActive = false;
  private audioQueue: Buffer[] = [];
  private audioResolve: ((value: void) => void) | null = null;
  private sessionEnded = false;
  private resultSegments: TranscriptSegment[] = [];

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
   * Transcribe a chunk of audio.
   * Creates a short streaming session per chunk (simpler and more reliable
   * than maintaining a long-lived session across chunk boundaries).
   */
  async transcribe(pcmData: Buffer, source: 'mic' | 'system'): Promise<TranscriptSegment[]> {
    if (!this.ready || !this.client) return [];
    if (pcmData.length === 0) return [];

    this.currentSource = source;

    try {
      const segments: TranscriptSegment[] = [];

      // Create audio stream generator
      const audioStream = this.createAudioStream(pcmData);

      const command = new StartStreamTranscriptionCommand({
        LanguageCode: LanguageCode.EN_US,
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: 16000,
        AudioStream: audioStream,
        ShowSpeakerLabel: true,
        EnablePartialResultsStabilization: true,
        PartialResultsStability: 'high',
      });

      const response = await this.client.send(command);

      if (response.TranscriptResultStream) {
        for await (const event of response.TranscriptResultStream) {
          if (event.TranscriptEvent?.Transcript?.Results) {
            for (const result of event.TranscriptEvent.Transcript.Results) {
              // Skip partial results — only take final
              if (result.IsPartial) continue;

              for (const alt of result.Alternatives ?? []) {
                const text = alt.Transcript?.trim();
                if (!text || text.length < 2) continue;

                this.segmentCounter++;

                const segment: TranscriptSegment = {
                  id: `aws-${Date.now()}-${this.segmentCounter}`,
                  speaker: source === 'mic' ? 'you' : 'other',
                  speakerName: source === 'mic' ? 'You' : 'Customer',
                  text,
                  timestamp: Date.now(),
                  endTimestamp: Date.now(),
                  confidence: this.computeConfidence(alt.Items ?? []),
                  isPartial: false,
                };

                segments.push(segment);
                console.log(`[AWSTranscribe] Segment: [${segment.speakerName}] ${text}`);
              }
            }
          }
        }
      }

      return segments;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      // Don't spam errors for empty audio
      if (!msg.includes('audio') || this.segmentCounter === 0) {
        console.error('[AWSTranscribe] Error:', msg);
      }
      this.emit('error', new Error(msg));
      return [];
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  shutdown(): void {
    this.ready = false;
    this.sessionEnded = true;
    this.client?.destroy();
    this.client = null;
  }

  private createAudioStream(pcmData: Buffer): AsyncIterable<AudioStream> {
    // Send audio in ~100ms chunks (3200 bytes at 16kHz 16-bit mono)
    const chunkSize = 3200;
    const chunks: Buffer[] = [];

    for (let i = 0; i < pcmData.length; i += chunkSize) {
      chunks.push(pcmData.subarray(i, Math.min(i + chunkSize, pcmData.length)));
    }

    async function* generator(): AsyncGenerator<AudioStream> {
      for (const chunk of chunks) {
        yield { AudioEvent: { AudioChunk: chunk } };
      }
      // Empty chunk signals end of audio
      yield { AudioEvent: { AudioChunk: Buffer.alloc(0) } };
    }

    return generator();
  }

  private computeConfidence(items: { Confidence?: number }[]): number {
    if (items.length === 0) return 0.85;
    let total = 0;
    let count = 0;
    for (const item of items) {
      if (item.Confidence !== undefined) {
        total += item.Confidence;
        count++;
      }
    }
    return count > 0 ? total / count : 0.85;
  }
}
