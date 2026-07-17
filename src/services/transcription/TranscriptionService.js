"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranscriptionService = void 0;
const events_1 = require("events");
const WhisperEngine_1 = require("./WhisperEngine");
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
class TranscriptionService extends events_1.EventEmitter {
    engine;
    options;
    processing = false;
    queue = [];
    transcript = [];
    maxQueueSize = 10; // prevent unbounded growth
    constructor(mode = 'local', options = {}) {
        super();
        this.options = options;
        if (mode === 'local') {
            this.engine = new WhisperEngine_1.WhisperEngine();
        }
        else {
            // Cloud mode would use AWS Transcribe Streaming
            // For now, fall back to local
            this.engine = new WhisperEngine_1.WhisperEngine();
        }
    }
    /**
     * Initialize the transcription engine
     */
    async initialize() {
        const success = await this.engine.initialize(this.options);
        if (success) {
            this.emit('ready');
        }
        return success;
    }
    /**
     * Process an audio chunk from the capture service
     * Queues chunks and processes them sequentially to avoid overloading
     */
    async processChunk(chunk) {
        // Only process chunks with voice activity
        if (!chunk.isActive)
            return;
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
    getTranscript() {
        return [...this.transcript];
    }
    /**
     * Clear the transcript (e.g., for new call)
     */
    clearTranscript() {
        this.transcript = [];
        this.emit('transcript-cleared');
    }
    /**
     * Check if engine is ready
     */
    isReady() {
        return this.engine.isReady();
    }
    /**
     * Shut down the transcription engine
     */
    shutdown() {
        this.engine.shutdown();
        this.queue = [];
        this.processing = false;
    }
    async processQueue() {
        this.processing = true;
        while (this.queue.length > 0) {
            const chunk = this.queue.shift();
            try {
                const segments = await this.engine.transcribe(chunk.buffer, chunk.source);
                for (const segment of segments) {
                    this.transcript.push(segment);
                    this.emit('segment', segment);
                }
            }
            catch (err) {
                this.emit('error', err instanceof Error ? err : new Error(String(err)));
            }
        }
        this.processing = false;
    }
}
exports.TranscriptionService = TranscriptionService;
