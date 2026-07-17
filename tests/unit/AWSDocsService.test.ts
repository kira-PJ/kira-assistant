import { describe, it, expect } from 'vitest';
import { AWSDocsService } from '../../src/services/knowledge/AWSDocsService';

describe('AWSDocsService', () => {
  const service = new AWSDocsService();

  describe('lookup', () => {
    it('finds services by exact shortName', () => {
      const result = service.lookup('EC2');
      expect(result).not.toBeNull();
      expect(result!.shortName).toBe('EC2');
      expect(result!.category).toBe('Compute');
    });

    it('finds services by full name', () => {
      const result = service.lookup('Amazon DynamoDB');
      expect(result).not.toBeNull();
      expect(result!.shortName).toBe('DynamoDB');
    });

    it('finds services case-insensitively', () => {
      const result = service.lookup('lambda');
      expect(result).not.toBeNull();
      expect(result!.shortName).toBe('Lambda');
    });

    it('finds services by partial match', () => {
      const result = service.lookup('Elastic Beanstalk');
      expect(result).not.toBeNull();
      expect(result!.shortName).toBe('Elastic Beanstalk');
    });

    it('returns null for unknown services', () => {
      const result = service.lookup('NonExistentService123');
      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    it('returns relevant results for compute queries', () => {
      const results = service.search('serverless compute');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.shortName === 'Lambda')).toBe(true);
    });

    it('returns database services for database queries', () => {
      const results = service.search('relational database');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.shortName === 'RDS' || r.shortName === 'Aurora')).toBe(true);
    });

    it('respects limit parameter', () => {
      const results = service.search('AWS', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getDocUrl', () => {
    it('returns correct documentation URL', () => {
      const url = service.getDocUrl('S3');
      expect(url).toBe('https://docs.aws.amazon.com/s3/');
    });

    it('returns fallback URL for unknown services', () => {
      const url = service.getDocUrl('unknown');
      expect(url).toContain('docs.aws.amazon.com');
    });
  });

  describe('getByCategory', () => {
    it('returns services in the Compute category', () => {
      const results = service.getByCategory('Compute');
      expect(results.length).toBeGreaterThan(0);
      results.forEach(r => expect(r.category).toBe('Compute'));
    });
  });
});
