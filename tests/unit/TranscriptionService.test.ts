import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranscriptionService } from '../../src/services/transcription/TranscriptionService';
import { AudioChunk } from '../../src/services/audio/types';

describe('TranscriptionService', () => {
  let service: TranscriptionService;

  beforeEach(() => {
    service = new TranscriptionService('local');
  });

  describe('processChunk', () => {
    it('skips chunks with no voice activity', async () => {
      const segmentSpy = vi.fn();
      service.on('segment', segmentSpy);

      const chunk: AudioChunk = {
        buffer: Buffer.alloc(16000),
        source: 'mic',
        isActive: false, // No voice activity
        timestamp: Date.now(),
        durationMs: 5000,
      };

      await service.processChunk(chunk);
      expect(segmentSpy).not.toHaveBeenCalled();
    });

    it('queues chunks with voice activity', async () => {
      const chunk: AudioChunk = {
        buffer: Buffer.alloc(16000),
        source: 'mic',
        isActive: true,
        timestamp: Date.now(),
        durationMs: 5000,
      };

      // Will be queued but won't produce output without initialized engine
      await service.processChunk(chunk);
      // No error thrown = success
    });
  });

  describe('getTranscript', () => {
    it('returns empty array initially', () => {
      expect(service.getTranscript()).toEqual([]);
    });
  });

  describe('clearTranscript', () => {
    it('emits transcript-cleared event', () => {
      const spy = vi.fn();
      service.on('transcript-cleared', spy);
      service.clearTranscript();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('isReady', () => {
    it('returns false before initialization', () => {
      expect(service.isReady()).toBe(false);
    });
  });
});
