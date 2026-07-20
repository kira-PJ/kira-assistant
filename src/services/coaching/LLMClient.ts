import { EventEmitter } from 'events';

/**
 * Generic LLM client interface.
 * All providers (Bedrock, Groq, Gemini) implement this.
 */
export interface ILLMClient {
  converse(systemPrompt: string, userMessage: string): Promise<string>;
  converseJSON<T>(systemPrompt: string, userMessage: string): Promise<T | null>;
  destroy(): void;
}

export type LLMProvider = 'bedrock' | 'groq' | 'gemini';

export interface LLMClientOptions {
  provider: LLMProvider;
  // Bedrock
  awsRegion?: string;
  bedrockModelId?: string;
  // Groq
  groqApiKey?: string;
  groqModel?: string;
  // Gemini
  geminiApiKey?: string;
  geminiModel?: string;
  // Shared
  maxTokens?: number;
}

// === Rate limiter + cache (shared logic) ===

class RateLimiter {
  private requestWindow: number[] = [];
  constructor(private maxPerMinute: number) {}

  check(): boolean {
    const now = Date.now();
    this.requestWindow = this.requestWindow.filter(t => now - t < 60000);
    if (this.requestWindow.length >= this.maxPerMinute) return false;
    this.requestWindow.push(now);
    return true;
  }
}

class ResponseCache {
  private cache = new Map<string, { response: string; timestamp: number }>();
  private ttl: number;

  constructor(ttlMs = 60000) { this.ttl = ttlMs; }

  get(key: string): string | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) return cached.response;
    return null;
  }

  set(key: string, response: string): void {
    this.cache.set(key, { response, timestamp: Date.now() });
  }

  clear(): void { this.cache.clear(); }
}

function parseJSON<T>(raw: string): T | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as T;
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch) return JSON.parse(arrayMatch[0]) as T;
    return null;
  } catch { return null; }
}

// =============================================================
// BEDROCK CLIENT
// =============================================================

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  ContentBlock,
  Message,
} from '@aws-sdk/client-bedrock-runtime';

export class BedrockLLMClient extends EventEmitter implements ILLMClient {
  private client: BedrockRuntimeClient;
  private modelId: string;
  private maxTokens: number;
  private rateLimiter = new RateLimiter(5);
  private cache = new ResponseCache();

  constructor(options: LLMClientOptions) {
    super();
    this.modelId = options.bedrockModelId ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
    this.maxTokens = options.maxTokens ?? 500;
    this.client = new BedrockRuntimeClient({
      region: options.awsRegion ?? 'us-east-1',
    });
  }

  async converse(systemPrompt: string, userMessage: string): Promise<string> {
    const cacheKey = `${systemPrompt.slice(0, 50)}::${userMessage.slice(0, 100)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    if (!this.rateLimiter.check()) throw new Error('Rate limit exceeded');

    const messages: Message[] = [
      { role: 'user', content: [{ text: userMessage } as ContentBlock] },
    ];

    const command = new ConverseStreamCommand({
      modelId: this.modelId,
      messages,
      system: [{ text: systemPrompt }],
      inferenceConfig: { maxTokens: this.maxTokens, temperature: 0.3 },
    });

    let fullResponse = '';
    const response = await this.client.send(command);
    if (response.stream) {
      for await (const event of response.stream) {
        if (event.contentBlockDelta?.delta && 'text' in event.contentBlockDelta.delta) {
          fullResponse += event.contentBlockDelta.delta.text ?? '';
        }
      }
    }

    this.cache.set(cacheKey, fullResponse);
    return fullResponse;
  }

  async converseJSON<T>(systemPrompt: string, userMessage: string): Promise<T | null> {
    const raw = await this.converse(
      systemPrompt + '\n\nRespond ONLY with valid JSON, no explanation or markdown.',
      userMessage
    );
    return parseJSON<T>(raw);
  }

  destroy(): void {
    this.cache.clear();
    this.client.destroy();
  }
}

// =============================================================
// GROQ CLIENT (free tier: Llama 3.3 70B)
// =============================================================

export class GroqLLMClient extends EventEmitter implements ILLMClient {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private rateLimiter = new RateLimiter(25); // Groq free = 30/min, keep buffer
  private cache = new ResponseCache();
  private baseUrl = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(options: LLMClientOptions) {
    super();
    this.apiKey = options.groqApiKey ?? '';
    this.model = options.groqModel ?? 'llama-3.3-70b-versatile';
    this.maxTokens = options.maxTokens ?? 500;
  }

  async converse(systemPrompt: string, userMessage: string): Promise<string> {
    const cacheKey = `groq::${systemPrompt.slice(0, 50)}::${userMessage.slice(0, 100)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    if (!this.rateLimiter.check()) throw new Error('Rate limit exceeded');

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: this.maxTokens,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq API error ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content ?? '';

    this.cache.set(cacheKey, text);
    return text;
  }

  async converseJSON<T>(systemPrompt: string, userMessage: string): Promise<T | null> {
    const raw = await this.converse(
      systemPrompt + '\n\nRespond ONLY with valid JSON.',
      userMessage
    );
    return parseJSON<T>(raw);
  }

  destroy(): void {
    this.cache.clear();
  }
}

// =============================================================
// GEMINI CLIENT (free tier: Gemini 2.0 Flash)
// =============================================================

export class GeminiLLMClient extends EventEmitter implements ILLMClient {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private rateLimiter = new RateLimiter(14); // Gemini free = 15/min
  private cache = new ResponseCache();

  constructor(options: LLMClientOptions) {
    super();
    this.apiKey = options.geminiApiKey ?? '';
    this.model = options.geminiModel ?? 'gemini-2.0-flash';
    this.maxTokens = options.maxTokens ?? 500;
  }

  private get baseUrl(): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
  }

  async converse(systemPrompt: string, userMessage: string): Promise<string> {
    const cacheKey = `gemini::${systemPrompt.slice(0, 50)}::${userMessage.slice(0, 100)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    if (!this.rateLimiter.check()) throw new Error('Rate limit exceeded');

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          maxOutputTokens: this.maxTokens,
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    this.cache.set(cacheKey, text);
    return text;
  }

  async converseJSON<T>(systemPrompt: string, userMessage: string): Promise<T | null> {
    const raw = await this.converse(
      systemPrompt + '\n\nRespond ONLY with valid JSON.',
      userMessage
    );
    return parseJSON<T>(raw);
  }

  destroy(): void {
    this.cache.clear();
  }
}

// =============================================================
// FACTORY
// =============================================================

/**
 * Create an LLM client based on the configured provider
 */
export function createLLMClient(options: LLMClientOptions): ILLMClient {
  switch (options.provider) {
    case 'groq':
      if (!options.groqApiKey) {
        console.warn('[LLM] Groq API key not set, falling back to Bedrock');
        return new BedrockLLMClient(options);
      }
      return new GroqLLMClient(options);

    case 'gemini':
      if (!options.geminiApiKey) {
        console.warn('[LLM] Gemini API key not set, falling back to Bedrock');
        return new BedrockLLMClient(options);
      }
      return new GeminiLLMClient(options);

    case 'bedrock':
    default:
      return new BedrockLLMClient(options);
  }
}
