import { BedrockClient } from '../coaching/BedrockClient';
import { CallType } from '../coaching/types';
import { CallScore, ScoreDimension, ImprovementSuggestion } from './types';

/**
 * ScoringEngine - Multi-dimensional call scoring
 *
 * Scores calls across 7 dimensions with evidence-based reasoning.
 * Each dimension is weighted based on call type relevance.
 */
export class ScoringEngine {
  private bedrock: BedrockClient;

  private dimensions: { name: string; description: string; weight: Record<CallType, number> }[] = [
    {
      name: 'Discovery Depth',
      description: 'How well did you uncover customer needs, pain points, timeline, budget, and decision criteria?',
      weight: { discovery: 1.0, demo: 0.3, training: 0.2, technical: 0.4, followup: 0.5, negotiation: 0.6 },
    },
    {
      name: 'Objection Handling',
      description: 'How effectively did you address concerns, pushback, or hesitations?',
      weight: { discovery: 0.4, demo: 0.9, training: 0.3, technical: 0.5, followup: 0.6, negotiation: 1.0 },
    },
    {
      name: 'Next Steps',
      description: 'Were clear, specific next steps established with owners and timelines?',
      weight: { discovery: 0.8, demo: 0.8, training: 0.5, technical: 0.7, followup: 1.0, negotiation: 0.9 },
    },
    {
      name: 'Talk Ratio',
      description: 'Was there a healthy balance of speaking vs. listening? (Ideal: 30-40% you in discovery, 50-60% in demo/training)',
      weight: { discovery: 0.7, demo: 0.5, training: 0.4, technical: 0.5, followup: 0.6, negotiation: 0.7 },
    },
    {
      name: 'Technical Accuracy',
      description: 'Was the information shared correct, precise, and appropriately detailed?',
      weight: { discovery: 0.3, demo: 0.8, training: 1.0, technical: 1.0, followup: 0.4, negotiation: 0.3 },
    },
    {
      name: 'Engagement',
      description: 'Did the customer seem engaged, interested, and actively participating?',
      weight: { discovery: 0.6, demo: 0.8, training: 1.0, technical: 0.6, followup: 0.5, negotiation: 0.7 },
    },
    {
      name: 'Question Quality',
      description: 'Were your questions relevant, open-ended, insightful, and well-timed?',
      weight: { discovery: 1.0, demo: 0.5, training: 0.7, technical: 0.8, followup: 0.7, negotiation: 0.6 },
    },
  ];

  constructor(bedrock: BedrockClient) {
    this.bedrock = bedrock;
  }

  /**
   * Score a call across all 7 dimensions
   */
  async scoreCall(
    transcript: string,
    callType: CallType,
    talkRatio: { you: number; other: number }
  ): Promise<CallScore> {
    const dimensionDefs = this.dimensions.map(d => ({
      name: d.name,
      description: d.description,
      weight: d.weight[callType],
    }));

    const prompt = `Score this ${callType} call across the following dimensions.
For each dimension, provide a score 0-100, a brief explanation, and a specific quote from the transcript as evidence.

Talk ratio was: You ${talkRatio.you}% / Customer ${talkRatio.other}%

Dimensions to score:
${dimensionDefs.map(d => `- ${d.name} (weight: ${d.weight}): ${d.description}`).join('\n')}

Transcript (excerpt):
${transcript.slice(0, 5000)}

Also provide:
- Top 2-3 strengths demonstrated
- Top 2-3 specific improvement suggestions with example alternative phrases

Respond with JSON:
{
  "dimensions": [
    { "name": "...", "score": 0-100, "explanation": "...", "evidence": "quoted text" }
  ],
  "strengths": ["...", "..."],
  "improvements": [
    { "area": "...", "suggestion": "...", "example": "You could have said: ...", "priority": "high|medium|low" }
  ]
}`;

    const result = await this.bedrock.converseJSON<{
      dimensions: { name: string; score: number; explanation: string; evidence: string }[];
      strengths: string[];
      improvements: { area: string; suggestion: string; example: string; priority: string }[];
    }>('You are an expert call coach. Score fairly but constructively. Use evidence from the transcript.', prompt);

    const scoredDimensions: ScoreDimension[] = (result?.dimensions ?? []).map((d, i) => ({
      name: d.name,
      score: Math.max(0, Math.min(100, d.score)),
      weight: dimensionDefs[i]?.weight ?? 0.5,
      explanation: d.explanation,
      evidence: d.evidence,
    }));

    // Compute overall score (weighted average)
    let weightedSum = 0;
    let totalWeight = 0;
    for (const dim of scoredDimensions) {
      weightedSum += dim.score * dim.weight;
      totalWeight += dim.weight;
    }
    const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

    const improvements: ImprovementSuggestion[] = (result?.improvements ?? []).map(imp => ({
      area: imp.area,
      suggestion: imp.suggestion,
      example: imp.example,
      priority: (imp.priority as 'high' | 'medium' | 'low') ?? 'medium',
    }));

    return {
      callId: `call-${Date.now()}`,
      overall,
      dimensions: scoredDimensions,
      strengths: result?.strengths ?? [],
      improvements,
      timestamp: Date.now(),
    };
  }

  /**
   * Compute a simple talk-ratio score
   * Discovery: ideal is 30-40% you. Demo/Training: 50-60% you.
   */
  scoreTalkRatio(youPercent: number, callType: CallType): number {
    const ideals: Record<CallType, { min: number; max: number }> = {
      discovery: { min: 25, max: 40 },
      demo: { min: 45, max: 65 },
      training: { min: 55, max: 75 },
      technical: { min: 35, max: 55 },
      followup: { min: 35, max: 55 },
      negotiation: { min: 30, max: 50 },
    };

    const { min, max } = ideals[callType];
    if (youPercent >= min && youPercent <= max) return 100;

    const distance = youPercent < min
      ? min - youPercent
      : youPercent - max;

    return Math.max(0, 100 - distance * 3);
  }
}
