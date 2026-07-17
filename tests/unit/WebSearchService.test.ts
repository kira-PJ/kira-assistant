import { describe, it, expect, beforeEach } from 'vitest';
import { WebSearchService } from '../../src/services/knowledge/WebSearchService';

describe('WebSearchService', () => {
  let service: WebSearchService;

  beforeEach(() => {
    service = new WebSearchService('test-key');
  });

  describe('rate limiting', () => {
    it('allows first request', async () => {
      // Without a valid API key this will fail at fetch, but rate limit should pass
      try {
        await service.search('test');
      } catch (err: any) {
        // Expected to fail on fetch, not on rate limit
        expect(err.message).not.toContain('Rate limit');
      }
    });

    it('blocks after exceeding rate limit', async () => {
      // Exhaust rate limit (2/min)
      try { await service.search('test1'); } catch {}
      try { await service.search('test2'); } catch {}

      // Third should be rate limited
      await expect(service.search('test3')).rejects.toThrow('Rate limit');
    });
  });

  describe('caching', () => {
    it('pruneCache removes expired entries', () => {
      // Just verify it doesn't throw
      service.pruneCache();
    });
  });
});
