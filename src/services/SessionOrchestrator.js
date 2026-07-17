"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionOrchestrator = void 0;
const events_1 = require("events");
const audio_1 = require("./audio");
const transcription_1 = require("./transcription");
const coaching_1 = require("./coaching");
/**
 * SessionOrchestrator - Ties audio, transcription, and coaching together
 *
 * Lifecycle:
 * 1. User starts capture → audio service begins
 * 2. Audio chunks arrive → sent to transcription
 * 3. Transcript segments arrive → sent to coaching engine
 * 4. Coaching suggestions emitted → forwarded to renderer via IPC
 * 5. User stops capture → generate post-call summary
 */
class SessionOrchestrator extends events_1.EventEmitter {
    audio;
    transcription;
    coaching;
    state = 'idle';
    constructor(config = {}) {
        super();
        this.audio = new audio_1.AudioCaptureService({
            sampleRate: 16000,
            channels: 1,
            bufferMs: 5000,
        });
        this.transcription = new transcription_1.TranscriptionService(config.transcriptionMode ?? 'local', { modelPath: config.whisperModelPath });
        this.coaching = new coaching_1.CoachingService({
            callType: config.callType ?? 'discovery',
            region: config.awsRegion,
            modelId: config.bedrockModelId,
        });
        this.wireEvents();
    }
    async start() {
        if (this.state === 'active')
            return true;
        this.setState('initializing');
        // Initialize transcription engine
        const txReady = await this.transcription.initialize();
        if (!txReady) {
            this.setState('error');
            this.emit('error', new Error('Failed to initialize transcription'));
            return false;
        }
        // Start audio capture
        const audioStarted = await this.audio.start();
        if (!audioStarted) {
            this.setState('error');
            this.emit('error', new Error('Failed to start audio capture'));
            return false;
        }
        this.setState('active');
        return true;
    }
    stop() {
        this.audio.stop();
        this.setState('idle');
    }
    setCallType(type) {
        this.coaching.setCallType(type);
    }
    getState() {
        return this.state;
    }
    getTranscript() {
        return this.transcription.getTranscript();
    }
    getSuggestions() {
        return this.coaching.getSuggestions();
    }
    getTalkRatio() {
        return this.coaching.getTalkRatio();
    }
    destroy() {
        this.audio.stop();
        this.transcription.shutdown();
        this.coaching.destroy();
    }
    wireEvents() {
        // Audio → Transcription
        this.audio.on('audio-chunk', (chunk) => {
            this.transcription.processChunk(chunk);
        });
        this.audio.on('vad-change', (source, active) => {
            this.emit('vad-change', source, active);
        });
        // Transcription → Coaching + UI
        this.transcription.on('segment', (segment) => {
            this.emit('segment', segment);
            this.coaching.processSegment(segment);
        });
        // Coaching → UI
        this.coaching.on('suggestion', (suggestion) => {
            this.emit('suggestion', suggestion);
        });
        this.coaching.on('sentiment', (analysis) => {
            this.emit('sentiment', analysis);
        });
        this.coaching.on('talk-ratio', (ratio) => {
            this.emit('talk-ratio', ratio);
        });
        this.coaching.on('tech-mention', (mention) => {
            this.emit('tech-mention', mention);
        });
        // Error forwarding
        this.audio.on('error', (err) => this.emit('error', err));
        this.transcription.on('error', (err) => this.emit('error', err));
        this.coaching.on('error', (err) => this.emit('error', err));
    }
    setState(state) {
        this.state = state;
        this.emit('state-change', state);
    }
}
exports.SessionOrchestrator = SessionOrchestrator;
