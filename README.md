# K.I.R.A. — Knowledge, Insights & Response Assistant

Invisible AI-powered call companion with real-time transcription and coaching. Hidden from screen share, visible only to you.

## Features

- **Invisible overlay** — content-protected window, invisible to screen share
- **Real-time transcription** — local (whisper.cpp, free) or cloud (AWS Transcribe)
- **AI coaching** — question suggestions, tech context lookups, sentiment analysis
- **7-dimension scoring** — post-call analysis with actionable improvements
- **Multi-platform** — Linux, macOS, Windows

## Quick Start

```bash
# Install dependencies
npm install

# Download whisper model (first time only)
./scripts/download-model.sh

# Build native audio addon (requires libpulse-dev on Linux)
cd native/audio && npm install && npm run build && cd ../..

# Run in development
npm run dev
```

## Download Pre-built

Go to [Releases](../../releases) and download:
- **Linux**: `.AppImage` (just make executable and run)
- **macOS**: `.dmg`
- **Windows**: `.exe` installer

## Release a New Version

```bash
# Tag and push — GitHub Actions builds all platforms automatically
git tag v0.1.0
git push origin v0.1.0
```

Installers appear in the GitHub Releases tab within ~10 minutes.

## Project Structure

```
src/
├── main/          Electron main process (window, tray, hotkeys, IPC)
├── renderer/      React UI (panels, components, hooks)
└── services/      Backend logic
    ├── audio/         Native audio capture wrapper
    ├── transcription/ Whisper + AWS Transcribe engines
    ├── coaching/      Bedrock AI coaching (triggers, prompts, agents)
    ├── knowledge/     Web search, AWS docs, knowledge base
    ├── postcall/      Post-call analysis + scoring
    ├── cloud/         Sync service (S3, DynamoDB)
    ├── learning/      Personalization + feedback
    └── precall/       Pre-call preparation

native/audio/      C++ N-API addon (PulseAudio, CoreAudio, WASAPI)
infra/             AWS CDK stack (DynamoDB, S3, Cognito, API GW, CloudFront)
dashboard/         Web dashboard (React SPA for reviewing past calls)
scripts/           Utility scripts (model download)
tests/             Vitest unit + e2e tests
```

## Hotkeys

| Key | Action |
|-----|--------|
| Ctrl+Shift+G | Toggle visibility |
| Ctrl+Shift+M | Collapse/expand |
| Ctrl+Shift+R | Start/stop capture |
| Ctrl+Shift+A | Quick ask AI |
| Ctrl+Shift+B | Bookmark moment |

## AWS Setup (optional — for AI coaching + cloud sync)

1. Configure AWS credentials: `aws configure`
2. Deploy infrastructure: `cd infra && npm install && npx cdk deploy`
3. AI coaching uses Bedrock (Claude 3.5 Sonnet) — enable in the AWS console

Without AWS, K.I.R.A. still works with local Whisper transcription (no AI coaching).

## License

MIT
