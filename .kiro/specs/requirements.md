# Ghost Assistant — Requirements

## Overview
Ghost Assistant is an invisible, cross-platform AI-powered call companion that captures system audio, transcribes in real-time with speaker diarization, provides AI coaching and contextual guidance during calls, and saves everything to the cloud for later review. It is designed to be reusable across roles (presales, training, engineering, consulting) and portable across employers.

---

## Functional Requirements

### FR-1: System Audio Capture
- **FR-1.1**: Capture all system audio output (mic + speaker) without joining meetings as a bot
- **FR-1.2**: Support capture from any application (Teams, Google Meet, Zoom, Webex, phone calls via headset)
- **FR-1.3**: Auto-detect when a meeting/call begins (audio activity from conference apps) and activate
- **FR-1.4**: Auto-stop when call ends (silence detection + app focus loss)
- **FR-1.5**: Cross-platform audio capture (Linux via PulseAudio/PipeWire, macOS via CoreAudio/BlackHole, Windows via WASAPI)

### FR-2: Real-Time Transcription
- **FR-2.1**: Transcribe audio in real-time with <3 second latency
- **FR-2.2**: Speaker diarization — distinguish between "You" and other participants
- **FR-2.3**: Support multiple transcription backends:
  - Local: Whisper (free, offline, lower accuracy)
  - Cloud: AWS Transcribe Streaming (higher accuracy, speaker ID, costs ~$0.024/min)
- **FR-2.4**: Handle multiple languages (English primary, detect others)
- **FR-2.5**: Display live transcript in the overlay with speaker labels

### FR-3: AI Coaching Engine
- **FR-3.1**: Real-time analysis of conversation as it happens
- **FR-3.2**: Context-aware — understands the type of call (discovery, demo, training, requirements gathering)
- **FR-3.3**: Suggest questions to ask based on conversation flow and call type
- **FR-3.4**: When customer mentions a technology/product, provide:
  - Brief explanation (2-3 sentences)
  - Relevant documentation links
  - How it relates to what you offer
- **FR-3.5**: When customer asks a question, immediately research and surface an answer with:
  - Simple explanation
  - Deeper technical detail (expandable)
  - Source links
- **FR-3.6**: Competitor mention detection with battlecard info
- **FR-3.7**: Customer sentiment analysis (positive, confused, hesitant, frustrated)
- **FR-3.8**: Talk ratio tracking (real-time visual of you vs. customer speaking time)
- **FR-3.9**: Action item extraction from conversation
- **FR-3.10**: Adaptive learning — learns your style, terminology, common responses over time

### FR-4: Meeting Type Detection & Adaptation
- **FR-4.1**: Auto-detect or manually set call type: Discovery, Demo, Training, Technical Deep-Dive, Follow-up, Negotiation
- **FR-4.2**: Adjust coaching behavior per call type:
  - Discovery: focus on open-ended questions, pain points, decision criteria
  - Demo: focus on feature-benefit mapping, handling objections
  - Training: focus on comprehension checks, pacing, engagement
  - Requirements: focus on completeness, edge cases, clarifications
  - Follow-up: focus on action items from previous call, next steps
  - Negotiation: focus on value reinforcement, concession tracking

### FR-5: Knowledge & Web Access
- **FR-5.1**: Built-in web search capability for real-time information lookup
- **FR-5.2**: AWS documentation integration (searchable, always current)
- **FR-5.3**: Ability to add custom knowledge bases (company docs, product info)
- **FR-5.4**: Web scraping for technology lookups when customer mentions unfamiliar tech
- **FR-5.5**: Tool/agent architecture — extensible with new data sources

### FR-6: Invisible Overlay UI
- **FR-6.1**: Frameless, always-on-top floating window
- **FR-6.2**: Content-protected — invisible to screen sharing (OS-level flag)
- **FR-6.3**: Visible as a normal app in taskbar for the user
- **FR-6.4**: Resizable, draggable, can be minimized to a thin strip
- **FR-6.5**: Tabs/panels:
  - Live Transcript
  - AI Suggestions & Coaching
  - Context & Links
  - Talk Ratio & Sentiment
  - Action Items
- **FR-6.6**: Hotkey support:
  - Toggle visibility
  - Bookmark a moment
  - Ask AI a quick question
  - Start/stop capture manually
- **FR-6.7**: Opacity/transparency control

### FR-7: Post-Call Processing
- **FR-7.1**: Generate call summary with key topics discussed
- **FR-7.2**: Score the call across multiple dimensions:
  - Discovery depth (did you uncover enough info?)
  - Objection handling (how well did you address concerns?)
  - Next steps (were clear next steps established?)
  - Talk ratio (healthy balance?)
  - Technical accuracy (correct information shared?)
  - Engagement (did customer seem engaged?)
  - Question quality (relevant, open-ended, insightful?)
- **FR-7.3**: Suggest specific areas of improvement with examples from the call
- **FR-7.4**: Extract action items with owners and due dates
- **FR-7.5**: Generate follow-up email draft
- **FR-7.6**: Build searchable knowledge base from past calls

### FR-8: Cloud Storage & Dashboard
- **FR-8.1**: Save all transcripts, summaries, scores to cloud (AWS)
- **FR-8.2**: Web dashboard for reviewing past calls
- **FR-8.3**: Search across all historical transcripts (full-text search)
- **FR-8.4**: Filter by date range, call type, score, participants
- **FR-8.5**: Trend analysis — improvement over time visualized
- **FR-8.6**: Data retention — indefinite (configurable), accessible months/years later
- **FR-8.7**: Data portability — export all data (JSON/CSV) at any time
- **FR-8.8**: User-owned — tied to personal account, not employer

### FR-9: Pre-Call Preparation
- **FR-9.1**: If participant info provided, pull company/person context (LinkedIn, website)
- **FR-9.2**: Surface notes from previous calls with same participants
- **FR-9.3**: Suggest agenda/topics based on call type and history

### FR-10: Personalization & Learning
- **FR-10.1**: Learn user's communication style over time
- **FR-10.2**: Track which suggestions were useful (user feedback loop)
- **FR-10.3**: Build personal FAQ from repeated answers
- **FR-10.4**: Adapt vocabulary and formality to match user's style
- **FR-10.5**: Role-aware — switch between presales, trainer, engineer, consultant modes
- **FR-10.6**: Company-context aware — understands current employer's products/services

---

## Non-Functional Requirements

### NFR-1: Performance
- **NFR-1.1**: CPU usage <5% during idle, <15% during active transcription
- **NFR-1.2**: RAM usage <200MB baseline, <500MB during active call
- **NFR-1.3**: Transcription latency <3 seconds
- **NFR-1.4**: AI suggestion latency <5 seconds
- **NFR-1.5**: App startup <3 seconds

### NFR-2: Cross-Platform
- **NFR-2.1**: Linux (Ubuntu/Fedora — primary)
- **NFR-2.2**: macOS (Monterey+)
- **NFR-2.3**: Windows (10/11)

### NFR-3: Security & Privacy
- **NFR-3.1**: No audio stored — only text transcripts
- **NFR-3.2**: All cloud data encrypted at rest (AES-256)
- **NFR-3.3**: All communication encrypted in transit (TLS 1.3)
- **NFR-3.4**: API keys stored in OS keychain, never in plaintext
- **NFR-3.5**: Optional: local-only mode (no cloud, everything on device)

### NFR-4: Cost Efficiency
- **NFR-4.1**: Target monthly cost <$20 for moderate usage (5-10 calls/week)
- **NFR-4.2**: Free tier available using local Whisper + no cloud features
- **NFR-4.3**: Pay-per-use model — no idle costs when not in calls

### NFR-5: Portability & Shareability
- **NFR-5.1**: Single installer per platform (AppImage/DMG/EXE)
- **NFR-5.2**: First-run setup wizard for API keys and preferences
- **NFR-5.3**: Shareable — can give the installer to colleagues
- **NFR-5.4**: User accounts independent of employer

### NFR-6: Stealth
- **NFR-6.1**: Window excluded from screen capture/share APIs at OS level
- **NFR-6.2**: No notification popups that could leak to screen share
- **NFR-6.3**: Silent operation — no sounds from the app itself
- **NFR-6.4**: Minimal visual footprint — can collapse to near-invisible

---

## User Stories

### US-1: Presales Discovery Call
> As a presales consultant, I want real-time coaching during discovery calls so that I ask the right questions and don't miss important qualification criteria, even when the conversation moves fast.

### US-2: Technical Demo
> As a solutions architect, I want instant lookup of technical details when a customer asks about a specific service so that I can give accurate answers without saying "let me get back to you."

### US-3: Training Delivery
> As a trainer delivering AWS courses, I want to see if participants seem confused and get suggestions for better explanations so that I can adapt my teaching in real-time.

### US-4: Requirements Gathering
> As an engineer in a requirements meeting, I want the AI to flag gaps in what's been discussed and suggest clarifying questions so that I capture complete requirements.

### US-5: Post-Call Review
> As a professional, I want to review my call performance over time, see my scores improve, and access any past meeting details instantly so that I continuously improve.

### US-6: Screen Sharing Safety
> As someone who screen shares frequently, I want absolute confidence that nobody on the call can see my AI assistant so that I maintain professionalism.

### US-7: Portability
> As someone who may change jobs, I want my call history and personal AI improvements to stay with me so that I don't lose my accumulated knowledge.

---

## Constraints

- Must not require participants' consent UI (captures from user's own audio output)
- Must not join meetings as a visible bot
- Must work without internet in degraded mode (local Whisper, no AI coaching)
- Must not send raw audio to any external service — only text chunks for AI processing
- Budget-conscious: prefer serverless/pay-per-use over always-on infrastructure
