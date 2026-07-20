import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { createOverlayWindow } from './window';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { createTray } from './tray';
import { ConfigStore } from './config';
import { initAutoUpdater } from './updater';
import { applyStartupOptimizations, setupIdleDetection, startMemoryMonitor } from './performance';
import { SessionOrchestrator } from '../services/SessionOrchestrator';
import { CognitoAuthService } from '../services/auth';
import { Logger } from '../services/Logger';

let mainWindow: BrowserWindow | null = null;
let orchestrator: SessionOrchestrator | null = null;
let authService: CognitoAuthService | null = null;
let cleanupIdle: (() => void) | null = null;
let cleanupMemory: (() => void) | null = null;
const logger = Logger.getInstance();
const log = logger.child('main');

const isDev = !app.isPackaged;

// Apply perf opts before app ready
applyStartupOptimizations();

async function createWindow() {
  mainWindow = createOverlayWindow();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createOrchestrator(): SessionOrchestrator {
  const config = ConfigStore.getInstance();

  const orch = new SessionOrchestrator({
    transcriptionMode: (config.get('transcriptionMode') as 'local' | 'cloud') ?? 'local',
    callType: (config.get('callType') as any) ?? 'discovery',
    awsRegion: (config.get('awsRegion') as string) ?? 'us-east-1',
    bedrockModelId: (config.get('bedrockModelId') as string) ?? undefined,
    whisperModelPath: (config.get('whisperModelPath') as string) ?? 'ggml-small.en.bin',
    apiUrl: (config.get('apiUrl') as string) ?? process.env.KIRA_API_URL ?? '',
    llmProvider: (config.get('llmProvider') as any) ?? 'bedrock',
    groqApiKey: (config.get('groqApiKey') as string) ?? process.env.GROQ_API_KEY ?? '',
    geminiApiKey: (config.get('geminiApiKey') as string) ?? process.env.GEMINI_API_KEY ?? '',
  });

  // Forward events to renderer via IPC
  orch.on('segment', (segment) => {
    mainWindow?.webContents.send('transcript-segment', segment);
  });

  orch.on('suggestion', (suggestion) => {
    mainWindow?.webContents.send('coaching-suggestion', suggestion);
  });

  orch.on('sentiment', (analysis) => {
    mainWindow?.webContents.send('sentiment-update', analysis);
  });

  orch.on('talk-ratio', (ratio) => {
    mainWindow?.webContents.send('talk-ratio-update', ratio);
  });

  orch.on('tech-mention', (mention) => {
    mainWindow?.webContents.send('tech-mention', mention);
  });

  orch.on('state-change', (state) => {
    mainWindow?.webContents.send('session-state', state);
  });

  orch.on('vad-change', (source, active) => {
    mainWindow?.webContents.send('vad-change', { source, active });
  });

  orch.on('error', (err) => {
    log.error('Orchestrator error', { message: err.message });
    mainWindow?.webContents.send('session-error', err.message);
  });

  orch.on('sync-status', (status) => {
    mainWindow?.webContents.send('sync-status', status);
  });

  return orch;
}

app.whenReady().then(async () => {
  await logger.initialize();
  log.info('K.I.R.A. starting', { version: app.getVersion(), dev: isDev });

  const config = ConfigStore.getInstance();

  mainWindow = await createWindow();
  registerHotkeys(mainWindow);
  createTray(mainWindow);
  orchestrator = createOrchestrator();

  // === Auth Service ===
  const cognitoClientId = (config.get('cognitoClientId') as string) ?? '6utrgprn6cvng5cr4ei93okv5s';
  const awsRegion = (config.get('awsRegion') as string) ?? 'us-east-1';
  authService = new CognitoAuthService({ region: awsRegion, clientId: cognitoClientId });

  // Wire auth events
  authService.on('authenticated', (state) => {
    log.info('User authenticated', { email: state.email });
    mainWindow?.webContents.send('auth-state-change', { isAuthenticated: true, email: state.email });
    // Set token on sync service
    if (state.tokens?.idToken) {
      orchestrator?.setSyncAuthToken(state.tokens.idToken);
    }
    // Persist tokens
    const stored = authService?.getTokensForStorage();
    if (stored) {
      config.set('authTokens', stored.tokens);
      config.set('authEmail', stored.email);
    }
  });

  authService.on('token-refreshed', (tokens) => {
    orchestrator?.setSyncAuthToken(tokens.idToken);
    config.set('authTokens', tokens);
  });

  authService.on('auth-expired', () => {
    log.info('Auth expired, user needs to re-login');
    mainWindow?.webContents.send('auth-state-change', { isAuthenticated: false });
  });

  authService.on('signed-out', () => {
    mainWindow?.webContents.send('auth-state-change', { isAuthenticated: false });
    config.set('authTokens', undefined);
    config.set('authEmail', undefined);
  });

  // Restore session from persisted tokens
  const storedTokens = config.get('authTokens') as any;
  const storedEmail = config.get('authEmail') as string | undefined;
  if (storedTokens && storedEmail) {
    authService.restoreSession(storedTokens, storedEmail).then((restored) => {
      if (restored) {
        log.info('Session restored', { email: storedEmail });
      } else {
        log.info('Session restore failed, need re-login');
      }
    });
  }

  // Auto-updater (skip in dev)
  if (!isDev) {
    initAutoUpdater(mainWindow);
  }

  // Idle detection — pause heavy services when user is away
  cleanupIdle = setupIdleDetection(
    () => { orchestrator?.stop(); },
    () => { /* resume is manual via hotkey */ }
  );

  // Memory monitoring
  cleanupMemory = startMemoryMonitor(mainWindow);

  // === Config IPC ===
  ipcMain.handle('get-config', (_event, key: string) => {
    return config.get(key);
  });

  ipcMain.handle('set-config', (_event, key: string, value: unknown) => {
    config.set(key, value);
  });

  // === Window IPC ===
  ipcMain.handle('set-opacity', (_event, opacity: number) => {
    if (mainWindow) {
      mainWindow.setOpacity(opacity);
      config.set('windowOpacity', opacity);
    }
  });

  ipcMain.handle('set-collapse', (_event, collapsed: boolean) => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      if (collapsed) {
        config.set('expandedHeight', bounds.height);
        mainWindow.setBounds({ ...bounds, height: 40 });
      } else {
        const expandedHeight = (config.get('expandedHeight') as number) || 600;
        mainWindow.setBounds({ ...bounds, height: expandedHeight });
      }
    }
  });

  ipcMain.handle('get-window-state', () => {
    if (mainWindow) {
      return {
        bounds: mainWindow.getBounds(),
        opacity: mainWindow.getOpacity(),
        isVisible: mainWindow.isVisible(),
      };
    }
    return null;
  });

  ipcMain.handle('toggle-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('close-window', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

  // === Session IPC ===
  ipcMain.handle('list-audio-devices', () => {
    try {
      const addon = require(
        path.resolve(process.resourcesPath ?? process.cwd(), 
          process.resourcesPath ? 'app.asar.unpacked/native/audio/build/Release/ghost_audio.node' : 'native/audio/build/Release/ghost_audio.node')
      );
      return addon.listSources();
    } catch {
      return [];
    }
  });

  ipcMain.handle('start-session', async (_event, sessionConfig: any) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not ready' };

    // Store meeting context for AI coaching
    if (sessionConfig.meetingContext) {
      config.set('currentMeetingContext', sessionConfig.meetingContext);
    }
    if (sessionConfig.meetingName) {
      config.set('currentMeetingName', sessionConfig.meetingName);
    }
    if (sessionConfig.callType) {
      orchestrator.setCallType(sessionConfig.callType);
      config.set('callType', sessionConfig.callType);
    }
    if (sessionConfig.myRole) {
      config.set('currentMyRole', sessionConfig.myRole);
    }
    if (sessionConfig.participants) {
      config.set('currentParticipants', sessionConfig.participants);
    }

    // Pass context to coaching engine
    const coaching = (orchestrator as any).coaching;
    if (coaching?.setMeetingContext) {
      coaching.setMeetingContext({
        name: sessionConfig.meetingName,
        context: sessionConfig.meetingContext,
        myRole: sessionConfig.myRole,
        participants: sessionConfig.participants,
      });
    }

    // Pass session config to orchestrator (for auto-save + speaker ID)
    orchestrator.setSessionConfig(sessionConfig);

    try {
      const success = await orchestrator.start();
      log.info('Session started', { success, name: sessionConfig.meetingName });
      return { success };
    } catch (err: any) {
      log.error('Session start failed', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('start-capture', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not ready' };
    try {
      const success = await orchestrator.start();
      log.info('Capture started', { success });
      return { success };
    } catch (err: any) {
      log.error('Capture start failed', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('stop-capture', () => {
    orchestrator?.stop();
    log.info('Capture stopped');
    return { success: true };
  });

  ipcMain.handle('set-call-type', (_event, callType: string) => {
    orchestrator?.setCallType(callType as any);
    config.set('callType', callType);
  });

  ipcMain.handle('get-session-state', () => {
    return orchestrator?.getState() ?? 'idle';
  });

  ipcMain.handle('get-transcript', () => {
    return orchestrator?.getTranscript() ?? [];
  });

  ipcMain.handle('get-suggestions', () => {
    return orchestrator?.getSuggestions() ?? [];
  });

  ipcMain.handle('get-talk-ratio', () => {
    return orchestrator?.getTalkRatio() ?? { you: 50, other: 50, yourWordCount: 0, otherWordCount: 0 };
  });

  // === First-run check ===
  ipcMain.handle('is-first-run', () => {
    return config.get('firstRun') ?? true;
  });

  ipcMain.handle('complete-setup', (_event, setupData: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(setupData)) {
      config.set(key, value);
    }
    config.set('firstRun', false);
    log.info('First-run setup completed');
  });

  // === Manual AI trigger ===
  ipcMain.handle('manual-ask', async (_event, question: string) => {
    if (!orchestrator) return;
    // Forward to coaching service through orchestrator
    const coaching = (orchestrator as any).coaching;
    if (coaching?.manualAsk) {
      await coaching.manualAsk(question);
    }
  });

  // === Data export ===
  ipcMain.handle('export-transcript', (_event, format: 'json' | 'csv') => {
    const transcript = orchestrator?.getTranscript() ?? [];
    if (format === 'csv') {
      const header = 'timestamp,speaker,text\n';
      const rows = transcript.map(s =>
        `"${new Date(s.timestamp).toISOString()}","${s.speakerName}","${s.text.replace(/"/g, '""')}"`
      ).join('\n');
      return header + rows;
    }
    return JSON.stringify(transcript, null, 2);
  });

  ipcMain.handle('export-suggestions', () => {
    return JSON.stringify(orchestrator?.getSuggestions() ?? [], null, 2);
  });

  // === Saved calls ===
  ipcMain.handle('list-saved-calls', async () => {
    return orchestrator?.listSavedCalls() ?? [];
  });

  ipcMain.handle('get-saved-call', async (_event, id: string) => {
    return orchestrator?.getSavedCall(id) ?? null;
  });

  // === Speaker rename (mid-session) ===
  ipcMain.handle('rename-speaker', (_event, source: 'you' | 'other', name: string) => {
    orchestrator?.renameSpeaker(source, name);
  });

  ipcMain.handle('get-speaker-names', () => {
    return orchestrator?.getSpeakerNames() ?? { you: 'You', other: 'Customer' };
  });

  // === Cloud Sync ===
  ipcMain.handle('set-sync-token', (_event, token: string) => {
    orchestrator?.setSyncAuthToken(token);
    const config = ConfigStore.getInstance();
    config.set('authToken', token);
    log.info('Sync auth token updated');
  });

  ipcMain.handle('get-sync-status', () => {
    return orchestrator?.getSyncStatus() ?? { pending: 0, failed: 0, total: 0 };
  });

  ipcMain.handle('force-sync', async () => {
    await orchestrator?.forceSyncNow();
    return orchestrator?.getSyncStatus() ?? { pending: 0, failed: 0, total: 0 };
  });

  ipcMain.handle('set-api-url', (_event, url: string) => {
    const config = ConfigStore.getInstance();
    config.set('apiUrl', url);
    log.info('API URL updated', { url });
  });

  // === LLM Provider ===
  ipcMain.handle('switch-llm-provider', (_event, provider: string, apiKey?: string) => {
    const config = ConfigStore.getInstance();
    config.set('llmProvider', provider);
    if (apiKey) {
      if (provider === 'groq') config.set('groqApiKey', apiKey);
      if (provider === 'gemini') config.set('geminiApiKey', apiKey);
    }
    orchestrator?.switchLLMProvider(provider as any, apiKey);
    log.info('LLM provider switched', { provider });
  });

  ipcMain.handle('get-llm-provider', () => {
    const config = ConfigStore.getInstance();
    return {
      provider: config.get('llmProvider') ?? 'bedrock',
      hasGroqKey: !!(config.get('groqApiKey')),
      hasGeminiKey: !!(config.get('geminiApiKey')),
    };
  });

  // === Auth IPC ===
  ipcMain.handle('auth-sign-in', async (_event, email: string, password: string) => {
    if (!authService) return { success: false, error: 'Auth service not ready' };
    return authService.signIn(email, password);
  });

  ipcMain.handle('auth-sign-up', async (_event, email: string, password: string) => {
    if (!authService) return { success: false, error: 'Auth service not ready' };
    return authService.signUp(email, password);
  });

  ipcMain.handle('auth-confirm-sign-up', async (_event, email: string, code: string) => {
    if (!authService) return { success: false, error: 'Auth service not ready' };
    return authService.confirmSignUp(email, code);
  });

  ipcMain.handle('auth-sign-out', async () => {
    await authService?.signOut();
  });

  ipcMain.handle('auth-get-state', () => {
    if (!authService) return { isAuthenticated: false };
    const state = authService.getState();
    return { isAuthenticated: state.isAuthenticated, email: state.email };
  });
});

app.on('window-all-closed', () => {
  unregisterHotkeys();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', async () => {
  unregisterHotkeys();
  orchestrator?.destroy();
  authService?.destroy();
  cleanupIdle?.();
  cleanupMemory?.();
  await logger.shutdown();
});
