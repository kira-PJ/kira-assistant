import { EventEmitter } from 'events';
import { TranscriptSegment } from '../transcription/types';
import { ILLMClient, LLMClientOptions, LLMProvider, createLLMClient } from './LLMClient';
import { TriggerDetector } from './TriggerDetector';
import { PromptTemplates } from './PromptTemplates';
import { LearningService, AnswerPattern } from '../learning/LearningService';
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
 * Supports multiple LLM providers: Bedrock (Claude), Groq (Llama), Gemini.
 */
export class CoachingService extends EventEmitter {
  private llm: ILLMClient;
  private llmOptions: LLMClientOptions;
  private detector: TriggerDetector;
  private learning: LearningService;
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
  private silenceThresholdMs = 15000; // 15s of silence triggers suggestion (was 8s — too noisy)
  private lastSummaryTime = 0;
  private summaryInterval = 300000; // 5 minutes between summaries
  private meetingContext: { name?: string; context?: string; myRole?: string; participants?: string } = {};

  constructor(options: {
    region?: string;
    modelId?: string;
    callType?: CallType;
    llmProvider?: LLMProvider;
    groqApiKey?: string;
    geminiApiKey?: string;
  } = {}) {
    super();
    this.llmOptions = {
      provider: options.llmProvider ?? 'bedrock',
      awsRegion: options.region,
      bedrockModelId: options.modelId,
      groqApiKey: options.groqApiKey,
      geminiApiKey: options.geminiApiKey,
    };
    this.llm = createLLMClient(this.llmOptions);
    this.detector = new TriggerDetector();
    this.learning = new LearningService();
    this.learning.initialize();
    this.callType = options.callType ?? 'discovery';
    this.callStartTime = Date.now();
  }

  /**
   * Switch LLM provider at runtime (from settings)
   */
  switchProvider(provider: LLMProvider, apiKey?: string): void {
    this.llm.destroy();
    if (provider === 'groq' && apiKey) this.llmOptions.groqApiKey = apiKey;
    if (provider === 'gemini' && apiKey) this.llmOptions.geminiApiKey = apiKey;
    this.llmOptions.provider = provider;
    this.llm = createLLMClient(this.llmOptions);
    console.log(`[Coaching] Switched LLM provider to: ${provider}`);
  }

  setCallType(type: CallType): void {
    this.callType = type;
  }

  /**
   * Set meeting context — provides the AI with background info
   * to generate more relevant suggestions and reduce hallucinations
   */
  setMeetingContext(ctx: { name?: string; context?: string; myRole?: string; participants?: string }): void {
    this.meetingContext = ctx;
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

    // Detect tech mentions (deduplicated — only emit once per term)
    const techMentions = this.detector.detectTechMentions(segment);
    for (const mention of techMentions) {
      const alreadySeen = this.techMentions.some(m => m.term.toLowerCase() === mention.term.toLowerCase());
      this.techMentions.push(mention);
      if (!alreadySeen) {
        this.emit('tech-mention', mention);
        this.queueTechLookup(mention);
      }
    }

    // Detect questions — DON'T fire immediately.
    // Buffer detected questions and fire after a pause (next segment from same speaker
    // or 3s timeout means the question is complete)
    if (this.detector.isQuestion(segment) && segment.speaker !== 'you') {
      this.pendingQuestion = segment.text;
      this.pendingQuestionTime = Date.now();
    } else if (this.pendingQuestion && segment.speaker === 'you') {
      // User started speaking — they're about to answer. Fire the answer help NOW.
      this.fireQuestionAnswer(this.pendingQuestion);
      this.pendingQuestion = null;
    } else if (this.pendingQuestion && segment.speaker !== 'you') {
      // Same speaker continued — they're still asking. Append to question.
      this.pendingQuestion += ' ' + segment.text;
      this.pendingQuestionTime = Date.now();
    }

    // Auto-detect call type at multiple points for better accuracy
    if (this.segments.length === 3 || this.segments.length === 8 || this.segments.length === 15) {
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

  private pendingQuestion: string | null = null;
  private pendingQuestionTime = 0;
  private lastDetectedQuestion: string | null = null; // Track for learning

  private fireQuestionAnswer(question: string): void {
    // Only fire if enough context (at least 5 segments in the call)
    if (this.segments.length < 5) return;
    this.lastDetectedQuestion = question;
    this.queueAnswerQuestion(question);
  }

  /**
   * Detect and learn from good answers given by others.
   * Called periodically to check if a Q&A pair just completed.
   */
  private detectAndLearnFromAnswer(): void {
    if (!this.lastDetectedQuestion) return;
    if (this.segments.length < 3) return;

    // Look for the pattern: question was asked → someone gave a substantial answer
    const recentSegments = this.segments.slice(-8);
    const answerSegments = recentSegments.filter(s => s.speaker !== 'you');

    // Need at least 3 answer segments totaling 50+ words to consider it a "good answer"
    const answerText = answerSegments.map(s => s.text).join(' ');
    const wordCount = answerText.split(/\s+/).length;

    if (wordCount >= 50 && answerSegments.length >= 2) {
      const answeredBy = answerSegments[0]?.speakerName ?? 'Unknown';

      // Extract pattern asynchronously (non-blocking)
      this.extractAnswerPattern(this.lastDetectedQuestion, answerText, answeredBy).catch(() => {});
      this.lastDetectedQuestion = null; // Don't learn from same question twice
    }
  }

  /**
   * Use LLM to extract the answer pattern structure
   */
  private async extractAnswerPattern(question: string, answerText: string, answeredBy: string): Promise<void> {
    const prompt = `A question was asked and someone gave a good answer. Extract the pattern of HOW they answered so we can coach someone to answer similarly in the future.

Question: "${question}"
Answer by ${answeredBy}: "${answerText.slice(0, 1000)}"

Extract the answering pattern:

Respond with JSON:
{
  "approach": "How they opened/structured their answer (e.g., 'Started with acknowledgment, then gave context, then specifics')",
  "keyPoints": ["main point 1", "main point 2"],
  "technique": "The technique they used (e.g., analogy, step-by-step breakdown, real example, comparison)",
  "tone": "The tone they used (e.g., confident, empathetic, educational)",
  "topic": "The general topic area"
}`;

    try {
      const result = await this.llm.converseJSON<{
        approach: string;
        keyPoints: string[];
        technique: string;
        tone: string;
        topic: string;
      }>('You extract communication patterns from conversations. Be concise.', prompt);

      if (result) {
        this.learning.addAnswerPattern({
          question,
          answeredBy,
          answerText: answerText.slice(0, 2000),
          structure: {
            approach: result.approach,
            keyPoints: result.keyPoints,
            technique: result.technique,
            tone: result.tone,
          },
          callType: this.callType,
          topic: result.topic,
        });
        console.log(`[Coaching] Learned answer pattern from ${answeredBy}: ${result.technique}`);
      }
    } catch { /* non-critical */ }
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
      const result = await this.llm.converseJSON<{
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
    let recentTranscript = recentSegments
      .map(s => `[${s.speakerName}]: ${s.text}`)
      .join('\n');

    // Prepend meeting context for better AI accuracy
    if (this.meetingContext.context) {
      recentTranscript = `[MEETING CONTEXT: ${this.meetingContext.context}]\n[MY ROLE: ${this.meetingContext.myRole ?? 'leading'}]\n[PARTICIPANTS: ${this.meetingContext.participants ?? 'unknown'}]\n\n${recentTranscript}`;
    }

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
    // Minimum 20 seconds between any AI suggestions
    if (now - this.lastSuggestionTime < 20000) return;
    if (this.processingLock) return;

    // If we're attending (not leading), be VERY conservative
    // Only run checks if explicitly addressed or after long stretches
    const isAttending = this.meetingContext.myRole === 'attending';

    this.processingLock = true;
    this.lastSuggestionTime = now;

    try {
      // Sentiment analysis: every 15 segments
      if (this.segments.length >= 5 && this.segments.length % 15 === 0) {
        await this.runSentimentAnalysis();
      }

      // Question suggestions — VERY conservative for attending roles
      // Attending: every 30 segments (basically never unless it's truly relevant)
      // Training: every 25 segments
      // Discovery (leading): every 12 segments
      // Others: every 18 segments
      const questionInterval = isAttending ? 30
        : this.callType === 'training' ? 25
        : this.callType === 'discovery' ? 12
        : 18;

      const recentOtherSegments = this.segments.slice(-questionInterval).filter(s => s.speaker !== 'you');
      const hasEnoughContext = recentOtherSegments.length >= 5;
      const lastSegmentIsOther = this.segments[this.segments.length - 1]?.speaker !== 'you';

      if (this.segments.length >= 8 && this.segments.length % questionInterval === 0 && hasEnoughContext && lastSegmentIsOther) {
        await this.runQuestionSuggestions();
      }

      // Fire pending question if sitting 3+ seconds without user speaking
      if (this.pendingQuestion && Date.now() - this.pendingQuestionTime > 3000) {
        this.fireQuestionAnswer(this.pendingQuestion);
        this.pendingQuestion = null;
      }

      // Check if a Q&A pair just completed — learn from good answers
      this.detectAndLearnFromAnswer();
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
      const result = await this.llm.converseJSON<{
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

    const result = await this.llm.converseJSON<{
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
      const result = await this.llm.converseJSON<{
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

    // Check if we have learned patterns for similar questions
    const relevantPatterns = this.learning.getRelevantPatterns(question, this.callType, 2);
    let patternContext = '';
    if (relevantPatterns.length > 0) {
      patternContext = '\n\nPREVIOUS GOOD ANSWERS (learn from these patterns):\n' +
        relevantPatterns.map(p =>
          `- ${p.answeredBy} answered "${p.question.slice(0, 60)}..." using technique: ${p.structure.technique}. ` +
          `Approach: ${p.structure.approach}. Key points: ${p.structure.keyPoints.join(', ')}`
        ).join('\n');
    }

    const prompt = PromptTemplates.answerQuestionPrompt(question, context.recentTranscript + patternContext, this.callType);

    try {
      const result = await this.llm.converseJSON<{
        what?: string;
        why?: string;
        how?: string;
        example?: string;
        simpleAnswer: string;
        keyDetails: string[];
        avoid: string;
        confidence: string;
        isRhetorical?: boolean;
      }>(systemPrompt, prompt);

      if (result) {
        // Build rich content with the structured answer
        let content = result.simpleAnswer;
        if (result.what) content += `\n\nWhat: ${result.what}`;
        if (result.why) content += `\nWhy: ${result.why}`;
        if (result.how) content += `\nHow: ${result.how}`;
        if (result.example) content += `\nExample: ${result.example}`;

        this.emitSuggestion({
          type: 'answer',
          title: 'Question detected',
          content,
          priority: 'high',
          metadata: {
            avoid: result.avoid,
            confidence: result.confidence,
            what: result.what,
            why: result.why,
            how: result.how,
            example: result.example,
            keyDetails: result.keyDetails,
            isRhetorical: result.isRhetorical,
          },
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
    this.llm.destroy();
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
    if (this.segments.length < 3) return;

    // Check for call-end signals in the last few segments
    const lastSegments = this.segments.slice(-5).map(s => s.text.toLowerCase()).join(' ');
    const farewellPatterns = /\b(thank you|thanks everyone|bye|goodbye|talk later|have a good|take care|cheers|see you|that's all|wrap up|end the call)\b/i;
    if (farewellPatterns.test(lastSegments)) {
      // Likely end of call — emit event for auto-stop
      this.emit('call-ending-detected');
      console.log('[Coaching] Call-end phrases detected after silence');
      return; // Don't suggest anything during farewell
    }

    // Only suggest during pauses if we're leading (not attending)
    if (this.meetingContext.myRole === 'attending') return;

    const context = this.getContext();
    const systemPrompt = PromptTemplates.getSystemPrompt(this.callType);
    const prompt = `There's been a pause in the conversation (15+ seconds of silence).

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
      const result = await this.llm.converseJSON<{
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
      const result = await this.llm.converseJSON<{
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
    const earlyText = this.segments.slice(0, Math.min(15, this.segments.length)).map(s => s.text).join(' ');

    const lower = earlyText.toLowerCase();
    let detected: CallType | null = null;
    let detectedRole: 'leading' | 'attending' | null = null;

    // Detect call type
    if (/demo|show you|walk.*through|let me demonstrate|presentation/i.test(lower)) {
      detected = 'demo';
    } else if (/training|learn|course|module|exercise|teach|workshop/i.test(lower)) {
      detected = 'training';
    } else if (/follow.?up|last time|action items|checking in|catch up/i.test(lower)) {
      detected = 'followup';
    } else if (/price|cost|contract|discount|negotiate|proposal|pricing/i.test(lower)) {
      detected = 'negotiation';
    } else if (/architecture|technical|deep.?dive|implement|design|solution/i.test(lower)) {
      detected = 'technical';
    } else if (/tell me about|challenges|looking for|evaluate|pain point|discovery|understand.*needs/i.test(lower)) {
      detected = 'discovery';
    }

    // Detect role — if "you" segments are mostly short responses, you're attending
    const youSegments = this.segments.filter(s => s.speaker === 'you');
    const otherSegments = this.segments.filter(s => s.speaker !== 'you');
    if (youSegments.length > 0 && otherSegments.length > 0) {
      const youWords = youSegments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
      const otherWords = otherSegments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
      // If others talk 3x more than you, you're probably attending
      if (otherWords > youWords * 3) {
        detectedRole = 'attending';
      } else if (youWords > otherWords * 2) {
        detectedRole = 'leading';
      }
    }

    if (detected && detected !== this.callType) {
      this.callType = detected;
      this.emit('call-type-detected', detected);
      console.log(`[Coaching] Auto-detected call type: ${detected}`);
    }
    if (detectedRole) {
      this.emit('role-detected', detectedRole);
    }
  }
}
