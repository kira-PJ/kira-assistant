import { EventEmitter } from 'events';
import { WebSearchResult, SearchResponse } from './types';

/**
 * WebSearchService - Real-time web search via Tavily API
 *
 * Features:
 * - Search-and-summarize pipeline
 * - Local cache with 24h TTL
 * - Rate limiting (max 2 searches/minute during calls)
 * - Fallback to cached results on failure
 */
export class WebSearchService extends EventEmitter {
  private apiKey: string;
  private cache = new Map<string, { response: SearchResponse; expiry: number }>();
  private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
  private requestTimestamps: number[] = [];
  private maxRequestsPerMinute = 2;
  private baseUrl = 'https://api.tavily.com';

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey ?? process.env.TAVILY_API_KEY ?? '';
  }

  /**
   * Search the web and return summarized results
   */
  async search(query: string, options: {
    maxResults?: number;
    includeAnswer?: boolean;
    searchDepth?: 'basic' | 'advanced';
  } = {}): Promise<SearchResponse> {
    // Check cache first
    const cacheKey = query.toLowerCase().trim();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      return { ...cached.response, cached: true };
    }

    // Rate limit check
    if (!this.checkRateLimit()) {
      // Return cached if available, even if expired
      if (cached) {
        return { ...cached.response, cached: true };
      }
      throw new Error('Rate limit exceeded. Max 2 searches per minute.');
    }

    if (!this.apiKey) {
      throw new Error('Tavily API key not configured. Set TAVILY_API_KEY.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: options.maxResults ?? 5,
          include_answer: options.includeAnswer ?? true,
          search_depth: options.searchDepth ?? 'basic',
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = await response.json() as {
        answer?: string;
        results?: { title: string; url: string; content: string; score: number }[];
      };

      const searchResponse: SearchResponse = {
        query,
        results: (data.results ?? []).map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.content?.slice(0, 200) ?? '',
          score: r.score ?? 0,
        })),
        summary: data.answer ?? '',
        timestamp: Date.now(),
        cached: false,
      };

      // Cache the response
      this.cache.set(cacheKey, {
        response: searchResponse,
        expiry: Date.now() + this.cacheTTL,
      });

      return searchResponse;
    } catch (err) {
      // Return expired cache on failure
      if (cached) {
        return { ...cached.response, cached: true };
      }
      throw err;
    }
  }

  /**
   * Search and produce a concise summary for the coaching engine
   */
  async searchAndSummarize(query: string): Promise<string> {
    const response = await this.search(query, {
      includeAnswer: true,
      maxResults: 3,
    });

    if (response.summary) {
      return response.summary;
    }

    // Fallback: combine top snippets
    return response.results
      .slice(0, 3)
      .map(r => `${r.title}: ${r.snippet}`)
      .join('\n\n');
  }

  /**
   * Clear expired cache entries
   */
  pruneCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache) {
      if (now >= value.expiry) {
        this.cache.delete(key);
      }
    }
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 60000);
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      return false;
    }
    this.requestTimestamps.push(now);
    return true;
  }
}
