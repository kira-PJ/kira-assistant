"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BedrockClient = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const events_1 = require("events");
/**
 * BedrockClient - Wrapper around AWS Bedrock for streaming Claude responses
 *
 * Handles:
 * - Streaming response assembly
 * - Rate limiting (max 5 calls/minute)
 * - Token budget tracking
 * - Response caching for repeated queries
 */
class BedrockClient extends events_1.EventEmitter {
    client;
    modelId;
    maxTokens;
    requestCount = 0;
    requestWindow = [];
    maxRequestsPerMinute = 5;
    cache = new Map();
    cacheTTL = 60000; // 1 minute cache
    constructor(options = {}) {
        super();
        this.modelId = options.modelId ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0';
        this.maxTokens = options.maxTokens ?? 500;
        this.client = new client_bedrock_runtime_1.BedrockRuntimeClient({
            region: options.region ?? process.env.AWS_REGION ?? 'us-east-1',
        });
    }
    /**
     * Send a message and stream the response
     * Returns the full response text once complete
     */
    async converse(systemPrompt, userMessage) {
        // Check cache
        const cacheKey = `${systemPrompt.slice(0, 50)}::${userMessage.slice(0, 100)}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.response;
        }
        // Rate limiting
        if (!this.checkRateLimit()) {
            throw new Error('Rate limit exceeded. Try again in a moment.');
        }
        const messages = [
            {
                role: 'user',
                content: [{ text: userMessage }],
            },
        ];
        const command = new client_bedrock_runtime_1.ConverseStreamCommand({
            modelId: this.modelId,
            messages,
            system: [{ text: systemPrompt }],
            inferenceConfig: {
                maxTokens: this.maxTokens,
                temperature: 0.3,
                topP: 0.9,
            },
        });
        let fullResponse = '';
        try {
            const response = await this.client.send(command);
            if (response.stream) {
                for await (const event of response.stream) {
                    if (event.contentBlockDelta?.delta && 'text' in event.contentBlockDelta.delta) {
                        const text = event.contentBlockDelta.delta.text ?? '';
                        fullResponse += text;
                        this.emit('token', text);
                    }
                }
            }
            // Cache successful response
            this.cache.set(cacheKey, { response: fullResponse, timestamp: Date.now() });
            this.requestCount++;
            return fullResponse;
        }
        catch (err) {
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
            throw err;
        }
    }
    /**
     * Parse a JSON response from the model, with fallback
     */
    async converseJSON(systemPrompt, userMessage) {
        const raw = await this.converse(systemPrompt + '\n\nRespond ONLY with valid JSON, no explanation or markdown.', userMessage);
        try {
            // Try to extract JSON from the response
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            // Try array
            const arrayMatch = raw.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                return JSON.parse(arrayMatch[0]);
            }
            return null;
        }
        catch {
            return null;
        }
    }
    checkRateLimit() {
        const now = Date.now();
        this.requestWindow = this.requestWindow.filter(t => now - t < 60000);
        if (this.requestWindow.length >= this.maxRequestsPerMinute) {
            return false;
        }
        this.requestWindow.push(now);
        return true;
    }
    /**
     * Cleanup resources
     */
    destroy() {
        this.cache.clear();
        this.client.destroy();
    }
}
exports.BedrockClient = BedrockClient;
