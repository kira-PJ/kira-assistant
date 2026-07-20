import { EventEmitter } from 'events';
import { AudioCaptureService, AudioChunk } from './audio';
import { AudioRecorder } from './audio/AudioRecorder';
import { TranscriptionService, TranscriptSegment } from './transcription';
import { SpeakerIdentifier } from './transcription/SpeakerIdentifier';
import { CoachingService, CoachingSuggestion, SentimentAnalysis, TalkRatioData } from './coaching';
import { CallType } from './coaching/types';
import { LLMProvider, createLLMClient, ILLMClient } from './coaching/LLMClient';
import { LocalStorage, SavedCall } from './storage';
import { SyncService } from './cloud';
import { PostCallReport } from './postcall/types';
import { PostCallProcessor, ProcessedCall } from './postcall/PostCallProcessor';

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
  private recorder: AudioRecorder;
  private transcription: TranscriptionService;
  private coaching: CoachingService;
  private speakerIdentifier: SpeakerIdentifier;
  private storage: LocalStorage;
  private sync: SyncService;
  private postProcessor: PostCallProcessor;
  private llm: ILLMClient;
  private state: SessionState = 'idle';
  private callStartTime = 0;
  private sessionConfig: { meetingName?: string; meetingContext?: string; callType?: string; myRole?: string; participants?: string } = {};

  constructor(config: {
    transcriptionMode?: 'local' | 'cloud';
    callType?: CallType;
    awsRegion?: string;
    bedrockModelId?: string;
    whisperModelPath?: string;
    apiUrl?: string;
    llmProvider?: LLMProvider;
    groqApiKey?: string;
    geminiApiKey?: string;
  } = {}) {
    super();

    this.audio = new AudioCaptureService({
      sampleRate: 16000,
      channels: 1,
      bufferMs: 200,
    });

    this.recorder = new AudioRecorder(16000, 1);

    this.transcription = new TranscriptionService(
      config.transcriptionMode ?? 'cloud',
      { modelPath: config.whisperModelPath, awsRegion: config.awsRegion }
    );

    this.coaching = new CoachingService({
      callType: config.callType ?? 'discovery',
      region: config.awsRegion,
      modelId: config.bedrockModelId,
      llmProvider: config.llmProvider,
      groqApiKey: config.groqApiKey,
      geminiApiKey: config.geminiApiKey,
    });

    this.speakerIdentifier = new SpeakerIdentifier();
    this.storage = new LocalStorage();
    this.storage.initialize();

    // LLM client for post-call processing (shared config with coaching)
    this.llm = createLLMClient({
      provider: config.llmProvider ?? 'bedrock',
      awsRegion: config.awsRegion,
      bedrockModelId: config.bedrockModelId,
      groqApiKey: config.groqApiKey,
      geminiApiKey: config.geminiApiKey,
      maxTokens: 2000, // Larger for post-call summaries
    });
    this.postProcessor = new PostCallProcessor(this.llm);

    // Cloud sync — queues completed calls for upload
    this.sync = new SyncService(config.apiUrl);
    this.sync.initialize().catch(err => {
      console.error('[Orchestrator] SyncService init failed:', err);
    });

    // Forward sync events
    this.sync.on('synced', (item) => {
      console.log(`[Orchestrator] Synced: ${item.id}`);
      this.emit('sync-status', this.sync.getQueueStatus());
    });
    this.sync.on('sync-error', ({ item, error }) => {
      console.error(`[Orchestrator] Sync failed for ${item.id}:`, error);
      this.emit('sync-status', this.sync.getQueueStatus());
    });

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
    this.recorder.start();
    return true;
  }

  stop(): void {
    this.audio.stop();
    // Save audio recording
    const callId = `call-${this.callStartTime}`;
    this.recorder.stop(callId).then(filePath => {
      if (filePath) console.log(`[Orchestrator] Audio saved: ${filePath}`);
    }).catch(() => {});
    this.autoSaveCall();
    this.setState('idle');
  }

  setCallType(type: CallType): void {
    this.coaching.setCallType(type);
  }

  setSessionConfig(config: { meetingName?: string; meetingContext?: string; callType?: string; myRole?: string; participants?: string }): void {
    this.sessionConfig = config;

    // Set call type on speaker identifier for proper default labels
    if (config.callType) {
      this.speakerIdentifier.setCallType(
        config.callType,
        (config.myRole as 'leading' | 'attending') ?? 'leading'
      );
    }

    // Pass all participants to the speaker identifier
    if (config.participants) {
      this.speakerIdentifier.setParticipants(config.participants);
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
    this.sync.shutdown();
    this.llm.destroy();
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
      this.recorder.addChunk(chunk);
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

    const durationMs = Date.now() - this.callStartTime;

    const call: SavedCall = {
      id: `call-${this.callStartTime}`,
      name: this.sessionConfig.meetingName ?? `Call ${new Date(this.callStartTime).toLocaleString()}`,
      date: new Date(this.callStartTime).toISOString(),
      durationMs,
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

      // Run post-call processing (non-blocking, but we await for sync)
      let processed: ProcessedCall | null = null;
      try {
        this.emit('post-call-status', 'Processing call...');
        processed = await this.postProcessor.process(
          transcript,
          call.callType,
          durationMs,
          call.context
        );
        console.log(`[Orchestrator] Post-call processed: ${processed.title} (${processed.cleanTranscript.length} clean segments, ${processed.actionItems.length} action items)`);
        this.emit('post-call-status', 'Done');
        this.emit('post-call-result', processed);
      } catch (err) {
        console.error('[Orchestrator] Post-call processing failed:', err);
        this.emit('post-call-status', 'Processing failed');
      }

      // Queue for cloud sync with processed data
      const talkRatio = this.coaching.getTalkRatio();
      const report: PostCallReport = {
        summary: {
          id: call.id,
          title: processed?.title ?? call.name,
          date: this.callStartTime,
          durationMs,
          callType: call.callType,
          participants: call.participants ? call.participants.split(/[,;]/).map(p => p.trim()) : [],
          topicsCovered: processed?.topics.map(t => t.name) ?? [],
          keyDecisions: processed?.keyTakeaways ?? [],
          overallSentiment: 'neutral',
          synopsis: processed?.summary ?? '',
        },
        score: {
          callId: call.id,
          overall: 0,
          dimensions: [],
          strengths: [],
          improvements: [],
          timestamp: Date.now(),
        },
        actionItems: (processed?.actionItems ?? []).map((a, i) => ({
          id: `action-${Date.now()}-${i}`,
          text: a.text,
          owner: a.owner as 'you' | 'customer' | 'both',
          context: '',
          timestamp: Date.now(),
        })),
        followUpEmail: { subject: '', body: '', actionItems: processed?.nextSteps ?? [], nextSteps: processed?.nextSteps ?? [] },
        talkRatio: { you: talkRatio.you, other: talkRatio.other },
        totalWords: { you: talkRatio.yourWordCount ?? 0, other: talkRatio.otherWordCount ?? 0 },
      };

      // Include processed data in sync (add to report for the API)
      (report as any).processed = processed;
      (report as any).cleanTranscript = processed?.cleanTranscript;

      this.sync.queueCallReport(report).catch(err => {
        console.error('[Orchestrator] Failed to queue sync:', err);
      });
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

  /**
   * Rename a speaker label mid-session (from UI)
   * Sets the default for future "other" segments.
   */
  renameSpeaker(source: 'you' | 'other', name: string): void {
    this.speakerIdentifier.renameSpeaker(source, name);
  }

  /**
   * Rename a specific segment by ID (for multi-speaker support).
   * Only affects that segment and future ones — not all "other" segments.
   */
  renameSegment(segmentId: string, name: string): void {
    this.speakerIdentifier.renameSegment(segmentId, name);
  }

  /**
   * Get current speaker names
   */
  getSpeakerNames(): Record<string, string> {
    return this.speakerIdentifier.getNames();
  }

  // === Cloud Sync ===

  /**
   * Switch LLM provider at runtime
   */
  switchLLMProvider(provider: LLMProvider, apiKey?: string): void {
    this.coaching.switchProvider(provider, apiKey);
  }

  /**
   * Set the auth token for cloud sync (from Cognito)
   */
  setSyncAuthToken(token: string): void {
    this.sync.setAuthToken(token);
  }

  /**
   * Get current sync queue status
   */
  getSyncStatus(): { pending: number; failed: number; total: number } {
    return this.sync.getQueueStatus();
  }

  /**
   * Force process the sync queue now
   */
  async forceSyncNow(): Promise<void> {
    await this.sync.processQueue();
  }
}
