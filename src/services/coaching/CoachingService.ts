import { EventEmitter } from 'events';
import { TranscriptSegment } from '../transcription/types';
import { BedrockClient } from './BedrockClient';
import { TriggerDetector } from './TriggerDetector';
import { PromptTemplates } from './PromptTemplates';
import {
  CallType,
  CoachingContext,
  CoachingSuggestion,
  SentimentAnalysis,
  TalkRatioData,
  ActionItemData,
  TechMention,
} from './types';

/**
 * CoachingService - Real-time AI coaching orchestrator
 *
 * Processes transcript segments through trigger detection,
 * routes to appropriate AI agents, and emits coaching suggestions.
 */
export class CoachingService extends EventEmitter {
  private bedrock: BedrockClient;
  private detector: TriggerDetector;
  private callType: CallType = 'discovery';
  private segments: TranscriptSegment[] = [];
  private suggestions: CoachingSuggestion[] = [];
  private suggestionCounter = 0;
  private talkRatio: TalkRatioData = { you: 50, other: 50, yourWordCount: 0, otherWordCount: 0 };
  private currentSentiment: SentimentAnalysis | null = null;
  private techMentions: TechMention[] = [];
  private callStartTime = 0;
  private lastSuggestionTime = 0;
  private minSuggestionInterval = 5000; // 5s between periodic suggestions
  private processingLock = false;
  private lastSegmentTime = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceThresholdMs = 8000; // 8s of silence triggers suggestion
  private lastSummaryTime = 0;
  private summaryInterval = 300000; // 5 minutes between summaries

  constructor(options: { region?: string; modelId?: string; callType?: CallType } = {}) {
    super();
    this.bedrock = new BedrockClient({ region: options.region, modelId: options.modelId });
    this.detector = new TriggerDetector();
    this.callType = options.callType ?? 'discovery';
    this.callStartTime = Date.now();
  }

  setCallType(type: CallType): void {
    this.callType = type;
  }

  /**
   * Process a new transcript segment — main entry point
   */
  async processSegment(segment: TranscriptSegment): Promise<void> {
    // Skip partial results for AI processing (only use finals)
    if (segment.isPartial) return;

    this.segments.push(segment);
    this.updateTalkRatio(segment);
    this.resetSilenceTimer();

    // Detect tech mentions (sync, no AI needed)
    const techMentions = this.detector.detectTechMentions(segment);
    for (const mention of techMentions) {
      this.techMentions.push(mention);
      this.emit('tech-mention', mention);
      this.queueTechLookup(mention); // fires immediately, no cooldown
    }

    // Detect questions from customer — fires IMMEDIATELY (no cooldown)
    if (this.detector.isQuestion(segment)) {
      this.queueAnswerQuestion(segment.text);
    }

    // Auto-detect call type from first few segments
    if (this.segments.length === 3) {
      this.autoDetectCallType();
    }

    // Periodic AI triggers (rate-limited to avoid spam)
    await this.maybeRunPeriodicChecks(segment);

    // Periodic summary
    const now = Date.now();
    if (now - this.lastSummaryTime > this.summaryInterval && this.segments.length > 20) {
      this.lastSummaryTime = now;
      this.runSummaryAgent();
    }
  }

  /**
   * Manual AI trigger — user asks a free-form question via hotkey
   */
  async manualAsk(question: string): Promise<void> {
    const context = this.getContext();
    const systemPrompt = PromptTemplates.getSystemPrompt(this.callType);
    const prompt = `The user pressed a hotkey and asked: "${question}"

Current call context:
${context.recentTranscript}

Provide a helpful, concise answer they can use immediately.

Respond with JSON:
{
  "answer": "...",
  "sources": []
}`;

    try {
      const result = await this.bedrock.converseJSON<{
        answer: string;
        sources: string[];
      }>(systemPrompt, prompt);

      if (result) {
        this.emitSuggestion({
          type: 'answer',
          title: `You asked: ${question.slice(0, 40)}...`,
          content: result.answer,
          priority: 'high',
          sources: result.sources,
        });
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Get current coaching context for prompts
   */
  private getContext(): CoachingContext {
    const recentSegments = this.segments.slice(-20);
    const recentTranscript = recentSegments
      .map(s => `[${s.speakerName}]: ${s.text}`)
      .join('\n');

    return {
      callType: this.callType,
      recentTranscript,
      fullTranscriptLength: this.segments.length,
      talkRatio: this.talkRatio,
      detectedTech: this.techMentions.slice(-5),
      currentSentiment: this.currentSentiment ?? undefined,
      callDurationMs: Date.now() - this.callStartTime,
      segmentCount: this.segments.length,
    };
  }

  private updateTalkRatio(segment: TranscriptSegment): void {
    const words = segment.text.split(/\s+/).length;
    if (segment.speaker === 'you') {
      this.talkRatio.yourWordCount += words;
    } else {
      this.talkRatio.otherWordCount += words;
    }
    const total = this.talkRatio.yourWordCount + this.talkRatio.otherWordCount;
    if (total > 0) {
      this.talkRatio.you = Math.round((this.talkRatio.yourWordCount / total) * 100);
      this.talkRatio.other = 100 - this.talkRatio.you;
    }
    this.emit('talk-ratio', this.talkRatio);
  }

  private async maybeRunPeriodicChecks(segment: TranscriptSegment): Promise<void> {
    const now = Date.now();
    if (now - this.lastSuggestionTime < this.minSuggestionInterval) return;
    if (this.processingLock) return;

    this.processingLock = true;
    this.lastSuggestionTime = now;

    try {
      // Run sentiment analysis every 3 segments (not 5)
      if (this.segments.length >= 3 && this.segments.length % 3 === 0) {
        await this.runSentimentAnalysis();
      }

      // Question suggestions every 4 segments (not 8)
      if (this.segments.length >= 3 && this.segments.length % 4 === 0) {
        await this.runQuestionSuggestions();
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.processingLock = false;
    }
  }

  private async runSentimentAnalysis(): Promise<void> {
    const recentOther = this.segments
      .filter(s => s.speaker === 'other')
      .slice(-5)
      .map(s => s.text)
      .join(' ');

    if (recentOther.length < 20) return;

    // First try local detection
    const local = this.detector.analyzeSentiment(recentOther);

    // If ambiguous, ask Bedrock
    if (local.confidence < 0.6 && recentOther.length > 50) {
      const systemPrompt = PromptTemplates.getSystemPrompt(this.callType);
      const prompt = PromptTemplates.sentimentPrompt(recentOther);
      const result = await this.bedrock.converseJSON<{
        sentiment: string;
        confidence: number;
        reason: string;
        suggestion: string;
      }>(systemPrompt, prompt);

      if (result) {
        this.currentSentiment = {
          sentiment: result.sentiment as any,
          confidence: result.confidence,
          reason: result.reason,
          timestamp: Date.now(),
        };
        this.emit('sentiment', this.currentSentiment);
      }
    } else {
      this.currentSentiment = {
        sentiment: local.sentiment,
        confidence: local.confidence,
        reason: 'Local analysis',
        timestamp: Date.now(),
      };
      this.emit('sentiment', this.currentSentiment);
    }
  }

  private async runQuestionSuggestions(): Promise<void> {
    const context = this.getContext();
    if (context.recentTranscript.length < 50) return;

    const systemPrompt = PromptTemplates.getSystemPrompt(this.callType);
    const prompt = PromptTemplates.questionSuggestionPrompt(context);

    const result = await this.bedrock.converseJSON<{
      questions: { question: string; reason: string; priority: string }[];
    }>(systemPrompt, prompt);

    if (result?.questions) {
      for (const q of result.questions) {
        this.emitSuggestion({
          type: 'question',
          title: 'Try asking',
          content: q.question,
          priority: (q.priority as any) ?? 'medium',
          metadata: { reason: q.reason },
        });
      }
    }
  }

  private async queueTechLookup(mention: TechMention): Promise<void> {
    const context = this.getContext();
    const systemPrompt = PromptTemplates.getSystemPrompt(this.callType);
    const prompt = PromptTemplates.techContextPrompt(mention.term, mention.context);

    try {
      const result = await this.bedrock.converseJSON<{
        title: string;
        explanation: string;
        awsRelevance: string;
        talkingPoints: string[];
        links: { label: string; url: string }[];
      }>(systemPrompt, prompt);

      if (result) {
        this.emitSuggestion({
          type: 'context',
          title: result.title,
          content: `${result.explanation}\n\nAWS: ${result.awsRelevance}`,
          priority: 'medium',
          sources: result.links?.map(l => l.url),
          metadata: { talkingPoints: result.talkingPoints },
        });
      }
    } catch {
      // Non-critical, silently fail
    }
  }

  private async queueAnswerQuestion(question: string): Promise<void> {
    const context = this.getContext();
    const systemPrompt = PromptTemplates.getSystemPrompt(this.callType);
    const prompt = PromptTemplates.answerQuestionPrompt(question, context.recentTranscript);

    try {
      const result = await this.bedrock.converseJSON<{
        simpleAnswer: string;
        keyDetails: string[];
        avoid: string;
        confidence: string;
      }>(systemPrompt, prompt);

      if (result) {
        this.emitSuggestion({
          type: 'answer',
          title: 'Customer asked',
          content: `${result.simpleAnswer}\n\nKey points: ${result.keyDetails?.join(', ')}`,
          priority: 'high',
          metadata: { avoid: result.avoid, confidence: result.confidence },
        });
      }
    } catch {
      // Non-critical
    }
  }

  private emitSuggestion(partial: Omit<CoachingSuggestion, 'id' | 'timestamp'>): void {
    this.suggestionCounter++;
    const suggestion: CoachingSuggestion = {
      id: `sug-${Date.now()}-${this.suggestionCounter}`,
      timestamp: Date.now(),
      ...partial,
    };
    this.suggestions.push(suggestion);
    this.emit('suggestion', suggestion);
  }

  getSuggestions(): CoachingSuggestion[] {
    return [...this.suggestions];
  }

  getTalkRatio(): TalkRatioData {
    return { ...this.talkRatio };
  }

  getCurrentSentiment(): SentimentAnalysis | null {
    return this.currentSentiment;
  }

  /**
   * Reset state for a new call
   */
  reset(): void {
    this.segments = [];
    this.suggestions = [];
    this.techMentions = [];
    this.talkRatio = { you: 50, other: 50, yourWordCount: 0, otherWordCount: 0 };
    this.currentSentiment = null;
    this.callStartTime = Date.now();
    this.lastSuggestionTime = 0;
    this.lastSummaryTime = 0;
    this.suggestionCounter = 0;
    this.clearSilenceTimer();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clearSilenceTimer();
    this.bedrock.destroy();
  }

  // === Silence/Pause Detection ===

  private resetSilenceTimer(): void {
    this.lastSegmentTime = Date.now();
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => this.onSilenceDetected(), this.silenceThresholdMs);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private async onSilenceDetected(): Promise<void> {
    // Silence = opportunity for a suggestion
    if (this.segments.length < 3) return;

    const context = this.getContext();
    const systemPrompt = PromptTemplates.getSystemPrompt(this.callType);
    const prompt = `There's been a pause in the conversation (8+ seconds of silence).

Context so far:
${context.recentTranscript}

This is a good moment to suggest what the user should say next. Maybe a follow-up question, a summary of what's been discussed, or a transition to a new topic.

Respond with JSON:
{
  "suggestion": "What to say or do during this pause",
  "type": "question|action",
  "reason": "Why this is appropriate right now"
}`;

    try {
      const result = await this.bedrock.converseJSON<{
        suggestion: string;
        type: string;
        reason: string;
      }>(systemPrompt, prompt);

      if (result) {
        this.emitSuggestion({
          type: (result.type as any) ?? 'question',
          title: '💭 Pause opportunity',
          content: result.suggestion,
          priority: 'medium',
          metadata: { reason: result.reason, trigger: 'silence' },
        });
      }
    } catch { /* non-critical */ }
  }

  // === Summary Agent ===

  private async runSummaryAgent(): Promise<void> {
    const context = this.getContext();
    if (context.recentTranscript.length < 100) return;

    const allTranscript = this.segments
      .map(s => `[${s.speakerName}]: ${s.text}`)
      .join('\n')
      .slice(-4000);

    const systemPrompt = 'You are an expert call summarizer. Be concise and structured.';
    const prompt = `Provide a brief "story so far" summary of this ${this.callType} call.
Duration: ${Math.round(context.callDurationMs / 60000)} minutes
Talk ratio: You ${context.talkRatio.you}% / Customer ${context.talkRatio.other}%

Transcript:
${allTranscript}

Respond with JSON:
{
  "summary": "2-3 sentence summary of where the conversation is at",
  "keyPoints": ["point 1", "point 2"],
  "uncovered": ["topics/questions not yet addressed"]
}`;

    try {
      const result = await this.bedrock.converseJSON<{
        summary: string;
        keyPoints: string[];
        uncovered: string[];
      }>(systemPrompt, prompt);

      if (result) {
        const uncoveredStr = result.uncovered?.length
          ? `\n\nNot yet covered: ${result.uncovered.join(', ')}`
          : '';

        this.emitSuggestion({
          type: 'action',
          title: '📋 Story so far',
          content: `${result.summary}${uncoveredStr}`,
          priority: 'low',
          metadata: { keyPoints: result.keyPoints, trigger: 'summary' },
        });
      }
    } catch { /* non-critical */ }
  }

  // === Call Type Auto-Detection ===

  private async autoDetectCallType(): Promise<void> {
    const earlyText = this.segments.slice(0, 5).map(s => s.text).join(' ');

    // Simple heuristic detection first
    const lower = earlyText.toLowerCase();
    let detected: CallType | null = null;

    if (/demo|show you|walk.*through|let me demonstrate/i.test(lower)) {
      detected = 'demo';
    } else if (/training|learn|course|module|exercise/i.test(lower)) {
      detected = 'training';
    } else if (/follow.?up|last time|action items|checking in/i.test(lower)) {
      detected = 'followup';
    } else if (/price|cost|contract|discount|negotiate|proposal/i.test(lower)) {
      detected = 'negotiation';
    } else if (/architecture|technical|deep.?dive|implement|design/i.test(lower)) {
      detected = 'technical';
    } else if (/tell me about|challenges|looking for|evaluate|pain point/i.test(lower)) {
      detected = 'discovery';
    }

    if (detected && detected !== this.callType) {
      this.callType = detected;
      this.emit('call-type-detected', detected);
    }
  }
}
