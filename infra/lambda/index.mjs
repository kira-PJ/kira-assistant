import { DynamoDBClient, QueryCommand, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamo = new DynamoDBClient({});
const s3 = new S3Client({});

const CALLS_TABLE = process.env.CALLS_TABLE;
const TRANSCRIPTS_BUCKET = process.env.TRANSCRIPTS_BUCKET;

/**
 * K.I.R.A. API Lambda Handler
 *
 * Routes:
 *   GET  /calls         — list user's calls (metadata only)
 *   POST /calls         — save a new call (metadata to DynamoDB, transcript to S3)
 *   GET  /calls/{id}    — get a call with full transcript from S3
 *   POST /search        — search across calls
 */
export const handler = async (event) => {
  // Store event for CORS origin resolution
  globalThis._currentEvent = event;
  const method = event.httpMethod;
  const path = event.resource;
  const userId = extractUserId(event);

  if (!userId) {
    return response(401, { error: 'Unauthorized' });
  }

  try {
    // GET /calls — list calls
    if (method === 'GET' && path === '/calls') {
      return await listCalls(userId);
    }

    // POST /calls — create/sync a call
    if (method === 'POST' && path === '/calls') {
      const body = JSON.parse(event.body || '{}');
      return await saveCall(userId, body);
    }

    // GET /calls/{callId} — get single call with transcript
    if (method === 'GET' && path === '/calls/{callId}') {
      const callId = event.pathParameters?.callId;
      return await getCall(userId, callId);
    }

    // POST /search
    if (method === 'POST' && path === '/search') {
      const body = JSON.parse(event.body || '{}');
      return await searchCalls(userId, body.query);
    }

    return response(404, { error: 'Not found' });
  } catch (err) {
    console.error('Handler error:', err);
    return response(500, { error: 'Internal server error', message: err.message });
  }
};

// === Route Handlers ===

async function listCalls(userId) {
  const result = await dynamo.send(new QueryCommand({
    TableName: CALLS_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': { S: userId } },
    ScanIndexForward: false, // newest first
    ProjectionExpression: 'callId, callName, callDate, durationMs, callType, participants, segmentCount, myRole, score',
  }));

  const calls = (result.Items || []).map(item => unmarshall(item));
  return response(200, { calls, count: calls.length });
}

async function saveCall(userId, body) {
  // === Input Validation ===
  if (!body || typeof body !== 'object') {
    return response(400, { error: 'Request body must be a JSON object' });
  }

  // Size check — reject payloads over 2MB (Lambda limit is 6MB, but let's be conservative)
  const bodySize = JSON.stringify(body).length;
  if (bodySize > 2 * 1024 * 1024) {
    return response(413, { error: 'Payload too large. Maximum 2MB.' });
  }

  // Validate callId format
  const callId = body.summary?.id || body.callId || `call-${Date.now()}`;
  if (typeof callId !== 'string' || callId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(callId)) {
    return response(400, { error: 'Invalid callId format' });
  }

  // Sanitize string fields (prevent XSS if displayed in dashboard)
  const sanitize = (str) => typeof str === 'string' ? str.slice(0, 1000).replace(/[<>]/g, '') : '';
  const sanitizeLong = (str) => typeof str === 'string' ? str.slice(0, 10000) : '';

  const now = new Date().toISOString();

  // Extract metadata for DynamoDB
  const item = {
    userId,
    callId,
    callName: sanitize(body.summary?.title || body.name || 'Untitled Call'),
    callDate: body.summary?.date ? new Date(body.summary.date).toISOString() : now,
    durationMs: Math.max(0, Math.min(Number(body.summary?.durationMs || body.durationMs) || 0, 86400000)), // max 24h
    callType: sanitize(body.summary?.callType || body.callType || 'discovery'),
    participants: sanitize(body.summary?.participants?.join(', ') || body.participants || ''),
    myRole: sanitize(body.myRole || 'leading'),
    segmentCount: Math.max(0, Math.min(Number(body.segmentCount) || 0, 50000)),
    context: sanitizeLong(body.context || body.summary?.synopsis || ''),
    score: Math.max(0, Math.min(Number(body.score?.overall) || 0, 100)),
    talkRatio: body.talkRatio || { you: 50, other: 50 },
    totalWords: body.totalWords || { you: 0, other: 0 },
    createdAt: now,
    updatedAt: now,
  };

  // Save metadata to DynamoDB
  await dynamo.send(new PutItemCommand({
    TableName: CALLS_TABLE,
    Item: marshall(item, { removeUndefinedValues: true }),
  }));

  // Save full transcript to S3 (if provided)
  if (body.transcript || body.summary) {
    const transcriptData = {
      callId,
      transcript: body.transcript || [],
      cleanTranscript: body.cleanTranscript || body.processed?.cleanTranscript || [],
      summary: body.summary || {},
      score: body.score || {},
      actionItems: body.actionItems || [],
      followUpEmail: body.followUpEmail || {},
      processed: body.processed || null,
    };

    await s3.send(new PutObjectCommand({
      Bucket: TRANSCRIPTS_BUCKET,
      Key: `${userId}/${callId}.json`,
      Body: JSON.stringify(transcriptData),
      ContentType: 'application/json',
    }));
  }

  return response(201, { success: true, callId });
}

async function getCall(userId, callId) {
  // Get metadata from DynamoDB
  const result = await dynamo.send(new GetItemCommand({
    TableName: CALLS_TABLE,
    Key: marshall({ userId, callId }),
  }));

  if (!result.Item) {
    return response(404, { error: 'Call not found' });
  }

  const metadata = unmarshall(result.Item);

  // Get full transcript from S3
  let transcript = [];
  let fullData = {};
  try {
    const s3Result = await s3.send(new GetObjectCommand({
      Bucket: TRANSCRIPTS_BUCKET,
      Key: `${userId}/${callId}.json`,
    }));
    const bodyStr = await s3Result.Body.transformToString();
    fullData = JSON.parse(bodyStr);
    transcript = fullData.transcript || [];
  } catch (err) {
    // S3 object might not exist for old calls
    console.warn(`No transcript in S3 for ${callId}:`, err.message);
  }

  return response(200, {
    ...metadata,
    transcript,
    cleanTranscript: fullData.cleanTranscript || [],
    summary: fullData.summary || {},
    score: fullData.score || {},
    actionItems: fullData.actionItems || [],
    processed: fullData.processed || null,
  });
}

async function searchCalls(userId, query) {
  if (!query || typeof query !== 'string') {
    return response(400, { error: 'query parameter required (string)' });
  }
  if (query.length > 200) {
    return response(400, { error: 'query too long (max 200 chars)' });
  }

  // Query all calls for user then filter (DynamoDB has no FTS)
  const result = await dynamo.send(new QueryCommand({
    TableName: CALLS_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': { S: userId } },
  }));

  const items = (result.Items || []).map(item => unmarshall(item));
  const terms = query.toLowerCase().split(/\s+/);

  const matches = items.filter(item => {
    const searchable = JSON.stringify(item).toLowerCase();
    return terms.every(t => searchable.includes(t));
  }).slice(0, 20);

  return response(200, { results: matches, total: matches.length });
}

// === Helpers ===

function extractUserId(event) {
  // Cognito authorizer puts claims in requestContext
  const claims = event.requestContext?.authorizer?.claims;
  if (claims?.sub) return claims.sub;
  if (claims?.['cognito:username']) return claims['cognito:username'];

  // Fallback: parse from Authorization header (for testing)
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (authHeader) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.sub;
    } catch { /* ignore */ }
  }

  return null;
}

const ALLOWED_ORIGINS = new Set([
  'https://kira.sentibay.com',
  'https://d3722i2y1crm55.cloudfront.net',
  'app://kira-assistant',
]);

function response(statusCode, body) {
  const event = globalThis._currentEvent;
  const requestOrigin = event?.headers?.origin || event?.headers?.Origin || '';
  const origin = ALLOWED_ORIGINS.has(requestOrigin) ? requestOrigin : 'https://kira.sentibay.com';

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify(body),
  };
}
