export interface AudioSource {
  name: string;
  description: string;
  isMonitor: boolean;
}

export interface AudioChunk {
  buffer: Buffer;
  source: 'mic' | 'system';
  isActive: boolean;
  timestamp: number;
  durationMs: number;
}

export interface AudioCaptureOptions {
  sampleRate?: number;   // default: 16000
  channels?: number;     // default: 1 (mono)
  bufferMs?: number;     // default: 5000 (5 second chunks)
}

export type AudioCaptureState = 'idle' | 'capturing' | 'error';

export interface AudioCaptureEvents {
  'audio-chunk': (chunk: AudioChunk) => void;
  'vad-change': (source: 'mic' | 'system', active: boolean) => void;
  'state-change': (state: AudioCaptureState) => void;
  'error': (error: Error) => void;
}
