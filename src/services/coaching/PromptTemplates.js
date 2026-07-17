"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptTemplates = void 0;
/**
 * PromptTemplates - System prompts and user prompts for AI coaching
 *
 * Each call type has specialized prompts that focus the AI on
 * the most relevant coaching dimensions.
 */
class PromptTemplates {
    /**
     * Get the system prompt for a given call type
     */
    static getSystemPrompt(callType) {
        const base = `You are an expert AI coaching assistant helping a professional during a live call. 
You have access to the real-time transcript and must provide actionable, concise guidance.
Your responses should be short (2-4 sentences max) and immediately usable.
Never include pleasantries or filler. Be direct and helpful.
Format output as JSON matching the requested schema.`;
        const typeSpecific = this.getCallTypeInstructions(callType);
        return `${base}\n\n${typeSpecific}`;
    }
    /**
     * Generate a question suggestion prompt
     */
    static questionSuggestionPrompt(context) {
        return `Based on this conversation context, suggest 1-2 highly relevant questions the user should ask next.

Call type: ${context.callType}
Talk ratio: You ${context.talkRatio.you}% / Customer ${context.talkRatio.other}%
Call duration: ${Math.round(context.callDurationMs / 60000)} minutes

Recent transcript:
${context.recentTranscript}

Respond with JSON:
{
  "questions": [
    { "question": "...", "reason": "...", "priority": "high|medium|low" }
  ]
}`;
    }
    /**
     * Generate a tech context lookup prompt
     */
    static techContextPrompt(techTerm, conversationContext) {
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
     * Generate a customer question answering prompt
     */
    static answerQuestionPrompt(question, context) {
        return `The customer just asked: "${question}"

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
    static sentimentPrompt(recentText) {
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
    static actionItemsPrompt(transcript) {
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
    static getCallTypeInstructions(callType) {
        const instructions = {
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
exports.PromptTemplates = PromptTemplates;
