import { EventEmitter } from 'events';
import path from 'path';
import { AudioCaptureOptions, AudioCaptureState, AudioChunk, AudioSource } from './types';

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
export class AudioCaptureService extends EventEmitter {
  private state: AudioCaptureState = 'idle';
  private native: NativeAudioModule | null = null;
  private options: Required<AudioCaptureOptions>;
  private micActive = false;
  private systemActive = false;

  constructor(options: AudioCaptureOptions = {}) {
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
  async start(): Promise<boolean> {
    if (this.state === 'capturing') return true;

    try {
      this.native = this.loadNativeModule();
      if (!this.native) {
        this.setState('error');
        this.emit('error', new Error('Failed to load native audio module'));
        return false;
      }

      const result = this.native.startCapture(
        {
          sampleRate: this.options.sampleRate,
          channels: this.options.channels,
          bufferMs: this.options.bufferMs,
        },
        // Mic callback
        (buffer: Buffer, isActive: boolean, source: string) => {
          this.handleAudioData(buffer, isActive, source as 'mic' | 'system');
        },
        // System audio callback
        (buffer: Buffer, isActive: boolean, source: string) => {
          this.handleAudioData(buffer, isActive, source as 'mic' | 'system');
        }
      );

      if (result?.micActive || result?.systemActive) {
        this.setState('capturing');
        return true;
      } else {
        this.setState('error');
        this.emit('error', new Error('No audio streams could be started'));
        return false;
      }
    } catch (err) {
      this.setState('error');
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  /**
   * Stop audio capture
   */
  stop(): void {
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
  listSources(): AudioSource[] {
    if (!this.native) {
      this.native = this.loadNativeModule();
    }
    return this.native?.listSources() ?? [];
  }

  /**
   * Check if currently capturing
   */
  isCapturing(): boolean {
    return this.state === 'capturing';
  }

  getState(): AudioCaptureState {
    return this.state;
  }

  private handleAudioData(buffer: Buffer, isActive: boolean, source: 'mic' | 'system'): void {
    const chunk: AudioChunk = {
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
    } else if (source === 'system' && isActive !== this.systemActive) {
      this.systemActive = isActive;
      this.emit('vad-change', 'system', isActive);
    }
  }

  private setState(state: AudioCaptureState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('state-change', state);
    }
  }

  private loadNativeModule(): NativeAudioModule | null {
    try {
      // In production, the native addon is built and bundled
      const addonPath = path.join(__dirname, '../../native/audio/build/Release/ghost_audio.node');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(addonPath) as NativeAudioModule;
    } catch {
      // Fallback: try loading from dev location
      try {
        const devPath = path.resolve(process.cwd(), 'native/audio/build/Release/ghost_audio.node');
        return require(devPath) as NativeAudioModule;
      } catch {
        console.warn('[AudioCapture] Native module not available. Build with: cd native/audio && npm run build');
        return null;
      }
    }
  }
}

interface NativeAudioModule {
  startCapture(
    options: { sampleRate: number; channels: number; bufferMs: number },
    micCallback: (buffer: Buffer, isActive: boolean, source: string) => void,
    sysCallback: (buffer: Buffer, isActive: boolean, source: string) => void
  ): { micActive: boolean; systemActive: boolean } | null;
  stopCapture(): boolean;
  listSources(): AudioSource[];
  isCapturing(): boolean;
}
