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
 * Uses WebSocket-based streaming for real-time transcription with
 * built-in speaker diarization. Falls back to local Whisper on failure.
 *
 * Costs: ~$0.024/min
 */
export class AWSTranscribeEngine extends EventEmitter implements TranscriptionEngine {
  private client: TranscribeStreamingClient | null = null;
  private ready = false;
  private segmentCounter = 0;
  private region: string;

  constructor(region?: string) {
    super();
    this.region = region ?? process.env.AWS_REGION ?? 'us-east-1';
  }

  async initialize(options: TranscriptionOptions): Promise<boolean> {
    try {
      this.client = new TranscribeStreamingClient({ region: this.region });
      this.ready = true;
      this.emit('ready');
      return true;
    } catch (err) {
      this.emit('error', new Error(`Failed to init Transcribe client: ${err}`));
      return false;
    }
  }

  async transcribe(pcmData: Buffer, source: 'mic' | 'system'): Promise<TranscriptSegment[]> {
    if (!this.ready || !this.client) return [];

    try {
      const audioStream = this.createAudioStream(pcmData);

      const command = new StartStreamTranscriptionCommand({
        LanguageCode: LanguageCode.EN_US,
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: 16000,
        AudioStream: audioStream,
        ShowSpeakerLabel: true,
        EnablePartialResultsStabilization: true,
        PartialResultsStability: 'medium',
      });

      const response = await this.client.send(command);
      const segments: TranscriptSegment[] = [];

      if (response.TranscriptResultStream) {
        for await (const event of response.TranscriptResultStream) {
          if (event.TranscriptEvent?.Transcript?.Results) {
            for (const result of event.TranscriptEvent.Transcript.Results) {
              if (result.IsPartial) continue;

              for (const alt of result.Alternatives ?? []) {
                if (!alt.Transcript || alt.Transcript.trim().length === 0) continue;

                this.segmentCounter++;

                // Use speaker label if available, otherwise fallback to source
                let speaker: 'you' | 'other' = source === 'mic' ? 'you' : 'other';
                let speakerName = source === 'mic' ? 'You' : 'Customer';

                if (alt.Items && alt.Items.length > 0) {
                  const speakerLabel = alt.Items[0].Speaker;
                  if (speakerLabel === 'spk_0') {
                    speaker = 'you';
                    speakerName = 'You';
                  } else if (speakerLabel) {
                    speaker = 'other';
                    speakerName = `Speaker ${speakerLabel.replace('spk_', '')}`;
                  }
                }

                segments.push({
                  id: `aws-${Date.now()}-${this.segmentCounter}`,
                  speaker,
                  speakerName,
                  text: alt.Transcript,
                  timestamp: Date.now(),
                  endTimestamp: Date.now(),
                  confidence: this.computeConfidence(alt.Items ?? []),
                  isPartial: false,
                });
              }
            }
          }
        }
      }

      return segments;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      return [];
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  shutdown(): void {
    this.ready = false;
    this.client?.destroy();
    this.client = null;
  }

  private createAudioStream(pcmData: Buffer): AsyncIterable<AudioStream> {
    const chunkSize = 4096; // Send in 4KB chunks
    const chunks: Buffer[] = [];

    for (let i = 0; i < pcmData.length; i += chunkSize) {
      chunks.push(pcmData.subarray(i, Math.min(i + chunkSize, pcmData.length)));
    }

    async function* generator(): AsyncGenerator<AudioStream> {
      for (const chunk of chunks) {
        yield { AudioEvent: { AudioChunk: chunk } };
      }
    }

    return generator();
  }

  private computeConfidence(items: { Confidence?: number }[]): number {
    if (items.length === 0) return 0.8;
    const total = items.reduce((sum, item) => sum + (item.Confidence ?? 0.8), 0);
    return total / items.length;
  }
}
