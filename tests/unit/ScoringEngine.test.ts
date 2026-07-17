import { describe, it, expect } from 'vitest';
import { ScoringEngine } from '../../src/services/postcall/ScoringEngine';

// Mock BedrockClient for testing
const mockBedrock = {
  converse: async () => '{}',
  converseJSON: async () => null,
  destroy: () => {},
  on: () => {},
  emit: () => false,
} as any;

describe('ScoringEngine', () => {
  const engine = new ScoringEngine(mockBedrock);

  describe('scoreTalkRatio', () => {
    it('returns 100 for ideal discovery talk ratio (30-40%)', () => {
      expect(engine.scoreTalkRatio(35, 'discovery')).toBe(100);
      expect(engine.scoreTalkRatio(30, 'discovery')).toBe(100);
      expect(engine.scoreTalkRatio(40, 'discovery')).toBe(100);
    });

    it('penalizes over-talking in discovery', () => {
      const score = engine.scoreTalkRatio(60, 'discovery');
      expect(score).toBeLessThan(50);
    });

    it('returns 100 for ideal demo talk ratio (45-65%)', () => {
      expect(engine.scoreTalkRatio(55, 'demo')).toBe(100);
    });

    it('returns 100 for ideal training talk ratio (55-75%)', () => {
      expect(engine.scoreTalkRatio(65, 'training')).toBe(100);
    });

    it('penalizes under-talking in training', () => {
      const score = engine.scoreTalkRatio(20, 'training');
      expect(score).toBeLessThan(50);
    });

    it('never returns below 0', () => {
      expect(engine.scoreTalkRatio(100, 'discovery')).toBeGreaterThanOrEqual(0);
      expect(engine.scoreTalkRatio(0, 'training')).toBeGreaterThanOrEqual(0);
    });
  });
});
