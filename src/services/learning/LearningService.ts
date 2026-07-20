import { EventEmitter } from 'events';
import path from 'path';
import { promises as fs } from 'fs';
import { app } from 'electron';

export interface FeedbackEntry {
  id: string;
  suggestionId: string;
  suggestionType: string;
  feedback: 'positive' | 'negative' | 'used' | 'dismissed';
  timestamp: number;
}

export interface UserProfile {
  vocabulary: Map<string, number>; // word → frequency
  formalityLevel: number; // 0 (casual) to 1 (formal)
  avgSentenceLength: number;
  preferredRole: string;
  commonPhrases: string[];
  topicsOfExpertise: string[];
}

export interface LearnedFAQ {
  question: string;
  answer: string;
  timesUsed: number;
  successRate: number;
  tags: string[];
}

/**
 * AnswerPattern — Extracted from how a skilled person answered a question.
 * Used to coach the user in future calls when similar questions arise.
 */
export interface AnswerPattern {
  id: string;
  /** The question that was asked */
  question: string;
  /** Who answered it well */
  answeredBy: string;
  /** The full answer text */
  answerText: string;
  /** Extracted structure: what made this answer good */
  structure: {
    approach: string;    // How they opened (e.g., "acknowledged the question, then...")
    keyPoints: string[]; // Main points they covered
    technique: string;   // Technique used (analogy, example, step-by-step, etc.)
    tone: string;        // Professional, casual, empathetic, etc.
  };
  /** Context: what call type and topic this was in */
  callType: string;
  topic: string;
  /** When this was learned */
  timestamp: number;
  /** How many times this pattern has been used for coaching */
  timesReferenced: number;
}

/**
 * LearningService - Adaptive personalization engine
 *
 * Tracks:
 * - Which suggestions the user acts on (implicit feedback)
 * - Explicit thumbs up/down on suggestions
 * - User's communication style over time
 * - Successful Q&A pairs for reuse
 *
 * Uses this data to improve future suggestions.
 */
export class LearningService extends EventEmitter {
  private feedback: FeedbackEntry[] = [];
  private profile: UserProfile;
  private faqs: LearnedFAQ[] = [];
  private answerPatterns: AnswerPattern[] = [];
  private dataPath: string;

  constructor() {
    super();
    this.dataPath = path.join(
      app?.getPath('userData') ?? process.cwd(),
      'kira-learning'
    );
    this.profile = {
      vocabulary: new Map(),
      formalityLevel: 0.5,
      avgSentenceLength: 15,
      preferredRole: 'presales',
      commonPhrases: [],
      topicsOfExpertise: [],
    };
  }

  /**
   * Initialize — load persisted learning data
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadData();
    } catch {
      // Start fresh
    }
  }

  /**
   * Record feedback on a suggestion
   */
  async recordFeedback(
    suggestionId: string,
    suggestionType: string,
    feedback: 'positive' | 'negative' | 'used' | 'dismissed'
  ): Promise<void> {
    const entry: FeedbackEntry = {
      id: `fb-${Date.now()}`,
      suggestionId,
      suggestionType,
      feedback,
      timestamp: Date.now(),
    };

    this.feedback.push(entry);
    this.emit('feedback', entry);
    await this.persistData();
  }

  /**
   * Analyze user's speech patterns from transcript segments
   */
  analyzeStyle(userText: string[]): void {
    if (userText.length === 0) return;

    // Update vocabulary
    for (const text of userText) {
      const words = text.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3) {
          const count = this.profile.vocabulary.get(word) ?? 0;
          this.profile.vocabulary.set(word, count + 1);
        }
      }
    }

    // Calculate formality
    const allText = userText.join(' ');
    const formalIndicators = (allText.match(/\b(regarding|therefore|furthermore|consequently|accordingly|however|nevertheless)\b/gi) ?? []).length;
    const casualIndicators = (allText.match(/\b(gonna|wanna|kinda|yeah|cool|awesome|stuff|thing)\b/gi) ?? []).length;
    const total = formalIndicators + casualIndicators;
    if (total > 0) {
      this.profile.formalityLevel = formalIndicators / total;
    }

    // Average sentence length
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0) {
      const totalWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
      this.profile.avgSentenceLength = Math.round(totalWords / sentences.length);
    }

    // Extract common phrases (bigrams that appear 3+ times)
    this.extractCommonPhrases(userText);
  }

  /**
   * Add a successful Q&A pair to learned FAQ
   */
  addLearnedFAQ(question: string, answer: string, tags: string[] = []): void {
    const existing = this.faqs.find(
      f => f.question.toLowerCase() === question.toLowerCase()
    );

    if (existing) {
      existing.timesUsed++;
      existing.successRate = Math.min(1, existing.successRate + 0.1);
    } else {
      this.faqs.push({
        question,
        answer,
        timesUsed: 1,
        successRate: 0.8,
        tags,
      });
    }
  }

  /**
   * Learn from how someone else answered a question.
   * Extracts the pattern so future coaching can say:
   * "Here's how [person] handled a similar question before..."
   */
  addAnswerPattern(pattern: Omit<AnswerPattern, 'id' | 'timestamp' | 'timesReferenced'>): void {
    const entry: AnswerPattern = {
      ...pattern,
      id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      timesReferenced: 0,
    };
    this.answerPatterns.push(entry);
    this.emit('pattern-learned', entry);
    this.persistData();
  }

  /**
   * Get answer patterns relevant to a question/topic.
   * Used by the coaching system to reference past good answers.
   */
  getRelevantPatterns(question: string, callType?: string, limit = 3): AnswerPattern[] {
    const terms = question.toLowerCase().split(/\s+/).filter(t => t.length > 3);

    return this.answerPatterns
      .map(pattern => {
        const searchable = `${pattern.question} ${pattern.topic} ${pattern.structure.keyPoints.join(' ')}`.toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (searchable.includes(term)) score++;
        }
        // Boost score if same call type
        if (callType && pattern.callType === callType) score += 2;
        return { pattern, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => {
        r.pattern.timesReferenced++;
        return r.pattern;
      });
  }

  /**
   * Get all stored answer patterns (for display/export)
   */
  getAllPatterns(): AnswerPattern[] {
    return [...this.answerPatterns];
  }

  /**
   * Get suggestion effectiveness stats
   */
  getSuggestionStats(): Record<string, { total: number; positive: number; rate: number }> {
    const stats: Record<string, { total: number; positive: number; rate: number }> = {};

    for (const fb of this.feedback) {
      if (!stats[fb.suggestionType]) {
        stats[fb.suggestionType] = { total: 0, positive: 0, rate: 0 };
      }
      stats[fb.suggestionType].total++;
      if (fb.feedback === 'positive' || fb.feedback === 'used') {
        stats[fb.suggestionType].positive++;
      }
    }

    for (const type of Object.keys(stats)) {
      stats[type].rate = stats[type].total > 0
        ? Math.round((stats[type].positive / stats[type].total) * 100) / 100
        : 0;
    }

    return stats;
  }

  /**
   * Get the user's communication profile
   */
  getProfile(): Omit<UserProfile, 'vocabulary'> & { topWords: string[] } {
    // Get top 20 words
    const sorted = [...this.profile.vocabulary.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    return {
      formalityLevel: this.profile.formalityLevel,
      avgSentenceLength: this.profile.avgSentenceLength,
      preferredRole: this.profile.preferredRole,
      commonPhrases: this.profile.commonPhrases,
      topicsOfExpertise: this.profile.topicsOfExpertise,
      topWords: sorted.map(([word]) => word),
    };
  }

  /**
   * Set the user's preferred role
   */
  setRole(role: string): void {
    this.profile.preferredRole = role;
  }

  /**
   * Get learned FAQs relevant to a query
   */
  getRelevantFAQs(query: string, limit = 3): LearnedFAQ[] {
    const terms = query.toLowerCase().split(/\s+/);
    return this.faqs
      .map(faq => {
        const searchable = `${faq.question} ${faq.tags.join(' ')}`.toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (searchable.includes(term)) score++;
        }
        return { faq, score: score * faq.successRate };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.faq);
  }

  private extractCommonPhrases(texts: string[]): void {
    const bigrams = new Map<string, number>();
    for (const text of texts) {
      const words = text.toLowerCase().split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
      }
    }

    this.profile.commonPhrases = [...bigrams.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase]) => phrase);
  }

  private async loadData(): Promise<void> {
    try {
      const fbData = await fs.readFile(path.join(this.dataPath, 'feedback.json'), 'utf-8');
      this.feedback = JSON.parse(fbData);
    } catch { /* empty */ }

    try {
      const faqData = await fs.readFile(path.join(this.dataPath, 'faqs.json'), 'utf-8');
      this.faqs = JSON.parse(faqData);
    } catch { /* empty */ }

    try {
      const patternData = await fs.readFile(path.join(this.dataPath, 'answer-patterns.json'), 'utf-8');
      this.answerPatterns = JSON.parse(patternData);
    } catch { /* empty */ }

    try {
      const profileData = await fs.readFile(path.join(this.dataPath, 'profile.json'), 'utf-8');
      const parsed = JSON.parse(profileData);
      this.profile = {
        ...parsed,
        vocabulary: new Map(Object.entries(parsed.vocabulary ?? {})),
      };
    } catch { /* empty */ }
  }

  private async persistData(): Promise<void> {
    try {
      await fs.writeFile(
        path.join(this.dataPath, 'feedback.json'),
        JSON.stringify(this.feedback.slice(-500)) // Keep last 500
      );
      await fs.writeFile(
        path.join(this.dataPath, 'faqs.json'),
        JSON.stringify(this.faqs)
      );
      await fs.writeFile(
        path.join(this.dataPath, 'answer-patterns.json'),
        JSON.stringify(this.answerPatterns.slice(-100)) // Keep last 100 patterns
      );
      await fs.writeFile(
        path.join(this.dataPath, 'profile.json'),
        JSON.stringify({
          ...this.profile,
          vocabulary: Object.fromEntries(this.profile.vocabulary),
        })
      );
    } catch { /* non-critical */ }
  }
}
