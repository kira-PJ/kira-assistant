import { EventEmitter } from 'events';
import { AudioCaptureService, AudioChunk } from './audio';
import { TranscriptionService, TranscriptSegment } from './transcription';
import { CoachingService, CoachingSuggestion, SentimentAnalysis, TalkRatioData } from './coaching';
import { CallType } from './coaching/types';

export type SessionState = 'idle' | 'initializing' | 'active' | 'error';

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
export class SessionOrchestrator extends EventEmitter {
  private audio: AudioCaptureService;
  private transcription: TranscriptionService;
  private coaching: CoachingService;
  private state: SessionState = 'idle';

  constructor(config: {
    transcriptionMode?: 'local' | 'cloud';
    callType?: CallType;
    awsRegion?: string;
    bedrockModelId?: string;
    whisperModelPath?: string;
  } = {}) {
    super();

    this.audio = new AudioCaptureService({
      sampleRate: 16000,
      channels: 1,
      bufferMs: 5000,
    });

    this.transcription = new TranscriptionService(
      config.transcriptionMode ?? 'cloud',
      { modelPath: config.whisperModelPath, awsRegion: config.awsRegion }
    );

    this.coaching = new CoachingService({
      callType: config.callType ?? 'discovery',
      region: config.awsRegion,
      modelId: config.bedrockModelId,
    });

    this.wireEvents();
  }

  async start(): Promise<boolean> {
    if (this.state === 'active') return true;
    this.setState('initializing');

    // Initialize transcription engine
    console.log('[Orchestrator] Initializing transcription...');
    const txReady = await this.transcription.initialize();
    console.log('[Orchestrator] Transcription ready:', txReady);
    if (!txReady) {
      this.setState('error');
      this.emit('error', new Error('Failed to initialize transcription'));
      return false;
    }

    // Start audio capture
    console.log('[Orchestrator] Starting audio capture...');
    const audioStarted = await this.audio.start();
    console.log('[Orchestrator] Audio started:', audioStarted);
    if (!audioStarted) {
      this.setState('error');
      this.emit('error', new Error('Failed to start audio capture'));
      return false;
    }

    this.setState('active');
    return true;
  }

  stop(): void {
    this.audio.stop();
    this.setState('idle');
  }

  setCallType(type: CallType): void {
    this.coaching.setCallType(type);
  }

  getState(): SessionState {
    return this.state;
  }

  getTranscript(): TranscriptSegment[] {
    return this.transcription.getTranscript();
  }

  getSuggestions(): CoachingSuggestion[] {
    return this.coaching.getSuggestions();
  }

  getTalkRatio(): TalkRatioData {
    return this.coaching.getTalkRatio();
  }

  destroy(): void {
    this.audio.stop();
    this.transcription.shutdown();
    this.coaching.destroy();
  }

  private wireEvents(): void {
    // Audio → Transcription
    let chunkCount = 0;
    this.audio.on('audio-chunk', (chunk: AudioChunk) => {
      chunkCount++;
      if (chunkCount <= 5 || chunkCount % 10 === 0) {
        console.log(`[Orchestrator] Audio chunk #${chunkCount}: source=${chunk.source}, active=${chunk.isActive}, len=${chunk.buffer.length}`);
      }
      this.transcription.processChunk(chunk);
    });

    this.audio.on('vad-change', (source: string, active: boolean) => {
      this.emit('vad-change', source, active);
    });

    // Transcription → Coaching + UI
    this.transcription.on('segment', (segment: TranscriptSegment) => {
      this.emit('segment', segment);
      this.coaching.processSegment(segment);
    });

    // Coaching → UI
    this.coaching.on('suggestion', (suggestion: CoachingSuggestion) => {
      this.emit('suggestion', suggestion);
    });

    this.coaching.on('sentiment', (analysis: SentimentAnalysis) => {
      this.emit('sentiment', analysis);
    });

    this.coaching.on('talk-ratio', (ratio: TalkRatioData) => {
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

  private setState(state: SessionState): void {
    this.state = state;
    this.emit('state-change', state);
  }
}
