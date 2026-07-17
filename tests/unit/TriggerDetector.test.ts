import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerDetector } from '../../src/services/coaching/TriggerDetector';
import { TranscriptSegment } from '../../src/services/transcription/types';

function makeSegment(text: string, speaker: 'you' | 'other' = 'other'): TranscriptSegment {
  return {
    id: `seg-${Date.now()}`,
    speaker,
    speakerName: speaker === 'you' ? 'You' : 'Customer',
    text,
    timestamp: Date.now(),
    endTimestamp: Date.now(),
    confidence: 0.9,
    isPartial: false,
  };
}

describe('TriggerDetector', () => {
  let detector: TriggerDetector;

  beforeEach(() => {
    detector = new TriggerDetector();
  });

  describe('detectTechMentions', () => {
    it('detects AWS service mentions', () => {
      const segment = makeSegment('We are currently running our workloads on EC2 with RDS databases');
      const mentions = detector.detectTechMentions(segment);
      expect(mentions.length).toBeGreaterThanOrEqual(2);
      expect(mentions.some(m => m.term === 'EC2')).toBe(true);
      expect(mentions.some(m => m.term === 'RDS')).toBe(true);
    });

    it('detects programming languages', () => {
      const segment = makeSegment('Our backend is built with Python and we use React for the frontend');
      const mentions = detector.detectTechMentions(segment);
      expect(mentions.some(m => m.term === 'Python')).toBe(true);
      expect(mentions.some(m => m.term === 'React')).toBe(true);
    });

    it('detects DevOps tools', () => {
      const segment = makeSegment('We use Docker and Kubernetes for container orchestration');
      const mentions = detector.detectTechMentions(segment);
      expect(mentions.some(m => m.term === 'Docker')).toBe(true);
      expect(mentions.some(m => m.term === 'Kubernetes')).toBe(true);
    });

    it('returns empty for generic text', () => {
      const segment = makeSegment('The weather is nice today');
      const mentions = detector.detectTechMentions(segment);
      expect(mentions.length).toBe(0);
    });
  });

  describe('isQuestion', () => {
    it('detects questions with question marks', () => {
      const segment = makeSegment('What cloud services are you currently using?');
      expect(detector.isQuestion(segment)).toBe(true);
    });

    it('detects questions starting with question words', () => {
      const segment = makeSegment('How does your deployment pipeline work');
      expect(detector.isQuestion(segment)).toBe(true);
    });

    it('detects indirect questions', () => {
      const segment = makeSegment('I was wondering if you could tell me about your architecture');
      expect(detector.isQuestion(segment)).toBe(true);
    });

    it('does not flag statements from "you" as questions', () => {
      const segment = makeSegment('What do you think about Lambda?', 'you');
      expect(detector.isQuestion(segment)).toBe(false);
    });

    it('does not flag non-questions', () => {
      const segment = makeSegment('We deployed the application last week.');
      expect(detector.isQuestion(segment)).toBe(false);
    });
  });

  describe('analyzeSentiment', () => {
    it('detects positive sentiment', () => {
      const result = detector.analyzeSentiment('That sounds great, I love this approach. This is exactly what we need.');
      expect(result.sentiment).toBe('positive');
    });

    it('detects confused sentiment', () => {
      const result = detector.analyzeSentiment("I don't understand. Can you explain that again? I'm confused about the architecture.");
      expect(result.sentiment).toBe('confused');
    });

    it('detects frustrated sentiment', () => {
      const result = detector.analyzeSentiment("This is frustrating. It doesn't work. We've been dealing with this problem for months.");
      expect(result.sentiment).toBe('frustrated');
    });

    it('detects hesitant sentiment', () => {
      const result = detector.analyzeSentiment("Maybe we could, perhaps. I'm not sure. I need to think about it and check with my team.");
      expect(result.sentiment).toBe('hesitant');
    });

    it('returns neutral for generic text', () => {
      const result = detector.analyzeSentiment('The server runs on port 3000 and connects to the database.');
      expect(result.sentiment).toBe('neutral');
    });
  });

  describe('detectActionItems', () => {
    it('detects commitments with "I will"', () => {
      const items = detector.detectActionItems("I'll send you the proposal by end of day tomorrow");
      expect(items.length).toBeGreaterThan(0);
    });

    it('detects requests with "can you"', () => {
      const items = detector.detectActionItems("Can you send me the architecture diagram for review");
      expect(items.length).toBeGreaterThan(0);
    });

    it('detects follow-up mentions', () => {
      const items = detector.detectActionItems("The follow-up meeting is scheduled for next Tuesday");
      expect(items.length).toBeGreaterThan(0);
    });
  });
});
