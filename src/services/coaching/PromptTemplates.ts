import { CallType, CoachingContext } from './types';

/**
 * PromptTemplates - System prompts and user prompts for AI coaching
 * 
 * Each call type has specialized prompts that focus the AI on
 * the most relevant coaching dimensions.
 */
export class PromptTemplates {
  /**
   * Get the system prompt for a given call type
   */
  static getSystemPrompt(callType: CallType): string {
    const base = `You are an expert AI coaching assistant helping a professional during a live call. 
You have access to the real-time transcript and must provide actionable, concise guidance.
Your responses should be short (2-4 sentences max) and immediately usable.
Never include pleasantries or filler. Be direct and helpful.
Format output as JSON matching the requested schema.`;

    const typeSpecific = this.getCallTypeInstructions(callType);
    return `${base}\n\n${typeSpecific}`;
  }

  /**
   * Generate a question suggestion prompt - tailored per call type and role
   */
  static questionSuggestionPrompt(context: CoachingContext): string {
    const typeGuidance = this.getQuestionGuidance(context.callType);

    return `Based on this conversation, suggest 1 highly relevant question the user should ask next.
Keep it natural and specific to what was just discussed — not generic or overly broad.

Call type: ${context.callType}
${typeGuidance}
Talk ratio: You ${context.talkRatio.you}% / Other ${context.talkRatio.other}%
Call duration: ${Math.round(context.callDurationMs / 60000)} minutes

Recent transcript:
${context.recentTranscript}

IMPORTANT: The question must directly relate to something specific just said in the transcript. Do NOT suggest generic questions.

Respond with JSON:
{
  "questions": [
    { "question": "...", "reason": "brief reason why this is relevant right now", "priority": "high|medium|low" }
  ]
}`;
  }

  /**
   * Call-type-specific guidance for what kinds of questions to suggest
   */
  private static getQuestionGuidance(callType: CallType): string {
    const guidance: Record<CallType, string> = {
      discovery: `Role: You are leading discovery. Suggest questions that uncover pain points, timeline, budget, or decision criteria. Use SPIN/MEDDIC framing.`,

      demo: `Role: You are presenting. Suggest engagement checks or questions to confirm the feature resonates. Example: "Does this solve the X problem you mentioned?"`,

      training: `Role: You are ATTENDING/LEARNING. Suggest clarification questions about what the trainer just explained. Focus on:
- Asking to clarify a concept that was just taught
- Requesting a specific example or use case
- Asking "how does X relate to Y?" connections
- Asking about edge cases or exceptions to what was just said
Do NOT suggest teaching questions. You are the student here.`,

      technical: `Role: Technical deep-dive. Suggest questions about architecture decisions, trade-offs, scalability, or edge cases relevant to what's being discussed.`,

      followup: `Role: Follow-up call. Suggest questions checking status on action items, confirming next steps, or surfacing new blockers.`,

      negotiation: `Role: Negotiation. Suggest questions that explore flexibility, alternatives, or value justification. Avoid direct price questions unless appropriate.`,
    };

    return guidance[callType] ?? guidance.discovery;
  }

  /**
   * Generate a tech context lookup prompt
   */
  static techContextPrompt(techTerm: string, conversationContext: string): string {
    return `The customer just mentioned "${techTerm}" in conversation.

Context: ${conversationContext}

Provide:
1. Brief explanation (2-3 sentences, for the user's reference)
2. How it relates to AWS services (if applicable)
3. Key talking points

Respond with JSON:
{
  "title": "${techTerm}",
  "explanation": "...",
  "awsRelevance": "...",
  "talkingPoints": ["...", "..."],
  "links": [{"label": "...", "url": "..."}]
}`;
  }

  /**
   * Generate a customer question answering prompt.
   * Behavior changes per call type:
   * - Discovery/demo/negotiation: help YOU answer the customer's question
   * - Training (attending): the trainer is asking — help you respond or ask for clarification
   */
  static answerQuestionPrompt(question: string, context: string, callType?: CallType): string {
    if (callType === 'training') {
      return `The trainer just asked or said: "${question}"

Conversation context: ${context}

You are ATTENDING this training. Help the user respond appropriately:
- If it's a comprehension check, provide a concise answer based on what was just taught
- If they're asking "any questions?", suggest a thoughtful clarification question
- If it's rhetorical, note that no response is needed

Keep it brief — 1-2 sentences max.

Respond with JSON:
{
  "simpleAnswer": "What to say or think",
  "keyDetails": ["relevant points from the training"],
  "avoid": "things not to say",
  "confidence": "high|medium|low",
  "isRhetorical": false
}`;
    }

    return `The other party just asked: "${question}"

Conversation context: ${context}

Provide a helpful answer the user can reference immediately. Include:
1. Simple answer (1-2 sentences)
2. Key details to mention
3. What NOT to say (potential pitfalls)

Respond with JSON:
{
  "simpleAnswer": "...",
  "keyDetails": ["...", "..."],
  "avoid": "...",
  "confidence": "high|medium|low"
}`;
  }

  /**
   * Generate sentiment analysis prompt
   */
  static sentimentPrompt(recentText: string): string {
    return `Analyze the customer's emotional state from this recent conversation excerpt.

Text: ${recentText}

Respond with JSON:
{
  "sentiment": "positive|neutral|confused|hesitant|frustrated",
  "confidence": 0.0-1.0,
  "reason": "Brief reason for this assessment",
  "suggestion": "What the user should do based on this sentiment"
}`;
  }

  /**
   * Generate action items extraction prompt
   */
  static actionItemsPrompt(transcript: string): string {
    return `Extract any action items, commitments, or follow-ups from this conversation.

Transcript:
${transcript}

Respond with JSON:
{
  "actionItems": [
    { "text": "...", "owner": "You|Customer|Both", "dueDate": "..." }
  ]
}`;
  }

  private static getCallTypeInstructions(callType: CallType): string {
    const instructions: Record<CallType, string> = {
      discovery: `CALL TYPE: Discovery Call
Focus areas:
- Help uncover customer's pain points, timeline, budget, decision process
- Suggest open-ended questions (MEDDIC/BANT framework)
- Flag if important qualification criteria haven't been covered
- Alert when talk ratio tilts too much toward the user (should be listening more)
- Detect buying signals and urgency indicators`,

      demo: `CALL TYPE: Product Demo
Focus areas:
- Map features to customer's stated needs (feature-benefit alignment)
- Suggest handling objections when customer seems hesitant
- Recommend engagement checks ("Does that make sense?", "Is this what you had in mind?")
- Alert when going too deep technically without confirming value
- Track which features resonated (positive reactions) vs. fell flat`,

      training: `CALL TYPE: Training Session
Focus areas:
- Suggest comprehension checks periodically
- Detect when pace is too fast (confusion signals)
- Recommend engagement techniques if silence extends
- Suggest analogies or simplified explanations for complex topics
- Track which topics needed extra explanation`,

      technical: `CALL TYPE: Technical Deep-Dive
Focus areas:
- Ensure accuracy of technical claims
- Flag potential edge cases or concerns the customer should know about
- Suggest clarifying questions for ambiguous requirements
- Detect when customer needs more context before proceeding
- Track technical decisions made`,

      followup: `CALL TYPE: Follow-up Call
Focus areas:
- Reference action items from previous interactions
- Ensure all open items are addressed
- Suggest confirming next steps and timeline
- Detect new requirements or scope changes
- Track progress against previous commitments`,

      negotiation: `CALL TYPE: Negotiation
Focus areas:
- Track concessions (what's been given vs. received)
- Suggest value reinforcement when price is challenged
- Detect emotional pressure tactics
- Recommend alternative options when at an impasse
- Flag when commitments are being made (ensure intentional)`,
    };

    return instructions[callType];
  }
}
