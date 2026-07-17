import { EventEmitter } from 'events';
import { AudioChunk } from '../audio/types';
import { TranscriptionEngine, TranscriptionOptions, TranscriptSegment } from './types';
import { WhisperEngine } from './WhisperEngine';
import { AWSTranscribeEngine } from './AWSTranscribeEngine';

/**
 * TranscriptionService - Orchestrates audio-to-text conversion
 * 
 * Receives audio chunks from AudioCaptureService, routes them to the
 * configured transcription engine (local Whisper or AWS Transcribe),
 * and handles speaker diarization via dual-stream labeling:
 * - mic stream → "You"
 * - system stream → "Other" (customer/participant)
 * 
 * Emits real-time transcript segments for the UI and coaching engine.
 */
export class TranscriptionService extends EventEmitter {
  private engine: TranscriptionEngine;
  private fallbackEngine: TranscriptionEngine | null = null;
  private options: TranscriptionOptions;
  private processing = false;
  private queue: AudioChunk[] = [];
  private transcript: TranscriptSegment[] = [];
  private maxQueueSize = 10; // prevent unbounded growth

  constructor(mode: 'local' | 'cloud' = 'local', options: TranscriptionOptions = {}) {
    super();
    this.options = options;

    if (mode === 'cloud') {
      this.engine = new AWSTranscribeEngine(options.awsRegion);
      this.fallbackEngine = new WhisperEngine();
    } else {
      this.engine = new WhisperEngine();
    }
  }

  /**
   * Initialize the transcription engine
   */
  async initialize(): Promise<boolean> {
    let success = await this.engine.initialize(this.options);

    // If cloud engine fails, fall back to local
    if (!success && this.fallbackEngine) {
      this.emit('fallback', 'Cloud transcription unavailable, falling back to local Whisper');
      this.engine = this.fallbackEngine;
      this.fallbackEngine = null;
      success = await this.engine.initialize(this.options);
    }

    if (success) {
      this.emit('ready');
    }
    return success;
  }

  /**
   * Process an audio chunk from the capture service
   * Queues chunks and processes them sequentially to avoid overloading
   */
  async processChunk(chunk: AudioChunk): Promise<void> {
    // Only process chunks with voice activity
    if (!chunk.isActive) return;

    this.queue.push(chunk);

    // Trim queue if it grows too large (drop oldest)
    while (this.queue.length > this.maxQueueSize) {
      this.queue.shift();
    }

    if (!this.processing) {
      await this.processQueue();
    }
  }

  /**
   * Get the full transcript so far
   */
  getTranscript(): TranscriptSegment[] {
    return [...this.transcript];
  }

  /**
   * Clear the transcript (e.g., for new call)
   */
  clearTranscript(): void {
    this.transcript = [];
    this.emit('transcript-cleared');
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.engine.isReady();
  }

  /**
   * Shut down the transcription engine
   */
  shutdown(): void {
    this.engine.shutdown();
    this.queue = [];
    this.processing = false;
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const chunk = this.queue.shift()!;

      try {
        const segments = await this.engine.transcribe(chunk.buffer, chunk.source);

        for (const segment of segments) {
          this.transcript.push(segment);
          this.emit('segment', segment);
        }
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }

    this.processing = false;
  }
}
