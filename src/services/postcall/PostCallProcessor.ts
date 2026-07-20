import { TranscriptSegment } from '../transcription/types';
import { ILLMClient } from '../coaching/LLMClient';

/**
 * Processed call output — the cleaned-up, AI-enhanced version
 * of a raw transcript. Think Otter.ai-style post-call notes.
 */
export interface ProcessedCall {
  /** Short descriptive title */
  title: string;
  /** 2-4 sentence executive summary */
  summary: string;
  /** Key topics discussed, grouped */
  topics: { name: string; description: string }[];
  /** Action items with owners */
  actionItems: { text: string; owner: string; dueDate?: string }[];
  /** Key takeaways / decisions */
  keyTakeaways: string[];
  /** Cleaned transcript — filler removed, grouped by topic flow */
  cleanTranscript: CleanSegment[];
  /** Next steps */
  nextSteps: string[];
  /** Processing metadata */
  processedAt: number;
}

export interface CleanSegment {
  speaker: string;
  speakerName: string;
  text: string;
  timestamp: number;
}

// Filler words/phrases to strip
const FILLER_PATTERNS = [
  /^\s*(uh|um|hmm|mhm|mm|ah|oh|er|erm|like,?\s*)+\s*$/i,
  /^\s*(yeah|yes|yep|yup|okay|ok|right|sure)\s*[.,]?\s*$/i,
  /^\s*(so|well|anyway|basically)\s*[.,]?\s*$/i,
  /^\s*\.?\s*$/,
];

// Filler within text to clean (not remove entire segment)
const INLINE_FILLERS = [
  /\b(uh|um|hmm|er|erm)\b\s*/gi,
  /\b(you know|I mean|kind of|sort of|like)\b\s*,?\s*/gi,
  /\s{2,}/g,
];

/**
 * PostCallProcessor — Runs after a call ends to produce clean, actionable notes.
 *
 * Pipeline:
 * 1. Filter out noise segments (very short, filler-only)
 * 2. Clean remaining segments (strip filler words inline)
 * 3. Merge consecutive same-speaker segments
 * 4. Send to LLM for summary, topics, action items, takeaways
 * 5. Return structured ProcessedCall
 */
export class PostCallProcessor {
  private llm: ILLMClient;

  constructor(llm: ILLMClient) {
    this.llm = llm;
  }

  /**
   * Process a completed call's transcript into clean structured output
   */
  async process(
    segments: TranscriptSegment[],
    callType: string,
    durationMs: number,
    context?: string
  ): Promise<ProcessedCall> {
    // Step 1-3: Clean the transcript locally (no LLM needed)
    const cleaned = this.cleanTranscript(segments);

    // Step 4: LLM analysis
    const analysis = await this.analyzeWithLLM(cleaned, callType, durationMs, context);

    return {
      ...analysis,
      cleanTranscript: cleaned,
      processedAt: Date.now(),
    };
  }

  /**
   * Clean transcript: remove filler segments, strip filler words, merge speakers
   */
  cleanTranscript(segments: TranscriptSegment[]): CleanSegment[] {
    // Only work with final (non-partial) segments
    const finals = segments.filter(s => !s.isPartial);

    // Remove pure filler segments
    const meaningful = finals.filter(s => {
      const text = s.text.trim();
      if (text.length < 3) return false;
      return !FILLER_PATTERNS.some(p => p.test(text));
    });

    // Clean inline fillers from remaining segments
    const cleaned = meaningful.map(s => ({
      speaker: s.speaker,
      speakerName: s.speakerName,
      text: this.cleanText(s.text),
      timestamp: s.timestamp,
    })).filter(s => s.text.length > 2);

    // Merge consecutive same-speaker segments
    const merged: CleanSegment[] = [];
    for (const seg of cleaned) {
      const last = merged[merged.length - 1];
      if (last && last.speaker === seg.speaker && (seg.timestamp - last.timestamp) < 10000) {
        last.text = last.text + ' ' + seg.text;
      } else {
        merged.push({ ...seg });
      }
    }

    return merged;
  }

  private cleanText(text: string): string {
    let cleaned = text.trim();
    for (const pattern of INLINE_FILLERS) {
      cleaned = cleaned.replace(pattern, ' ');
    }
    // Fix double spaces and trailing punctuation issues
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
    }
    return cleaned;
  }

  /**
   * Send cleaned transcript to LLM for structured analysis
   */
  private async analyzeWithLLM(
    cleanSegments: CleanSegment[],
    callType: string,
    durationMs: number,
    context?: string
  ): Promise<Omit<ProcessedCall, 'cleanTranscript' | 'processedAt'>> {
    // Build a condensed transcript for LLM (limit to ~5000 chars to fit context)
    const transcriptText = cleanSegments
      .map(s => `[${s.speakerName}]: ${s.text}`)
      .join('\n');

    const truncatedTranscript = transcriptText.length > 5000
      ? transcriptText.slice(0, 2500) + '\n\n[...middle section omitted...]\n\n' + transcriptText.slice(-2500)
      : transcriptText;

    const systemPrompt = `You are an expert meeting analyst. You produce concise, actionable post-call summaries. Be direct and specific — no fluff. Focus on what was discussed, what was decided, and what needs to happen next.`;

    const userPrompt = `Analyze this ${callType} call (${Math.round(durationMs / 60000)} minutes).
${context ? `Meeting context: ${context}\n` : ''}
Transcript:
${truncatedTranscript}

Produce a structured analysis. Be concise and specific.

Respond with JSON:
{
  "title": "Short descriptive title (5-10 words)",
  "summary": "2-4 sentence executive summary of what happened and outcomes",
  "topics": [
    {"name": "Topic name", "description": "1-2 sentence description of what was covered"}
  ],
  "actionItems": [
    {"text": "What needs to be done", "owner": "who is responsible", "dueDate": "if mentioned, else null"}
  ],
  "keyTakeaways": ["Key point or decision 1", "Key point 2"],
  "nextSteps": ["Next step 1", "Next step 2"]
}`;

    try {
      const result = await this.llm.converseJSON<{
        title: string;
        summary: string;
        topics: { name: string; description: string }[];
        actionItems: { text: string; owner: string; dueDate?: string }[];
        keyTakeaways: string[];
        nextSteps: string[];
      }>(systemPrompt, userPrompt);

      return {
        title: result?.title ?? 'Untitled Call',
        summary: result?.summary ?? 'Summary generation failed.',
        topics: result?.topics ?? [],
        actionItems: result?.actionItems ?? [],
        keyTakeaways: result?.keyTakeaways ?? [],
        nextSteps: result?.nextSteps ?? [],
      };
    } catch (err) {
      console.error('[PostCallProcessor] LLM analysis failed:', err);
      return {
        title: `${callType} call — ${Math.round(durationMs / 60000)} min`,
        summary: 'Automatic summary generation failed. Review the cleaned transcript below.',
        topics: [],
        actionItems: [],
        keyTakeaways: [],
        nextSteps: [],
      };
    }
  }
}
