import { AWSServiceInfo } from './types';

/**
 * AWSDocsService - Local AWS service knowledge for instant lookups
 *
 * Pre-loaded service summaries with keyword matching for real-time
 * context during calls. No network required for basic lookups.
 */
export class AWSDocsService {
  private services: Map<string, AWSServiceInfo>;
  private keywordIndex: Map<string, string[]>; // keyword → service shortNames

  constructor() {
    this.services = new Map();
    this.keywordIndex = new Map();
    this.loadServices();
  }

  /**
   * Look up a service by name or keyword
   */
  lookup(term: string): AWSServiceInfo | null {
    const normalized = term.toLowerCase().trim();

    // Direct match by shortName
    for (const [, svc] of this.services) {
      if (svc.shortName.toLowerCase() === normalized ||
          svc.name.toLowerCase() === normalized) {
        return svc;
      }
    }

    // Keyword match
    const matches = this.keywordIndex.get(normalized);
    if (matches && matches.length > 0) {
      return this.services.get(matches[0]) ?? null;
    }

    // Fuzzy match
    for (const [, svc] of this.services) {
      if (svc.name.toLowerCase().includes(normalized) ||
          svc.shortName.toLowerCase().includes(normalized)) {
        return svc;
      }
    }

    return null;
  }

  /**
   * Search across all services
   */
  search(query: string, limit = 5): AWSServiceInfo[] {
    const terms = query.toLowerCase().split(/\s+/);
    const scored: { service: AWSServiceInfo; score: number }[] = [];

    for (const [, svc] of this.services) {
      let score = 0;
      const searchable = `${svc.name} ${svc.description} ${svc.useCases.join(' ')} ${svc.category}`.toLowerCase();

      for (const term of terms) {
        if (svc.shortName.toLowerCase() === term) score += 10;
        if (svc.name.toLowerCase().includes(term)) score += 5;
        if (svc.category.toLowerCase().includes(term)) score += 3;
        if (searchable.includes(term)) score += 1;
      }

      if (score > 0) {
        scored.push({ service: svc, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.service);
  }

  /**
   * Get documentation URL for a service
   */
  getDocUrl(serviceName: string): string {
    const svc = this.lookup(serviceName);
    return svc?.docUrl ?? `https://docs.aws.amazon.com/${serviceName.toLowerCase()}/`;
  }

  /**
   * Get all services in a category
   */
  getByCategory(category: string): AWSServiceInfo[] {
    const results: AWSServiceInfo[] = [];
    for (const [, svc] of this.services) {
      if (svc.category.toLowerCase() === category.toLowerCase()) {
        results.push(svc);
      }
    }
    return results;
  }

  private loadServices(): void {
    const data: AWSServiceInfo[] = [
      {
        name: 'Amazon EC2', shortName: 'EC2',
        description: 'Virtual servers in the cloud. Resizable compute capacity for running applications.',
        category: 'Compute',
        useCases: ['web hosting', 'batch processing', 'dev/test', 'high-performance computing'],
        relatedServices: ['Auto Scaling', 'ELB', 'EBS'],
        docUrl: 'https://docs.aws.amazon.com/ec2/',
        pricingUrl: 'https://aws.amazon.com/ec2/pricing/',
      },
      {
        name: 'Amazon S3', shortName: 'S3',
        description: 'Object storage with industry-leading scalability, availability, and security.',
        category: 'Storage',
        useCases: ['data lake', 'backup', 'static hosting', 'media storage', 'big data analytics'],
        relatedServices: ['CloudFront', 'Glacier', 'Transfer Family'],
        docUrl: 'https://docs.aws.amazon.com/s3/',
        pricingUrl: 'https://aws.amazon.com/s3/pricing/',
      },
      {
        name: 'AWS Lambda', shortName: 'Lambda',
        description: 'Run code without provisioning servers. Pay only for compute time consumed.',
        category: 'Compute',
        useCases: ['event processing', 'APIs', 'data transformation', 'automation', 'microservices'],
        relatedServices: ['API Gateway', 'Step Functions', 'EventBridge'],
        docUrl: 'https://docs.aws.amazon.com/lambda/',
        pricingUrl: 'https://aws.amazon.com/lambda/pricing/',
      },
      {
        name: 'Amazon DynamoDB', shortName: 'DynamoDB',
        description: 'Fully managed NoSQL database with single-digit millisecond performance at any scale.',
        category: 'Database',
        useCases: ['gaming', 'IoT', 'mobile backends', 'session management', 'real-time bidding'],
        relatedServices: ['DAX', 'Streams', 'Global Tables'],
        docUrl: 'https://docs.aws.amazon.com/dynamodb/',
        pricingUrl: 'https://aws.amazon.com/dynamodb/pricing/',
      },
      {
        name: 'Amazon RDS', shortName: 'RDS',
        description: 'Managed relational database service. Supports MySQL, PostgreSQL, SQL Server, Oracle, MariaDB.',
        category: 'Database',
        useCases: ['web apps', 'ERP', 'CRM', 'e-commerce'],
        relatedServices: ['Aurora', 'ElastiCache', 'DMS'],
        docUrl: 'https://docs.aws.amazon.com/rds/',
        pricingUrl: 'https://aws.amazon.com/rds/pricing/',
      },
      {
        name: 'Amazon Aurora', shortName: 'Aurora',
        description: 'MySQL/PostgreSQL-compatible relational database with up to 5x performance of standard MySQL.',
        category: 'Database',
        useCases: ['SaaS apps', 'enterprise apps', 'high-throughput OLTP'],
        relatedServices: ['RDS', 'DMS', 'ElastiCache'],
        docUrl: 'https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/',
        pricingUrl: 'https://aws.amazon.com/rds/aurora/pricing/',
      },
      {
        name: 'Amazon ECS', shortName: 'ECS',
        description: 'Fully managed container orchestration service for Docker containers.',
        category: 'Containers',
        useCases: ['microservices', 'batch jobs', 'machine learning', 'CI/CD'],
        relatedServices: ['Fargate', 'ECR', 'EKS'],
        docUrl: 'https://docs.aws.amazon.com/ecs/',
        pricingUrl: 'https://aws.amazon.com/ecs/pricing/',
      },
      {
        name: 'Amazon EKS', shortName: 'EKS',
        description: 'Managed Kubernetes service for running K8s on AWS without managing the control plane.',
        category: 'Containers',
        useCases: ['microservices', 'hybrid deployments', 'ML training', 'batch processing'],
        relatedServices: ['ECS', 'Fargate', 'ECR'],
        docUrl: 'https://docs.aws.amazon.com/eks/',
        pricingUrl: 'https://aws.amazon.com/eks/pricing/',
      },
      {
        name: 'AWS Fargate', shortName: 'Fargate',
        description: 'Serverless compute for containers. No need to manage servers or clusters.',
        category: 'Containers',
        useCases: ['microservices', 'batch processing', 'machine learning inference'],
        relatedServices: ['ECS', 'EKS', 'ECR'],
        docUrl: 'https://docs.aws.amazon.com/AmazonECS/latest/userguide/what-is-fargate.html',
        pricingUrl: 'https://aws.amazon.com/fargate/pricing/',
      },
      {
        name: 'Amazon CloudFront', shortName: 'CloudFront',
        description: 'Global CDN for fast, secure content delivery with low latency.',
        category: 'Networking',
        useCases: ['static site delivery', 'API acceleration', 'video streaming', 'security'],
        relatedServices: ['S3', 'WAF', 'Route 53', 'Lambda@Edge'],
        docUrl: 'https://docs.aws.amazon.com/cloudfront/',
        pricingUrl: 'https://aws.amazon.com/cloudfront/pricing/',
      },
      {
        name: 'Amazon API Gateway', shortName: 'API Gateway',
        description: 'Create, publish, maintain, and secure APIs at any scale.',
        category: 'Networking',
        useCases: ['REST APIs', 'WebSocket APIs', 'microservice frontends'],
        relatedServices: ['Lambda', 'Cognito', 'WAF'],
        docUrl: 'https://docs.aws.amazon.com/apigateway/',
        pricingUrl: 'https://aws.amazon.com/api-gateway/pricing/',
      },
      {
        name: 'Amazon Bedrock', shortName: 'Bedrock',
        description: 'Fully managed foundation models (Claude, Titan, Llama) via API. Build generative AI apps.',
        category: 'AI/ML',
        useCases: ['chatbots', 'content generation', 'summarization', 'RAG', 'code generation'],
        relatedServices: ['SageMaker', 'Kendra', 'Lex'],
        docUrl: 'https://docs.aws.amazon.com/bedrock/',
        pricingUrl: 'https://aws.amazon.com/bedrock/pricing/',
      },
      {
        name: 'Amazon SageMaker', shortName: 'SageMaker',
        description: 'Build, train, and deploy ML models at scale with fully managed infrastructure.',
        category: 'AI/ML',
        useCases: ['model training', 'MLOps', 'notebooks', 'inference endpoints'],
        relatedServices: ['Bedrock', 'Comprehend', 'Rekognition'],
        docUrl: 'https://docs.aws.amazon.com/sagemaker/',
        pricingUrl: 'https://aws.amazon.com/sagemaker/pricing/',
      },
      {
        name: 'Amazon Cognito', shortName: 'Cognito',
        description: 'User authentication, authorization, and user management for web and mobile apps.',
        category: 'Security',
        useCases: ['user sign-up/sign-in', 'social identity federation', 'MFA', 'token management'],
        relatedServices: ['IAM', 'API Gateway', 'Amplify'],
        docUrl: 'https://docs.aws.amazon.com/cognito/',
        pricingUrl: 'https://aws.amazon.com/cognito/pricing/',
      },
      {
        name: 'AWS CloudFormation', shortName: 'CloudFormation',
        description: 'Infrastructure as Code. Model and provision AWS resources using templates.',
        category: 'Management',
        useCases: ['IaC', 'environment replication', 'compliance', 'disaster recovery'],
        relatedServices: ['CDK', 'SAM', 'Service Catalog'],
        docUrl: 'https://docs.aws.amazon.com/cloudformation/',
        pricingUrl: 'https://aws.amazon.com/cloudformation/pricing/',
      },
      {
        name: 'AWS CDK', shortName: 'CDK',
        description: 'Define cloud infrastructure using programming languages (TypeScript, Python, Java, etc.).',
        category: 'Management',
        useCases: ['IaC', 'reusable constructs', 'multi-stack apps'],
        relatedServices: ['CloudFormation', 'SAM', 'CodePipeline'],
        docUrl: 'https://docs.aws.amazon.com/cdk/',
        pricingUrl: 'https://aws.amazon.com/cdk/',
      },
      {
        name: 'Amazon Kinesis', shortName: 'Kinesis',
        description: 'Real-time data streaming. Collect, process, and analyze data streams.',
        category: 'Analytics',
        useCases: ['real-time analytics', 'log processing', 'IoT telemetry', 'clickstream'],
        relatedServices: ['Lambda', 'Firehose', 'Analytics'],
        docUrl: 'https://docs.aws.amazon.com/kinesis/',
        pricingUrl: 'https://aws.amazon.com/kinesis/pricing/',
      },
      {
        name: 'Amazon EventBridge', shortName: 'EventBridge',
        description: 'Serverless event bus for connecting applications using events.',
        category: 'Application Integration',
        useCases: ['event-driven architecture', 'SaaS integration', 'automation'],
        relatedServices: ['Lambda', 'Step Functions', 'SNS'],
        docUrl: 'https://docs.aws.amazon.com/eventbridge/',
        pricingUrl: 'https://aws.amazon.com/eventbridge/pricing/',
      },
      {
        name: 'AWS Step Functions', shortName: 'Step Functions',
        description: 'Visual workflow orchestration for distributed applications and microservices.',
        category: 'Application Integration',
        useCases: ['order processing', 'ETL orchestration', 'ML pipelines', 'human approval workflows'],
        relatedServices: ['Lambda', 'ECS', 'EventBridge'],
        docUrl: 'https://docs.aws.amazon.com/step-functions/',
        pricingUrl: 'https://aws.amazon.com/step-functions/pricing/',
      },
      {
        name: 'Amazon VPC', shortName: 'VPC',
        description: 'Isolated virtual network. Full control over IP ranges, subnets, routing, and security.',
        category: 'Networking',
        useCases: ['network isolation', 'hybrid connectivity', 'multi-tier architectures'],
        relatedServices: ['Transit Gateway', 'PrivateLink', 'Direct Connect'],
        docUrl: 'https://docs.aws.amazon.com/vpc/',
        pricingUrl: 'https://aws.amazon.com/vpc/pricing/',
      },
      {
        name: 'AWS IAM', shortName: 'IAM',
        description: 'Identity and Access Management. Control access to AWS services and resources securely.',
        category: 'Security',
        useCases: ['access control', 'least privilege', 'cross-account access', 'service roles'],
        relatedServices: ['Organizations', 'SSO', 'STS'],
        docUrl: 'https://docs.aws.amazon.com/iam/',
        pricingUrl: 'https://aws.amazon.com/iam/',
      },
      {
        name: 'Amazon ElastiCache', shortName: 'ElastiCache',
        description: 'Managed in-memory caching (Redis, Memcached) for microsecond latency.',
        category: 'Database',
        useCases: ['session caching', 'real-time analytics', 'leaderboards', 'pub/sub'],
        relatedServices: ['RDS', 'DynamoDB', 'MemoryDB'],
        docUrl: 'https://docs.aws.amazon.com/elasticache/',
        pricingUrl: 'https://aws.amazon.com/elasticache/pricing/',
      },
      {
        name: 'Amazon SNS', shortName: 'SNS',
        description: 'Pub/sub messaging service for A2A and A2P messaging.',
        category: 'Application Integration',
        useCases: ['notifications', 'fan-out', 'mobile push', 'email/SMS alerts'],
        relatedServices: ['SQS', 'Lambda', 'EventBridge'],
        docUrl: 'https://docs.aws.amazon.com/sns/',
        pricingUrl: 'https://aws.amazon.com/sns/pricing/',
      },
      {
        name: 'Amazon SQS', shortName: 'SQS',
        description: 'Fully managed message queue service for decoupling and scaling microservices.',
        category: 'Application Integration',
        useCases: ['work queues', 'decoupling', 'buffering', 'batch processing'],
        relatedServices: ['SNS', 'Lambda', 'Step Functions'],
        docUrl: 'https://docs.aws.amazon.com/sqs/',
        pricingUrl: 'https://aws.amazon.com/sqs/pricing/',
      },
      {
        name: 'AWS Glue', shortName: 'Glue',
        description: 'Serverless ETL service for data discovery, preparation, and integration.',
        category: 'Analytics',
        useCases: ['ETL', 'data catalog', 'data lake formation', 'schema discovery'],
        relatedServices: ['Athena', 'Redshift', 'Lake Formation'],
        docUrl: 'https://docs.aws.amazon.com/glue/',
        pricingUrl: 'https://aws.amazon.com/glue/pricing/',
      },
      {
        name: 'Amazon Athena', shortName: 'Athena',
        description: 'Interactive SQL query service for data in S3. Serverless, pay per query.',
        category: 'Analytics',
        useCases: ['ad-hoc analysis', 'log analysis', 'data lake queries'],
        relatedServices: ['S3', 'Glue', 'QuickSight'],
        docUrl: 'https://docs.aws.amazon.com/athena/',
        pricingUrl: 'https://aws.amazon.com/athena/pricing/',
      },
      {
        name: 'Amazon Redshift', shortName: 'Redshift',
        description: 'Cloud data warehouse for petabyte-scale analytics using SQL.',
        category: 'Analytics',
        useCases: ['business intelligence', 'reporting', 'data warehousing', 'historical analytics'],
        relatedServices: ['Glue', 'QuickSight', 'S3'],
        docUrl: 'https://docs.aws.amazon.com/redshift/',
        pricingUrl: 'https://aws.amazon.com/redshift/pricing/',
      },
      {
        name: 'AWS Elastic Beanstalk', shortName: 'Elastic Beanstalk',
        description: 'Deploy and manage web apps without worrying about infrastructure. Supports Java, .NET, Node.js, Python, Ruby.',
        category: 'Compute',
        useCases: ['web apps', 'APIs', 'rapid deployment', '.NET hosting'],
        relatedServices: ['EC2', 'RDS', 'CloudWatch'],
        docUrl: 'https://docs.aws.amazon.com/elasticbeanstalk/',
        pricingUrl: 'https://aws.amazon.com/elasticbeanstalk/pricing/',
      },
      {
        name: 'AWS DMS', shortName: 'DMS',
        description: 'Database Migration Service. Migrate databases to AWS with minimal downtime.',
        category: 'Migration',
        useCases: ['homogeneous migration', 'heterogeneous migration', 'continuous replication'],
        relatedServices: ['SCT', 'RDS', 'Aurora'],
        docUrl: 'https://docs.aws.amazon.com/dms/',
        pricingUrl: 'https://aws.amazon.com/dms/pricing/',
      },
      {
        name: 'AWS Migration Hub', shortName: 'Migration Hub',
        description: 'Central location to track migration progress across multiple AWS and partner solutions.',
        category: 'Migration',
        useCases: ['migration tracking', 'application discovery', 'migration planning'],
        relatedServices: ['DMS', 'Application Migration Service', 'Server Migration Service'],
        docUrl: 'https://docs.aws.amazon.com/migrationhub/',
        pricingUrl: 'https://aws.amazon.com/migration-hub/pricing/',
      },
    ];

    // Load into map and build keyword index
    for (const svc of data) {
      this.services.set(svc.shortName, svc);

      // Index keywords
      const keywords = [
        svc.shortName.toLowerCase(),
        svc.name.toLowerCase(),
        ...svc.useCases.flatMap(u => u.toLowerCase().split(/\s+/)),
        svc.category.toLowerCase(),
      ];

      for (const kw of keywords) {
        if (kw.length < 3) continue;
        const existing = this.keywordIndex.get(kw) ?? [];
        if (!existing.includes(svc.shortName)) {
          existing.push(svc.shortName);
          this.keywordIndex.set(kw, existing);
        }
      }
    }
  }
}
