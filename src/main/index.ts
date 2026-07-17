import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { createOverlayWindow } from './window';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { createTray } from './tray';
import { ConfigStore } from './config';
import { initAutoUpdater } from './updater';
import { applyStartupOptimizations, setupIdleDetection, startMemoryMonitor } from './performance';
import { SessionOrchestrator } from '../services/SessionOrchestrator';
import { Logger } from '../services/Logger';

let mainWindow: BrowserWindow | null = null;
let orchestrator: SessionOrchestrator | null = null;
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
    whisperModelPath: (config.get('whisperModelPath') as string) ?? undefined,
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

  // === Session IPC ===
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
  cleanupIdle?.();
  cleanupMemory?.();
  await logger.shutdown();
});
