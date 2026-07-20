export interface TranscriptSegment {
  id: string;
  speaker: string; // 'you' | 'speaker_0' | 'speaker_1' | 'speaker_2' | 'other'
  speakerName: string;
  text: string;
  timestamp: number;
  endTimestamp: number;
  confidence: number;
  isPartial: boolean;
}

export interface TranscriptionOptions {
  modelPath?: string;
  language?: string;       // default: 'en'
  translateToEnglish?: boolean;
  threads?: number;        // CPU threads for whisper (default: 4)
  awsRegion?: string;      // for cloud mode
}

export interface TranscriptionEngine {
  initialize(options: TranscriptionOptions): Promise<boolean>;
  transcribe(pcmData: Buffer, source: 'mic' | 'system'): Promise<TranscriptSegment[]>;
  isReady(): boolean;
  shutdown(): void;
}

export interface TranscriptionEvents {
  'segment': (segment: TranscriptSegment) => void;
  'partial': (segment: TranscriptSegment) => void;
  'ready': () => void;
  'error': (error: Error) => void;
}
