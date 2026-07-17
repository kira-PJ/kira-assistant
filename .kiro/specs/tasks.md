# Ghost Assistant — Implementation Tasks

## Phase 1: Foundation (Desktop Shell + Audio) ✅ COMPLETE
> Goal: Get a working invisible window that captures system audio

### Task 1.1: Project Scaffolding ✅
- [x] Initialize Electron project with React renderer
- [x] Set up build tooling (Vite 8 for renderer, tsc for main)
- [x] Configure electron-builder for cross-platform packaging
- [x] Set up project structure (main/, renderer/, services/)
- [x] Add Tailwind CSS v4 and base UI components
- [x] Create .env.example and config management (electron-store)

### Task 1.2: Invisible Overlay Window ✅
- [x] Create frameless BrowserWindow with alwaysOnTop
- [x] Enable `setContentProtection(true)` for screen-share invisibility
- [x] Implement draggable title bar region
- [x] Add resize handles (min 300px, max 600px width)
- [x] Implement opacity slider (10%-100%)
- [x] Add "collapse to strip" mode (40px height)
- [x] Register global hotkeys (toggle visibility, collapse, quick-ask)
- [x] System tray icon with context menu (Start/Stop, Settings, Quit)

### Task 1.3: Audio Capture Service ✅
- [x] Create native Node.js addon (N-API) for audio capture
- [x] Linux: PipeWire/PulseAudio monitor source capture
- [x] macOS: CoreAudio loopback via aggregate device
- [x] Windows: WASAPI loopback capture
- [x] Implement dual-stream capture (mic + system audio separately)
- [x] Audio activity detection (VAD — Voice Activity Detection)
- [x] Buffer management (5-second PCM chunks, 16kHz mono)
- [x] Meeting auto-detection (detect conference app audio activity)

---

]## Phase 2: Transcription ✅ COMPLETE
> Goal: Real-time speech-to-text with speaker identification

### Task 2.1: Local Transcription (Whisper) ✅
- [x] Integrate whisper.cpp via CLI binary binding
- [x] Bundle quantized whisper-small.en model (download script)
- [x] Implement streaming inference (process 5s chunks)
- [x] Add VAD-based segment splitting
- [x] Speaker diarization via dual-stream (mic=You, system=Others)
- [x] Emit standardized transcript events

### Task 2.2: Cloud Transcription (AWS Transcribe) ✅
- [x] Integrate AWS Transcribe Streaming SDK
- [x] Configure streaming session with speaker diarization
- [x] Handle WebSocket connection lifecycle
- [x] Map AWS speaker labels to participant names
- [x] Implement automatic fallback to local on connection failure
- [x] Add transcription mode toggle in UI

### Task 2.3: Transcript Display ✅
- [x] Build live transcript component (auto-scrolling)
- [x] Color-coded speaker labels (You = blue, Customer = green)
- [x] Confidence-based text styling (dim low-confidence words)
- [x] Timestamp markers
- [x] Bookmark button for marking important moments
- [x] Copy-to-clipboard for selected text

---

## Phase 3: AI Coaching Engine ✅ COMPLETE
> Goal: Real-time AI-powered guidance during calls

### Task 3.1: Bedrock Integration ✅
- [x] Set up AWS Bedrock client (Claude 3.5 Sonnet via ConverseStream)
- [x] Implement streaming response handling
- [x] Build prompt template system (per call type, per trigger)
- [x] Context window management (rolling recent segments)
- [x] Rate limiting and cost tracking
- [x] Response caching for repeated queries

### Task 3.2: Trigger System ✅
- [x] Technology/product mention detector (NER-lite via regex + keyword list)
- [x] Question detection (customer asking something)
- [x] Sentiment analysis trigger (tone shift detection)
- [x] Silence/pause detector (opportunity for suggestion)
- [x] Time-interval triggers (periodic summary, talk ratio update)
- [x] Manual trigger via hotkey ("Ask AI about...")

### Task 3.3: Coaching Agents ✅
- [x] Question Suggester — recommends questions based on call type + context
- [x] Answer Agent — researches and answers customer questions in real-time
- [x] Context Agent — explains technologies/products mentioned
- [x] Sentiment Agent — tracks customer mood and alerts on shifts
- [x] Summary Agent — periodic "story so far" updates
- [x] All agents output structured JSON for UI rendering

### Task 3.4: Call Type Adaptation ✅
- [x] Call type selector (manual) + auto-detection from early conversation
- [x] Per-type system prompts and coaching strategies
- [x] Discovery: MEDDIC/BANT framework suggestions
- [x] Demo: feature-benefit mapping, objection responses
- [x] Training: comprehension checks, engagement tactics
- [x] Requirements: completeness checklist, edge case prompts

---

## Phase 4: Knowledge & Web Access ✅ COMPLETE
> Goal: Real-time information lookup and knowledge base

### Task 4.1: Web Search Integration ✅
- [x] Integrate Tavily API for web search
- [x] Implement search-and-summarize pipeline
- [x] Cache search results locally (TTL: 24 hours)
- [x] Rate limit web searches (max 2/minute during calls)

### Task 4.2: AWS Documentation ✅
- [x] Pre-process AWS service summaries into local data (30 services)
- [x] Keyword-to-service mapping for quick lookup
- [x] Deep-link generation to official AWS docs
- [x] Periodic update mechanism (download script)

### Task 4.3: Custom Knowledge Base ✅
- [x] File-based knowledge import (markdown, text)
- [x] Company profile/services description storage
- [x] Personal FAQ builder (from past successful answers)
- [x] Searchable local knowledge store (SQLite FTS5 + in-memory fallback)

---

## Phase 5: Post-Call Processing & Scoring ✅ COMPLETE
> Goal: After call ends, generate comprehensive analysis

### Task 5.1: Call Analysis Pipeline ✅
- [x] Detect call end (silence + meeting app loses focus)
- [x] Assemble full transcript with timestamps
- [x] Send to Bedrock for comprehensive analysis (single large prompt)
- [x] Parse structured response (summary, scores, action items, improvements)
- [x] Generate follow-up email draft
- [x] Calculate talk ratio from transcript speaker segments

### Task 5.2: Scoring System ✅
- [x] Define scoring rubrics for each of 7 dimensions
- [x] Implement scoring prompt (examples-based for consistency)
- [x] Display score card with radar chart
- [x] Show specific examples from call for each score
- [x] Track score history for trend analysis
- [x] Provide actionable improvement suggestions

### Task 5.3: Action Item Extraction ✅
- [x] Extract commitments, deadlines, assignments from transcript
- [x] Structured output: what, who, when
- [x] Display in dedicated panel post-call
- [x] Include in follow-up email draft

---

## Phase 6: Cloud & Dashboard ✅ COMPLETE
> Goal: Persist data and provide historical access

### Task 6.1: AWS Infrastructure (CDK) ✅
- [x] Define DynamoDB tables (calls, users, learning)
- [x] Create S3 bucket (transcripts with lifecycle rules)
- [x] Set up Cognito User Pool (email/password auth)
- [x] Create API Gateway + Lambda functions
- [x] Configure CloudFront distribution for dashboard
- [x] IAM roles and policies (least privilege)
- [x] Deploy script (CDK)

### Task 6.2: Sync Service ✅
- [x] Background sync after call ends (transcript + metadata → AWS)
- [x] Retry logic for failed uploads (exponential backoff, max 5 retries)
- [x] Offline queue (persisted to disk, sync when connection restored)
- [x] Conflict resolution (local always wins for same callId)

### Task 6.3: Web Dashboard ✅
- [x] React SPA with routing (BrowserRouter)
- [x] Call list view (sortable, filterable by date/type/score)
- [x] Call detail view (full transcript, scores, action items)
- [x] Search across all transcripts (Lambda full-text search)
- [x] Score trends chart (bar chart over time)
- [x] Data export (JSON/CSV download)
- [x] Responsive design (works on phone for quick review)

---

## Phase 7: Personalization & Learning ✅ COMPLETE
> Goal: App improves over time based on usage

### Task 7.1: Learning System ✅
- [x] Track which AI suggestions user acts on (implicit feedback)
- [x] Add thumbs up/down on suggestions (explicit feedback)
- [x] Build user communication style profile (vocabulary, formality level)
- [x] Store successful Q&A pairs for future reuse
- [x] Role switching (presales ↔ trainer ↔ engineer) changes all prompts

### Task 7.2: Pre-Call Preparation ✅
- [x] Manual participant entry (name, company, role)
- [x] Web lookup for participant/company context
- [x] Surface notes from previous calls with same people
- [x] Suggest agenda based on call type + history

---

## Phase 8: Polish & Distribution ✅ COMPLETE
> Goal: Production-ready, shareable application

### Task 8.1: Packaging ✅
- [x] Electron-builder config for Linux (AppImage + .deb)
- [x] Electron-builder config for macOS (.dmg)
- [x] Electron-builder config for Windows (NSIS installer)
- [x] Auto-update mechanism (electron-updater with S3 backend)
- [x] First-run setup wizard (API keys, preferences, test audio)

### Task 8.2: Performance Optimization ✅
- [x] Profile and optimize CPU usage during calls
- [x] Lazy-load Whisper model (load on first call, unload after)
- [x] Optimize Electron memory (disable unused Chromium features)
- [x] Implement idle detection (full sleep when no meeting for 30 min)

### Task 8.3: Testing & Reliability ✅
- [x] Unit tests for audio processing, transcript parsing
- [x] Integration tests for AWS services
- [x] E2E test with sample audio file
- [x] Error handling and crash recovery
- [x] Logging system (local, rotated, exportable for debugging)

---

## Implementation Priority

| Phase | Effort | Value | Status |
|-------|--------|-------|--------|
| Phase 1: Foundation | High | Critical | ✅ Done |
| Phase 2: Transcription | Medium | Critical | ✅ Done |
| Phase 3: AI Coaching | High | High | ✅ Done |
| Phase 4: Knowledge | Medium | High | ✅ Done |
| Phase 5: Scoring | Medium | Medium | ✅ Done |
| Phase 6: Cloud | Medium | Medium | ✅ Done |
| Phase 7: Learning | Low | Medium | ✅ Done |
| Phase 8: Polish | Medium | High | ✅ Done |

---

## MVP Definition (Phases 1-3) ✅ COMPLETE

The minimum viable product includes:
1. ✅ Invisible overlay window (content-protected)
2. ✅ System audio capture (Linux via PulseAudio/PipeWire)
3. ✅ Real-time transcription (local Whisper)
4. ✅ Basic AI coaching (question suggestions, tech explanations)
5. ✅ Transcript display with speaker diarization
6. ✅ Sentiment analysis + talk ratio tracking

Everything else is iterative enhancement on a working foundation.
