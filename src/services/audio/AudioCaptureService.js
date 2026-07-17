"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioCaptureService = void 0;
const events_1 = require("events");
const path_1 = __importDefault(require("path"));
/**
 * AudioCaptureService - Manages dual-stream audio capture
 *
 * Captures from both microphone (for "You") and system audio monitor
 * (for "Others") simultaneously. Provides PCM chunks suitable for
 * transcription engines.
 *
 * Uses native addon on Linux (PulseAudio/PipeWire), with planned
 * support for macOS (CoreAudio) and Windows (WASAPI).
 */
class AudioCaptureService extends events_1.EventEmitter {
    state = 'idle';
    native = null;
    options;
    micActive = false;
    systemActive = false;
    constructor(options = {}) {
        super();
        this.options = {
            sampleRate: options.sampleRate ?? 16000,
            channels: options.channels ?? 1,
            bufferMs: options.bufferMs ?? 5000,
        };
    }
    /**
     * Start dual-stream audio capture
     */
    async start() {
        if (this.state === 'capturing')
            return true;
        try {
            this.native = this.loadNativeModule();
            if (!this.native) {
                this.setState('error');
                this.emit('error', new Error('Failed to load native audio module'));
                return false;
            }
            const result = this.native.startCapture({
                sampleRate: this.options.sampleRate,
                channels: this.options.channels,
                bufferMs: this.options.bufferMs,
            }, 
            // Mic callback
            (buffer, isActive, source) => {
                this.handleAudioData(buffer, isActive, source);
            }, 
            // System audio callback
            (buffer, isActive, source) => {
                this.handleAudioData(buffer, isActive, source);
            });
            if (result?.micActive || result?.systemActive) {
                this.setState('capturing');
                return true;
            }
            else {
                this.setState('error');
                this.emit('error', new Error('No audio streams could be started'));
                return false;
            }
        }
        catch (err) {
            this.setState('error');
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
            return false;
        }
    }
    /**
     * Stop audio capture
     */
    stop() {
        if (this.native) {
            this.native.stopCapture();
        }
        this.setState('idle');
        this.micActive = false;
        this.systemActive = false;
    }
    /**
     * List available audio sources on the system
     */
    listSources() {
        if (!this.native) {
            this.native = this.loadNativeModule();
        }
        return this.native?.listSources() ?? [];
    }
    /**
     * Check if currently capturing
     */
    isCapturing() {
        return this.state === 'capturing';
    }
    getState() {
        return this.state;
    }
    handleAudioData(buffer, isActive, source) {
        const chunk = {
            buffer,
            source,
            isActive,
            timestamp: Date.now(),
            durationMs: this.options.bufferMs,
        };
        this.emit('audio-chunk', chunk);
        // Track VAD state changes
        if (source === 'mic' && isActive !== this.micActive) {
            this.micActive = isActive;
            this.emit('vad-change', 'mic', isActive);
        }
        else if (source === 'system' && isActive !== this.systemActive) {
            this.systemActive = isActive;
            this.emit('vad-change', 'system', isActive);
        }
    }
    setState(state) {
        if (this.state !== state) {
            this.state = state;
            this.emit('state-change', state);
        }
    }
    loadNativeModule() {
        try {
            // In production, the native addon is built and bundled
            const addonPath = path_1.default.join(__dirname, '../../native/audio/build/Release/ghost_audio.node');
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require(addonPath);
        }
        catch {
            // Fallback: try loading from dev location
            try {
                const devPath = path_1.default.resolve(process.cwd(), 'native/audio/build/Release/ghost_audio.node');
                return require(devPath);
            }
            catch {
                console.warn('[AudioCapture] Native module not available. Build with: cd native/audio && npm run build');
                return null;
            }
        }
    }
}
exports.AudioCaptureService = AudioCaptureService;
