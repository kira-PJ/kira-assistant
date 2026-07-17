import { EventEmitter } from 'events';
import { BedrockClient } from '../coaching/BedrockClient';
import { WebSearchService } from '../knowledge/WebSearchService';
import { CallType } from '../coaching/types';

export interface Participant {
  name: string;
  company?: string;
  role?: string;
  linkedIn?: string;
  notes?: string;
}

export interface PreCallBrief {
  participants: Participant[];
  companyContext: string;
  previousCallNotes: string[];
  suggestedAgenda: string[];
  suggestedQuestions: string[];
  relevantDocs: string[];
}

/**
 * PreCallService - Pre-call preparation and context gathering
 *
 * Given participant info, looks up company/person context,
 * surfaces notes from previous calls, and suggests an agenda.
 */
export class PreCallService extends EventEmitter {
  private bedrock: BedrockClient;
  private webSearch: WebSearchService;

  constructor(options: { region?: string; modelId?: string; tavilyKey?: string } = {}) {
    super();
    this.bedrock = new BedrockClient({ region: options.region, modelId: options.modelId });
    this.webSearch = new WebSearchService(options.tavilyKey);
  }

  /**
   * Generate a pre-call brief based on participants and call type
   */
  async prepareBrief(
    participants: Participant[],
    callType: CallType,
    previousCalls: { title: string; summary: string; date: string }[] = []
  ): Promise<PreCallBrief> {
    this.emit('status', 'Looking up participants...');

    // Web lookup for company/person context
    let companyContext = '';
    for (const p of participants) {
      if (p.company) {
        try {
          const result = await this.webSearch.searchAndSummarize(
            `${p.company} company overview products services`
          );
          companyContext += `${p.company}: ${result}\n\n`;
        } catch { /* non-critical */ }
      }
    }

    // Previous call notes
    const previousCallNotes = previousCalls.map(
      c => `[${c.date}] ${c.title}: ${c.summary}`
    );

    this.emit('status', 'Generating agenda...');

    // AI-generated agenda and questions
    const prompt = `Generate a pre-call preparation brief.

Call type: ${callType}
Participants: ${participants.map(p => `${p.name} (${p.role ?? 'unknown role'} at ${p.company ?? 'unknown company'})`).join(', ')}

Company context:
${companyContext.slice(0, 2000) || 'No company info available.'}

Previous call notes:
${previousCallNotes.join('\n') || 'No previous calls with these participants.'}

Respond with JSON:
{
  "suggestedAgenda": ["agenda item 1", "agenda item 2", "..."],
  "suggestedQuestions": ["question 1", "question 2", "..."],
  "relevantDocs": ["doc or topic to review before the call"]
}`;

    const result = await this.bedrock.converseJSON<{
      suggestedAgenda: string[];
      suggestedQuestions: string[];
      relevantDocs: string[];
    }>(
      'You are a pre-call preparation assistant. Generate practical, specific prep materials.',
      prompt
    );

    this.emit('status', 'Brief ready');

    return {
      participants,
      companyContext,
      previousCallNotes,
      suggestedAgenda: result?.suggestedAgenda ?? [],
      suggestedQuestions: result?.suggestedQuestions ?? [],
      relevantDocs: result?.relevantDocs ?? [],
    };
  }

  destroy(): void {
    this.bedrock.destroy();
  }
}
