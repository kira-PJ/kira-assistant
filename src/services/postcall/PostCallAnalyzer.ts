import { EventEmitter } from 'events';
import { TranscriptSegment } from '../transcription/types';
import { BedrockClient } from '../coaching/BedrockClient';
import { CallType } from '../coaching/types';
import { PostCallReport, CallSummary, CallScore, ActionItem, FollowUpEmail } from './types';
import { ScoringEngine } from './ScoringEngine';

/**
 * PostCallAnalyzer - Generates comprehensive post-call reports
 *
 * After a call ends, assembles the full transcript and sends it to
 * Bedrock for analysis. Produces: summary, scores, action items,
 * improvement suggestions, and follow-up email draft.
 */
export class PostCallAnalyzer extends EventEmitter {
  private bedrock: BedrockClient;
  private scoring: ScoringEngine;

  constructor(options: { region?: string; modelId?: string } = {}) {
    super();
    this.bedrock = new BedrockClient({
      region: options.region,
      modelId: options.modelId,
      maxTokens: 2000,
    });
    this.scoring = new ScoringEngine(this.bedrock);
  }

  /**
   * Run the full post-call analysis pipeline
   */
  async analyze(
    segments: TranscriptSegment[],
    callType: CallType,
    durationMs: number
  ): Promise<PostCallReport> {
    this.emit('status', 'Assembling transcript...');

    const transcript = this.assembleTranscript(segments);
    const talkRatio = this.computeTalkRatio(segments);

    this.emit('status', 'Generating summary...');
    const summary = await this.generateSummary(transcript, callType, durationMs);

    this.emit('status', 'Scoring call...');
    const score = await this.scoring.scoreCall(transcript, callType, talkRatio);

    this.emit('status', 'Extracting action items...');
    const actionItems = await this.extractActionItems(transcript);

    this.emit('status', 'Drafting follow-up email...');
    const followUpEmail = await this.generateFollowUpEmail(summary, actionItems);

    this.emit('status', 'Complete');

    const report: PostCallReport = {
      summary,
      score,
      actionItems,
      followUpEmail,
      talkRatio,
      totalWords: this.countWords(segments),
    };

    this.emit('report', report);
    return report;
  }

  private assembleTranscript(segments: TranscriptSegment[]): string {
    return segments
      .map(s => {
        const time = new Date(s.timestamp).toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        return `[${time}] ${s.speakerName}: ${s.text}`;
      })
      .join('\n');
  }

  private computeTalkRatio(segments: TranscriptSegment[]): { you: number; other: number } {
    let youWords = 0;
    let otherWords = 0;
    for (const s of segments) {
      const words = s.text.split(/\s+/).length;
      if (s.speaker === 'you') youWords += words;
      else otherWords += words;
    }
    const total = youWords + otherWords;
    if (total === 0) return { you: 50, other: 50 };
    return {
      you: Math.round((youWords / total) * 100),
      other: Math.round((otherWords / total) * 100),
    };
  }

  private countWords(segments: TranscriptSegment[]): { you: number; other: number } {
    let you = 0;
    let other = 0;
    for (const s of segments) {
      const words = s.text.split(/\s+/).length;
      if (s.speaker === 'you') you += words;
      else other += words;
    }
    return { you, other };
  }

  private async generateSummary(
    transcript: string,
    callType: string,
    durationMs: number
  ): Promise<CallSummary> {
    const prompt = `Analyze this ${callType} call transcript and provide a structured summary.

Duration: ${Math.round(durationMs / 60000)} minutes

Transcript:
${transcript.slice(0, 6000)}

Respond with JSON:
{
  "title": "Short descriptive title for this call",
  "participants": ["list of participants mentioned"],
  "topicsCovered": ["main topics discussed"],
  "keyDecisions": ["any decisions or agreements made"],
  "overallSentiment": "positive/neutral/negative",
  "synopsis": "2-3 paragraph summary of the call covering key points, outcomes, and next steps"
}`;

    const result = await this.bedrock.converseJSON<{
      title: string;
      participants: string[];
      topicsCovered: string[];
      keyDecisions: string[];
      overallSentiment: string;
      synopsis: string;
    }>('You are an expert call analyst. Produce concise, actionable summaries.', prompt);

    return {
      id: `call-${Date.now()}`,
      title: result?.title ?? 'Untitled Call',
      date: Date.now(),
      durationMs,
      callType,
      participants: result?.participants ?? [],
      topicsCovered: result?.topicsCovered ?? [],
      keyDecisions: result?.keyDecisions ?? [],
      overallSentiment: result?.overallSentiment ?? 'neutral',
      synopsis: result?.synopsis ?? 'Summary unavailable.',
    };
  }

  private async extractActionItems(transcript: string): Promise<ActionItem[]> {
    const prompt = `Extract all action items, commitments, and follow-ups from this call transcript.
An action item is anything someone committed to doing, was asked to do, or needs follow-up.

Transcript:
${transcript.slice(0, 6000)}

Respond with JSON:
{
  "actionItems": [
    {
      "text": "What needs to be done",
      "owner": "you|customer|both",
      "dueDate": "mentioned deadline or null",
      "context": "Brief excerpt from transcript where this was discussed"
    }
  ]
}`;

    const result = await this.bedrock.converseJSON<{
      actionItems: {
        text: string;
        owner: string;
        dueDate?: string;
        context: string;
      }[];
    }>('You are an expert at extracting action items from conversations. Be thorough.', prompt);

    return (result?.actionItems ?? []).map((item, i) => ({
      id: `action-${Date.now()}-${i}`,
      text: item.text,
      owner: (item.owner as 'you' | 'customer' | 'both') ?? 'you',
      dueDate: item.dueDate ?? undefined,
      context: item.context,
      timestamp: Date.now(),
    }));
  }

  private async generateFollowUpEmail(
    summary: CallSummary,
    actionItems: ActionItem[]
  ): Promise<FollowUpEmail> {
    const itemsList = actionItems.map(a => `- ${a.text} (owner: ${a.owner})`).join('\n');

    const prompt = `Generate a professional follow-up email after this call.

Call: ${summary.title}
Topics: ${summary.topicsCovered.join(', ')}
Decisions: ${summary.keyDecisions.join(', ')}
Action Items:
${itemsList}

Synopsis: ${summary.synopsis}

Write a concise, warm, professional follow-up email. Include action items and next steps.

Respond with JSON:
{
  "subject": "Email subject line",
  "body": "Full email body (plain text, with greeting and sign-off)",
  "actionItems": ["summarized action items for the email"],
  "nextSteps": ["clear next steps"]
}`;

    const result = await this.bedrock.converseJSON<{
      subject: string;
      body: string;
      actionItems: string[];
      nextSteps: string[];
    }>('You write clear, professional follow-up emails. Keep them concise and action-oriented.', prompt);

    return {
      subject: result?.subject ?? `Follow-up: ${summary.title}`,
      body: result?.body ?? 'Follow-up email generation failed.',
      actionItems: result?.actionItems ?? actionItems.map(a => a.text),
      nextSteps: result?.nextSteps ?? [],
    };
  }

  destroy(): void {
    this.bedrock.destroy();
  }
}
