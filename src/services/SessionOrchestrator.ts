import { EventEmitter } from 'events';
import { AudioCaptureService, AudioChunk } from './audio';
import { TranscriptionService, TranscriptSegment } from './transcription';
import { SpeakerIdentifier } from './transcription/SpeakerIdentifier';
import { CoachingService, CoachingSuggestion, SentimentAnalysis, TalkRatioData } from './coaching';
import { CallType } from './coaching/types';
import { LocalStorage, SavedCall } from './storage';

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
  private speakerIdentifier: SpeakerIdentifier;
  private storage: LocalStorage;
  private state: SessionState = 'idle';
  private callStartTime = 0;
  private sessionConfig: { meetingName?: string; meetingContext?: string; callType?: string; myRole?: string; participants?: string } = {};

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
      bufferMs: 200,
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

    this.speakerIdentifier = new SpeakerIdentifier();
    this.storage = new LocalStorage();
    this.storage.initialize();

    this.wireEvents();
  }

  async start(): Promise<boolean> {
    if (this.state === 'active') return true;
    this.setState('initializing');
    this.callStartTime = Date.now();

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
    this.autoSaveCall();
    this.setState('idle');
  }

  setCallType(type: CallType): void {
    this.coaching.setCallType(type);
  }

  setSessionConfig(config: { meetingName?: string; meetingContext?: string; callType?: string; myRole?: string; participants?: string }): void {
    this.sessionConfig = config;
    // If participants provided, set the first one as the "other" speaker name
    if (config.participants) {
      const firstName = config.participants.split(/[,;]/)[0]?.trim().split(/\s/)[0];
      if (firstName) {
        this.speakerIdentifier.setName('other', firstName);
      }
    }
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
      if (chunkCount <= 3 || chunkCount % 50 === 0) {
        console.log(`[Orchestrator] Audio chunk #${chunkCount}: source=${chunk.source}, active=${chunk.isActive}, len=${chunk.buffer.length}`);
      }
      this.transcription.processChunk(chunk);
    });

    this.audio.on('vad-change', (source: string, active: boolean) => {
      this.emit('vad-change', source, active);
    });

    // Transcription → Speaker ID → Coaching + UI
    this.transcription.on('segment', (segment: TranscriptSegment) => {
      // Apply speaker name detection
      const labeled = this.speakerIdentifier.processSegment(segment);
      this.emit('segment', labeled);
      this.coaching.processSegment(labeled);
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

  private async autoSaveCall(): Promise<void> {
    const transcript = this.transcription.getTranscript();
    if (transcript.length === 0) return;

    const call: SavedCall = {
      id: `call-${this.callStartTime}`,
      name: this.sessionConfig.meetingName ?? `Call ${new Date(this.callStartTime).toLocaleString()}`,
      date: new Date(this.callStartTime).toISOString(),
      durationMs: Date.now() - this.callStartTime,
      callType: this.sessionConfig.callType ?? 'discovery',
      participants: this.sessionConfig.participants ?? '',
      context: this.sessionConfig.meetingContext ?? '',
      myRole: this.sessionConfig.myRole ?? 'leading',
      transcript,
      segmentCount: transcript.length,
    };

    try {
      await this.storage.saveCall(call);
      console.log(`[Orchestrator] Call saved: ${call.name} (${transcript.length} segments)`);
    } catch (err) {
      console.error('[Orchestrator] Failed to save call:', err);
    }
  }

  /**
   * Get list of past saved calls
   */
  async listSavedCalls(): Promise<Omit<SavedCall, 'transcript'>[]> {
    return this.storage.listCalls();
  }

  /**
   * Get a specific saved call with full transcript
   */
  async getSavedCall(id: string): Promise<SavedCall | null> {
    return this.storage.getCall(id);
  }
}
