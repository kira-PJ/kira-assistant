"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoachingService = void 0;
const events_1 = require("events");
const BedrockClient_1 = require("./BedrockClient");
const TriggerDetector_1 = require("./TriggerDetector");
const PromptTemplates_1 = require("./PromptTemplates");
/**
 * CoachingService - Real-time AI coaching orchestrator
 *
 * Processes transcript segments through trigger detection,
 * routes to appropriate AI agents, and emits coaching suggestions.
 */
class CoachingService extends events_1.EventEmitter {
    bedrock;
    detector;
    callType = 'discovery';
    segments = [];
    suggestions = [];
    suggestionCounter = 0;
    talkRatio = { you: 50, other: 50, yourWordCount: 0, otherWordCount: 0 };
    currentSentiment = null;
    techMentions = [];
    callStartTime = 0;
    lastSuggestionTime = 0;
    minSuggestionInterval = 15000; // 15s between AI calls
    processingLock = false;
    constructor(options = {}) {
        super();
        this.bedrock = new BedrockClient_1.BedrockClient({ region: options.region, modelId: options.modelId });
        this.detector = new TriggerDetector_1.TriggerDetector();
        this.callType = options.callType ?? 'discovery';
        this.callStartTime = Date.now();
    }
    setCallType(type) {
        this.callType = type;
    }
    /**
     * Process a new transcript segment — main entry point
     */
    async processSegment(segment) {
        this.segments.push(segment);
        this.updateTalkRatio(segment);
        // Detect tech mentions (sync, no AI needed)
        const techMentions = this.detector.detectTechMentions(segment);
        for (const mention of techMentions) {
            this.techMentions.push(mention);
            this.emit('tech-mention', mention);
            this.queueTechLookup(mention);
        }
        // Detect questions from customer
        if (this.detector.isQuestion(segment)) {
            this.queueAnswerQuestion(segment.text);
        }
        // Periodic AI triggers (rate-limited)
        await this.maybeRunPeriodicChecks(segment);
    }
    /**
     * Get current coaching context for prompts
     */
    getContext() {
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
    updateTalkRatio(segment) {
        const words = segment.text.split(/\s+/).length;
        if (segment.speaker === 'you') {
            this.talkRatio.yourWordCount += words;
        }
        else {
            this.talkRatio.otherWordCount += words;
        }
        const total = this.talkRatio.yourWordCount + this.talkRatio.otherWordCount;
        if (total > 0) {
            this.talkRatio.you = Math.round((this.talkRatio.yourWordCount / total) * 100);
            this.talkRatio.other = 100 - this.talkRatio.you;
        }
        this.emit('talk-ratio', this.talkRatio);
    }
    async maybeRunPeriodicChecks(segment) {
        const now = Date.now();
        if (now - this.lastSuggestionTime < this.minSuggestionInterval)
            return;
        if (this.processingLock)
            return;
        this.processingLock = true;
        this.lastSuggestionTime = now;
        try {
            // Run sentiment analysis every few segments
            if (this.segments.length % 5 === 0) {
                await this.runSentimentAnalysis();
            }
            // Question suggestions every ~30s
            if (this.segments.length % 8 === 0) {
                await this.runQuestionSuggestions();
            }
        }
        catch (err) {
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
        }
        finally {
            this.processingLock = false;
        }
    }
    async runSentimentAnalysis() {
        const recentOther = this.segments
            .filter(s => s.speaker === 'other')
            .slice(-5)
            .map(s => s.text)
            .join(' ');
        if (recentOther.length < 20)
            return;
        // First try local detection
        const local = this.detector.analyzeSentiment(recentOther);
        // If ambiguous, ask Bedrock
        if (local.confidence < 0.6 && recentOther.length > 50) {
            const systemPrompt = PromptTemplates_1.PromptTemplates.getSystemPrompt(this.callType);
            const prompt = PromptTemplates_1.PromptTemplates.sentimentPrompt(recentOther);
            const result = await this.bedrock.converseJSON(systemPrompt, prompt);
            if (result) {
                this.currentSentiment = {
                    sentiment: result.sentiment,
                    confidence: result.confidence,
                    reason: result.reason,
                    timestamp: Date.now(),
                };
                this.emit('sentiment', this.currentSentiment);
            }
        }
        else {
            this.currentSentiment = {
                sentiment: local.sentiment,
                confidence: local.confidence,
                reason: 'Local analysis',
                timestamp: Date.now(),
            };
            this.emit('sentiment', this.currentSentiment);
        }
    }
    async runQuestionSuggestions() {
        const context = this.getContext();
        if (context.recentTranscript.length < 50)
            return;
        const systemPrompt = PromptTemplates_1.PromptTemplates.getSystemPrompt(this.callType);
        const prompt = PromptTemplates_1.PromptTemplates.questionSuggestionPrompt(context);
        const result = await this.bedrock.converseJSON(systemPrompt, prompt);
        if (result?.questions) {
            for (const q of result.questions) {
                this.emitSuggestion({
                    type: 'question',
                    title: 'Try asking',
                    content: q.question,
                    priority: q.priority ?? 'medium',
                    metadata: { reason: q.reason },
                });
            }
        }
    }
    async queueTechLookup(mention) {
        const context = this.getContext();
        const systemPrompt = PromptTemplates_1.PromptTemplates.getSystemPrompt(this.callType);
        const prompt = PromptTemplates_1.PromptTemplates.techContextPrompt(mention.term, mention.context);
        try {
            const result = await this.bedrock.converseJSON(systemPrompt, prompt);
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
        }
        catch {
            // Non-critical, silently fail
        }
    }
    async queueAnswerQuestion(question) {
        const context = this.getContext();
        const systemPrompt = PromptTemplates_1.PromptTemplates.getSystemPrompt(this.callType);
        const prompt = PromptTemplates_1.PromptTemplates.answerQuestionPrompt(question, context.recentTranscript);
        try {
            const result = await this.bedrock.converseJSON(systemPrompt, prompt);
            if (result) {
                this.emitSuggestion({
                    type: 'answer',
                    title: 'Customer asked',
                    content: `${result.simpleAnswer}\n\nKey points: ${result.keyDetails?.join(', ')}`,
                    priority: 'high',
                    metadata: { avoid: result.avoid, confidence: result.confidence },
                });
            }
        }
        catch {
            // Non-critical
        }
    }
    emitSuggestion(partial) {
        this.suggestionCounter++;
        const suggestion = {
            id: `sug-${Date.now()}-${this.suggestionCounter}`,
            timestamp: Date.now(),
            ...partial,
        };
        this.suggestions.push(suggestion);
        this.emit('suggestion', suggestion);
    }
    getSuggestions() {
        return [...this.suggestions];
    }
    getTalkRatio() {
        return { ...this.talkRatio };
    }
    getCurrentSentiment() {
        return this.currentSentiment;
    }
    /**
     * Reset state for a new call
     */
    reset() {
        this.segments = [];
        this.suggestions = [];
        this.techMentions = [];
        this.talkRatio = { you: 50, other: 50, yourWordCount: 0, otherWordCount: 0 };
        this.currentSentiment = null;
        this.callStartTime = Date.now();
        this.lastSuggestionTime = 0;
        this.suggestionCounter = 0;
    }
    /**
     * Cleanup resources
     */
    destroy() {
        this.bedrock.destroy();
    }
}
exports.CoachingService = CoachingService;
