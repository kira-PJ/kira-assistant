import { TranscriptSegment } from '../transcription/types';
import { TechMention, Sentiment } from './types';

/**
 * TriggerDetector - Lightweight NER and pattern detection
 * 
 * Detects:
 * - Technology/product mentions (regex + keyword list)
 * - Questions from the customer
 * - Sentiment shifts
 * - Silence/pause opportunities
 * - Action items in conversation
 */
export class TriggerDetector {
  private techKeywords: Map<string, string[]>;
  private questionPatterns: RegExp[];
  private sentimentPatterns: Map<Sentiment, RegExp[]>;

  constructor() {
    this.techKeywords = this.buildTechKeywords();
    this.questionPatterns = this.buildQuestionPatterns();
    this.sentimentPatterns = this.buildSentimentPatterns();
  }

  /**
   * Detect technology mentions in a segment
   */
  detectTechMentions(segment: TranscriptSegment): TechMention[] {
    const mentions: TechMention[] = [];
    const textLower = segment.text.toLowerCase();

    for (const [category, keywords] of this.techKeywords) {
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
        if (regex.test(segment.text)) {
          mentions.push({
            term: keyword,
            context: `${category}: ${segment.text.slice(0, 100)}`,
            timestamp: segment.timestamp,
          });
        }
      }
    }

    return mentions;
  }

  /**
   * Detect if a segment contains a question from the customer
   */
  isQuestion(segment: TranscriptSegment): boolean {
    if (segment.speaker === 'you') return false;

    const text = segment.text.trim();
    
    // Explicit question mark
    if (text.endsWith('?')) return true;

    // Question patterns without '?'
    for (const pattern of this.questionPatterns) {
      if (pattern.test(text)) return true;
    }

    return false;
  }

  /**
   * Analyze sentiment from recent text
   */
  analyzeSentiment(recentText: string): { sentiment: Sentiment; confidence: number } {
    const textLower = recentText.toLowerCase();
    const scores: Record<Sentiment, number> = {
      positive: 0,
      neutral: 0,
      confused: 0,
      hesitant: 0,
      frustrated: 0,
    };

    for (const [sentiment, patterns] of this.sentimentPatterns) {
      for (const pattern of patterns) {
        const matches = textLower.match(pattern);
        if (matches) {
          scores[sentiment] += matches.length;
        }
      }
    }

    // Find dominant sentiment
    let maxSentiment: Sentiment = 'neutral';
    let maxScore = 0;
    let totalScore = 0;

    for (const [sentiment, score] of Object.entries(scores)) {
      totalScore += score;
      if (score > maxScore) {
        maxScore = score;
        maxSentiment = sentiment as Sentiment;
      }
    }

    // Confidence is how dominant the top sentiment is
    const confidence = totalScore > 0 ? Math.min(maxScore / Math.max(totalScore, 1), 1) : 0.5;

    return {
      sentiment: maxScore === 0 ? 'neutral' : maxSentiment,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * Detect potential action items in text
   */
  detectActionItems(text: string): string[] {
    const patterns = [
      /(?:I(?:'ll| will)|we(?:'ll| will)|let me)\s+(.{10,80})/gi,
      /(?:action item|todo|follow[- ]up|next step)[:\s]+(.{10,80})/gi,
      /(?:can you|could you|would you|please)\s+(.{10,80})/gi,
      /(?:by|before|deadline|due)\s+(?:next|this|end of|tomorrow|monday|tuesday|wednesday|thursday|friday)\s*(.{0,40})/gi,
    ];

    const items: string[] = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const item = match[0].trim();
        if (item.length > 15 && item.length < 200) {
          items.push(item);
        }
      }
    }

    return items;
  }

  private buildTechKeywords(): Map<string, string[]> {
    return new Map([
      ['AWS Services', [
        'EC2', 'S3', 'Lambda', 'DynamoDB', 'RDS', 'Aurora', 'ECS', 'EKS', 'Fargate',
        'CloudFormation', 'CDK', 'SageMaker', 'Bedrock', 'Redshift', 'Glue', 'Athena',
        'Kinesis', 'SNS', 'SQS', 'API Gateway', 'CloudFront', 'Route 53', 'VPC',
        'IAM', 'Cognito', 'KMS', 'CloudWatch', 'CloudTrail', 'Config',
        'Step Functions', 'EventBridge', 'AppSync', 'Amplify', 'Lightsail',
        'Elastic Beanstalk', 'CodePipeline', 'CodeBuild', 'CodeDeploy',
      ]],
      ['Cloud Providers', [
        'Azure', 'GCP', 'Google Cloud', 'Oracle Cloud', 'IBM Cloud',
        'DigitalOcean', 'Heroku', 'Vercel', 'Netlify',
      ]],
      ['Databases', [
        'PostgreSQL', 'MySQL', 'SQL Server', 'MongoDB', 'Redis', 'Elasticsearch',
        'Cassandra', 'DynamoDB', 'Neo4j', 'CockroachDB', 'MariaDB', 'Oracle DB',
      ]],
      ['Languages & Frameworks', [
        'Python', 'JavaScript', 'TypeScript', 'Java', 'C#', '.NET', 'Go', 'Rust',
        'React', 'Angular', 'Vue', 'Node.js', 'Django', 'Flask', 'Spring Boot',
        'FastAPI', 'Next.js', 'Express', 'Ruby on Rails',
      ]],
      ['DevOps & Infrastructure', [
        'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'GitLab CI',
        'GitHub Actions', 'ArgoCD', 'Helm', 'Prometheus', 'Grafana', 'Datadog',
        'New Relic', 'PagerDuty', 'Splunk', 'ELK Stack',
      ]],
      ['Concepts', [
        'microservices', 'serverless', 'containerization', 'CI/CD', 'DevOps',
        'infrastructure as code', 'event-driven', 'CQRS', 'saga pattern',
        'circuit breaker', 'service mesh', 'API gateway', 'load balancing',
        'auto-scaling', 'multi-tenancy', 'zero trust', 'compliance',
        'HIPAA', 'SOC 2', 'GDPR', 'PCI DSS', 'FedRAMP',
      ]],
    ]);
  }

  private buildQuestionPatterns(): RegExp[] {
    return [
      /^(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does|will|did)/i,
      /\b(tell me about|explain|describe|what's|how's|what is|how do)\b/i,
      /\b(wondering|curious|interested to know|like to understand)\b/i,
    ];
  }

  private buildSentimentPatterns(): Map<Sentiment, RegExp[]> {
    return new Map([
      ['positive', [
        /\b(great|excellent|perfect|love|amazing|fantastic|awesome|good|nice|helpful|impressed|excited)\b/gi,
        /\b(that's exactly|makes sense|sounds good|looking forward|interested)\b/gi,
      ]],
      ['confused', [
        /\b(confused|don't understand|unclear|not sure|what do you mean|lost me|huh|wait)\b/gi,
        /\b(can you explain|repeat that|slow down|go back)\b/gi,
      ]],
      ['hesitant', [
        /\b(maybe|perhaps|not sure|might|could be|I guess|possibly|we'll see)\b/gi,
        /\b(need to think|check with|get back to you|run it by)\b/gi,
      ]],
      ['frustrated', [
        /\b(frustrated|annoying|doesn't work|broken|issue|problem|terrible|waste|difficult)\b/gi,
        /\b(already tried|told you|keep|again|still|why can't)\b/gi,
      ]],
    ]);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
