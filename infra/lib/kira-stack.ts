import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class KiraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // === DynamoDB Tables ===

    const callsTable = new dynamodb.Table(this, 'CallsTable', {
      tableName: 'kira-calls',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'callId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // GSI for querying by date
    callsTable.addGlobalSecondaryIndex({
      indexName: 'byDate',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'callDate', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'kira-users',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const learningTable = new dynamodb.Table(this, 'LearningTable', {
      tableName: 'kira-learning',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'entryId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // === S3 Buckets ===

    const transcriptsBucket = new s3.Bucket(this, 'TranscriptsBucket', {
      bucketName: `kira-transcripts-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [
        {
          id: 'archive-old-transcripts',
          transitions: [
            { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: cdk.Duration.days(90) },
            { storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(365) },
          ],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // === Cognito ===

    const userPool = new cognito.UserPool(this, 'KiraUserPool', {
      userPoolName: 'kira-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient('KiraDesktopClient', {
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      preventUserExistenceErrors: true,
    });

    // === Lambda Functions ===

    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      functionName: 'kira-api',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CALLS_TABLE: callsTable.tableName,
        USERS_TABLE: usersTable.tableName,
        LEARNING_TABLE: learningTable.tableName,
        TRANSCRIPTS_BUCKET: transcriptsBucket.bucketName,
      },
    });

    // Grant permissions
    callsTable.grantReadWriteData(apiHandler);
    usersTable.grantReadWriteData(apiHandler);
    learningTable.grantReadWriteData(apiHandler);
    transcriptsBucket.grantReadWrite(apiHandler);

    // === API Gateway ===

    const api = new apigateway.RestApi(this, 'KiraApi', {
      restApiName: 'kira-api',
      description: 'K.I.R.A. backend API',
      defaultCorsPreflightOptions: {
        allowOrigins: ['https://kira.sentibay.com', 'https://d3722i2y1crm55.cloudfront.net', 'app://kira-assistant'],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
        allowCredentials: true,
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'KiraAuthorizer', {
      cognitoUserPools: [userPool],
    });

    const calls = api.root.addResource('calls');
    calls.addMethod('GET', new apigateway.LambdaIntegration(apiHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    calls.addMethod('POST', new apigateway.LambdaIntegration(apiHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const callById = calls.addResource('{callId}');
    callById.addMethod('GET', new apigateway.LambdaIntegration(apiHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    callById.addMethod('DELETE', new apigateway.LambdaIntegration(apiHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // === Outputs ===

    // === CloudFront Distribution for Dashboard ===

    const dashboardBucket = new s3.Bucket(this, 'DashboardBucket', {
      bucketName: `kira-dashboard-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'DashboardCDN', {
      defaultBehavior: {
        origin: new cloudfront_origins.S3Origin(dashboardBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html', // SPA fallback
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // === Search Lambda (full-text search across transcripts) ===

    const searchHandler = new lambda.Function(this, 'SearchHandler', {
      functionName: 'kira-search',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
        const { unmarshall } = require('@aws-sdk/util-dynamodb');
        const client = new DynamoDBClient({});

        exports.handler = async (event) => {
          const { userId, query } = JSON.parse(event.body || '{}');
          if (!userId || !query) {
            return { statusCode: 400, body: JSON.stringify({ error: 'userId and query required' }) };
          }

          // Query all calls for user then filter client-side (DynamoDB doesn't have FTS)
          const result = await client.send(new QueryCommand({
            TableName: process.env.CALLS_TABLE,
            KeyConditionExpression: 'userId = :uid',
            ExpressionAttributeValues: { ':uid': { S: userId } },
          }));

          const items = (result.Items || []).map(item => unmarshall(item));
          const terms = query.toLowerCase().split(/\\s+/);

          const matches = items.filter(item => {
            const searchable = JSON.stringify(item).toLowerCase();
            return terms.every(t => searchable.includes(t));
          }).slice(0, 20);

          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results: matches, total: matches.length }),
          };
        };
      `),
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        CALLS_TABLE: callsTable.tableName,
      },
    });

    callsTable.grantReadData(searchHandler);

    const search = api.root.addResource('search');
    search.addMethod('POST', new apigateway.LambdaIntegration(searchHandler), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // === Outputs ===

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'TranscriptsBucketName', { value: transcriptsBucket.bucketName });
    new cdk.CfnOutput(this, 'DashboardUrl', { value: `https://${distribution.domainName}` });
    new cdk.CfnOutput(this, 'DashboardBucketName', { value: dashboardBucket.bucketName });
  }
}
