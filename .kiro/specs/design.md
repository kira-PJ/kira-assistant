# Ghost Assistant — Technical Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        DESKTOP APP (Electron)                    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │  Overlay UI  │  │  System Tray │  │  Hotkey Manager     │   │
│  │  (React)     │  │  Controls    │  │                     │   │
│  └──────┬───────┘  └──────────────┘  └─────────────────────┘   │
│         │                                                        │
│  ┌──────┴────────────────────────────────────────────────────┐  │
│  │                  IPC Bridge (Electron IPC)                  │  │
│  └──────┬────────────────────────────────────────────────────┘  │
│         │                                                        │
│  ┌──────┴───────────────────────────────────────────────────┐   │
│  │              Backend Services (Node.js Main Process)       │   │
│  │                                                           │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │   │
│  │  │Audio Capture│  │ Transcription │  │  AI Coach      │  │   │
│  │  │  Service    │  │   Service     │  │  Service       │  │   │
│  │  │(Native Addon│  │(Whisper/AWS)  │  │  (Bedrock)     │  │   │
│  │  └─────────────┘  └──────────────┘  └────────────────┘  │   │
│  │                                                           │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │   │
│  │  │ Web Search  │  │  Knowledge   │  │  Session Mgr   │  │   │
│  │  │   Service   │  │    Base      │  │  & Scoring     │  │   │
│  │  └─────────────┘  └──────────────┘  └────────────────┘  │   │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │    AWS Cloud         │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ Amazon Bedrock │  │
                    │  │ (Claude 3.5)   │  │
                    │  └────────────────┘  │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ AWS Transcribe │  │
                    │  │ (Streaming)    │  │
                    │  └────────────────┘  │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ S3 + DynamoDB  │  │
                    │  │ (Storage)      │  │
                    │  └────────────────┘  │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ CloudFront +   │  │
                    │  │ S3 (Dashboard) │  │
                    │  └────────────────┘  │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ Cognito (Auth) │  │
                    │  └────────────────┘  │
                    │                      │
                    └─────────────────────┘
```

---

## Technology Stack

### Desktop Application
| Component | Technology | Rationale |
|-----------|-----------|-----------|
| App Shell | Electron 28+ | Cross-platform, content protection API, mature ecosystem |
| UI Framework | React 18 + Tailwind CSS | Fast rendering, utility-first styling for compact overlay |
| State Management | Zustand | Lightweight, minimal boilerplate |
| Audio Capture | Node.js native addon (N-API) | Direct OS audio API access with minimal overhead |
| Local Transcription | whisper.cpp (via node binding) | C++ performance, no Python runtime needed |
| IPC | Electron IPC + EventEmitter | Native, zero overhead |
| Storage (local) | SQLite (better-sqlite3) | Fast, file-based, queryable |
| Hotkeys | electron-globalShortcut | System-wide hotkey registration |

### AWS Services
| Service | Purpose | Cost Estimate |
|---------|---------|---------------|
| Amazon Transcribe Streaming | Real-time transcription with speaker diarization | ~$0.024/min |
| Amazon Bedrock (Claude 3.5 Sonnet) | AI coaching, suggestions, scoring, summaries | ~$0.003/1K input tokens, $0.015/1K output |
| Amazon S3 | Transcript storage, dashboard hosting | ~$0.023/GB/month |
| Amazon DynamoDB | Metadata, search index, user profiles | On-demand ~$1.25/million writes |
| Amazon Cognito | User authentication (personal accounts) | Free tier: 50K MAU |
| Amazon CloudFront | Dashboard CDN | ~$0.085/GB transfer |
| AWS Lambda | API backend for dashboard | Free tier: 1M requests/month |
| Amazon OpenSearch Serverless | Full-text transcript search | ~$0.24/OCU-hour (use sparingly) |

**Estimated monthly cost for moderate use (8 calls/week, 30 min avg):**
- Transcribe: 8 * 4 * 30 * $0.024 = ~$23 (or $0 with local Whisper)
- Bedrock: ~$5-10 (coaching prompts are short)
- Storage: <$1
- **Total: $6-34/month depending on transcription choice**

### Alternative: Hybrid Approach (Recommended)
- Use **local Whisper** for transcription (free, good enough for English)
- Use **AWS Transcribe** only when high-accuracy diarization needed (toggle)
- Use **Bedrock Claude** for AI features (best cost/quality ratio)
- **Estimated: $5-15/month**

---

## Component Design

### 1. Audio Capture Service

```
Platform Detection → Audio Backend Selection → Stream Capture → Buffer → Send to Transcription

Linux:   PipeWire/PulseAudio monitor source
macOS:   CoreAudio aggregate device (or BlackHole virtual device)
Windows: WASAPI loopback capture
```

**Key Design Decisions:**
- Capture both mic (user's voice) and system audio (other participants) as separate streams
- Two-stream approach enables speaker diarization even with local Whisper
- Buffer in 5-second chunks for transcription efficiency
- Use native Node.js addon (N-API) for minimal overhead
- Auto-detect audio activity to trigger start/stop

### 2. Transcription Service

**Dual-Mode Architecture:**

```
Audio Buffer
    │
    ├─── Local Mode ───→ whisper.cpp (quantized model, ~1GB RAM)
    │                     └─→ Transcript chunks
    │
    └─── Cloud Mode ───→ AWS Transcribe Streaming
                          └─→ Transcript with speaker labels
```

- Local Whisper uses the `small.en` model (good balance of speed/accuracy)
- Cloud Transcribe used when diarization accuracy is critical
- Both emit standardized transcript events: `{ speaker, text, timestamp, confidence }`

### 3. AI Coaching Engine

**Architecture: Event-driven with context window management**

```
Transcript Stream
    │
    ├─→ Context Accumulator (rolling window of last 5 min)
    │
    ├─→ Trigger Detector
    │       ├─ Technology mention → Lookup Agent
    │       ├─ Question detected → Answer Agent  
    │       ├─ Silence/pause     → Suggestion Agent
    │       ├─ Sentiment shift   → Alert Agent
    │       └─ Time interval     → Ratio/Summary Agent
    │
    └─→ Bedrock Claude (via streaming API)
            └─→ Structured response → UI Update
```

**Prompt Engineering Strategy:**
- System prompt defines the role, call type, and user context
- Rolling context window prevents token bloat (last ~2000 tokens of transcript)
- Each "agent" is a different prompt template triggered by specific events
- Responses are structured JSON for easy UI rendering

**Cost Control:**
- Batch transcript chunks (don't send every word)
- Trigger AI only on meaningful events (questions, pauses, tech mentions)
- Cache common lookups locally
- Use Claude 3.5 Haiku for simple lookups, Sonnet for complex coaching

### 4. Knowledge & Web Search

```
Trigger (tech mention / customer question)
    │
    ├─→ Local Cache (SQLite) — check if we've seen this before
    │
    ├─→ AWS Documentation (pre-indexed) — check built-in knowledge
    │
    └─→ Web Search (Tavily/Brave API) — real-time web lookup
            └─→ Summarize via Bedrock → Display in Context panel
```

- Pre-load AWS service summaries locally (JSON file, ~5MB)
- Web search for anything not in local cache
- Results cached for future calls

### 5. Overlay UI Design

```
┌─────────────────────────────────────────┐
│ 🔴 Recording  │ Discovery Call │ 45:12  │  ← Status bar
├─────────────────────────────────────────┤
│ [Transcript] [Coach] [Context] [Score]  │  ← Tab bar
├─────────────────────────────────────────┤
│                                         │
│ You: "Tell me about your current       │  ← Active tab content
│      infrastructure..."                  │
│                                         │
│ Customer: "We're running SAP HANA       │
│ on-premise with about 2TB of data..."   │
│                                         │
│ ┌─ 💡 Suggested Questions ────────────┐ │
│ │ • What's your RPO/RTO requirement?  │ │
│ │ • Have you considered RISE with SAP? │ │
│ │ • What's your current backup strategy│ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ 📚 Context: SAP HANA ─────────────┐ │
│ │ In-memory database for real-time    │ │
│ │ analytics. On AWS: runs on EC2      │ │
│ │ (x2idn) or via RISE with SAP.      │ │
│ │ [AWS Docs] [SAP on AWS Guide]       │ │
│ └─────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ 🎤 You: 62% │ 😊 Positive │ ⏱ 12:34   │  ← Footer metrics
└─────────────────────────────────────────┘
```

**Stealth Properties:**
- `setContentProtection(true)` — Electron API, hides from screen capture
- Frameless window with custom title bar
- Configurable opacity (10%-100%)
- Can collapse to a 40px tall strip showing only status
- Draggable to any screen position
- Resizable (min 300px wide, max 600px)

### 6. Session & Scoring

**Post-Call Pipeline:**
```
Call Ends
    │
    ├─→ Full transcript assembled
    ├─→ Send to Bedrock for analysis
    │       ├─ Summary generation
    │       ├─ Score calculation (7 dimensions)
    │       ├─ Action item extraction
    │       ├─ Improvement suggestions
    │       └─ Follow-up email draft
    │
    ├─→ Save to local SQLite (immediate)
    ├─→ Sync to AWS (S3 + DynamoDB) (background)
    │
    └─→ Update personal learning model
```

**Scoring Rubric (each 1-10):**
1. Discovery Depth
2. Objection Handling
3. Next Steps Clarity
4. Talk Ratio Balance
5. Technical Accuracy
6. Customer Engagement
7. Question Quality

### 7. Cloud Architecture (Dashboard)

```
┌─────────────────────────────────────────────────┐
│  Static Dashboard (React SPA)                    │
│  Hosted: S3 + CloudFront                         │
│                                                  │
│  Auth: Cognito User Pool (email/password)        │
│                                                  │
│  API: API Gateway + Lambda                       │
│       GET  /calls          — list calls          │
│       GET  /calls/:id      — get call detail     │
│       GET  /calls/search   — full-text search    │
│       GET  /stats          — trends & scores     │
│       POST /calls          — sync from desktop   │
│       GET  /export         — export all data     │
│                                                  │
│  Storage:                                        │
│       DynamoDB — call metadata, scores           │
│       S3 — full transcripts (JSON)               │
│                                                  │
│  Search:                                         │
│       DynamoDB with GSI (cost-effective)         │
│       OR OpenSearch Serverless (if needed later) │
└─────────────────────────────────────────────────┘
```

---

## Data Models

### Call Record (DynamoDB)
```json
{
  "userId": "string (partition key)",
  "callId": "string (sort key, ULID)",
  "timestamp": "ISO 8601",
  "duration": "number (seconds)",
  "callType": "discovery | demo | training | requirements | followup | negotiation",
  "participants": ["string"],
  "summary": "string",
  "scores": {
    "discoveryDepth": 8,
    "objectionHandling": 7,
    "nextSteps": 9,
    "talkRatio": 6,
    "technicalAccuracy": 8,
    "engagement": 7,
    "questionQuality": 8,
    "overall": 7.6
  },
  "actionItems": [
    { "text": "string", "owner": "string", "dueDate": "string" }
  ],
  "tags": ["string"],
  "transcriptKey": "s3://ghost-assistant-transcripts/{userId}/{callId}.json",
  "improvements": ["string"],
  "followUpEmail": "string"
}
```

### Transcript (S3 JSON)
```json
{
  "callId": "string",
  "segments": [
    {
      "speaker": "You | Customer | Participant 2",
      "text": "string",
      "startTime": 0.0,
      "endTime": 5.2,
      "confidence": 0.95
    }
  ],
  "aiInteractions": [
    {
      "timestamp": 120.5,
      "type": "suggestion | context | answer | alert",
      "content": "string",
      "wasHelpful": true
    }
  ]
}
```

### User Profile (DynamoDB)
```json
{
  "userId": "string",
  "email": "string",
  "preferences": {
    "transcriptionMode": "local | cloud",
    "coachingLevel": "minimal | moderate | aggressive",
    "callTypes": ["discovery", "demo"],
    "currentRole": "presales | trainer | engineer | consultant",
    "currentCompany": "string",
    "knowledgeBases": ["aws", "sap", "custom"]
  },
  "learningProfile": {
    "communicationStyle": "string",
    "commonTopics": ["string"],
    "strengthAreas": ["string"],
    "improvementAreas": ["string"],
    "totalCalls": 0,
    "averageScore": 0.0
  }
}
```

---

## Security Design

1. **Local secrets**: Stored in OS keychain (keytar library)
   - AWS credentials (via AWS CLI profile or access keys)
   - Cognito tokens
2. **Audio privacy**: Never stored, never sent to cloud — only derived text
3. **Data ownership**: Cognito account is personal email, not corporate SSO
4. **Encryption**: S3 SSE-S3, DynamoDB encryption at rest, TLS everywhere
5. **Local DB**: SQLite with application-level encryption (optional)

---

## Offline/Degraded Mode

| Feature | Online | Offline |
|---------|--------|---------|
| Audio Capture | ✅ | ✅ |
| Transcription | Cloud (accurate) | Local Whisper |
| AI Coaching | ✅ | ❌ (shows "offline" badge) |
| Web Search | ✅ | Local cache only |
| Transcript Save | Cloud + Local | Local only (syncs later) |
| Dashboard | ✅ | ❌ |

---

## Performance Budget

| Metric | Target | Approach |
|--------|--------|----------|
| CPU (idle) | <5% | Event-driven, no polling |
| CPU (active) | <15% | Whisper.cpp quantized, batch processing |
| RAM (idle) | <100MB | Electron baseline |
| RAM (active) | <400MB | Whisper model loaded on demand |
| Startup | <3s | Lazy-load heavy modules |
| Disk | <500MB | Whisper model + app + local DB |
