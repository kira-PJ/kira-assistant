import { contextBridge, ipcRenderer, clipboard } from 'electron';

contextBridge.exposeInMainWorld('ghostAPI', {
  // === Config ===
  getConfig: (key: string) => ipcRenderer.invoke('get-config', key),
  setConfig: (key: string, value: unknown) => ipcRenderer.invoke('set-config', key, value),

  // === Window ===
  setOpacity: (opacity: number) => ipcRenderer.invoke('set-opacity', opacity),
  setCollapse: (collapsed: boolean) => ipcRenderer.invoke('set-collapse', collapsed),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  toggleMaximize: () => ipcRenderer.invoke('toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // === Clipboard ===
  copyToClipboard: (text: string) => clipboard.writeText(text),

  // === Session / Capture ===
  startCapture: () => ipcRenderer.invoke('start-capture'),
  stopCapture: () => ipcRenderer.invoke('stop-capture'),
  setCallType: (type: string) => ipcRenderer.invoke('set-call-type', type),
  getSessionState: () => ipcRenderer.invoke('get-session-state'),
  getTranscript: () => ipcRenderer.invoke('get-transcript'),
  getSuggestions: () => ipcRenderer.invoke('get-suggestions'),
  getTalkRatio: () => ipcRenderer.invoke('get-talk-ratio'),
  listAudioDevices: () => ipcRenderer.invoke('list-audio-devices'),
  startSession: (config: any) => ipcRenderer.invoke('start-session', config),

  // === First-run ===
  isFirstRun: () => ipcRenderer.invoke('is-first-run'),
  completeSetup: (data: Record<string, unknown>) => ipcRenderer.invoke('complete-setup', data),

  // === AI manual trigger ===
  manualAsk: (question: string) => ipcRenderer.invoke('manual-ask', question),

  // === Saved calls ===
  listSavedCalls: () => ipcRenderer.invoke('list-saved-calls'),
  getSavedCall: (id: string) => ipcRenderer.invoke('get-saved-call', id),
  deleteSavedCall: (id: string) => ipcRenderer.invoke('delete-saved-call', id),

  // === Audio device switching (mid-session) ===
  switchAudioDevice: (type: 'mic' | 'system', deviceName: string) => ipcRenderer.invoke('switch-audio-device', type, deviceName),

  // === Speaker management ===
  renameSpeaker: (source: 'you' | 'other', name: string) => ipcRenderer.invoke('rename-speaker', source, name),
  getSpeakerNames: () => ipcRenderer.invoke('get-speaker-names'),

  // === Cloud Sync ===
  setSyncToken: (token: string) => ipcRenderer.invoke('set-sync-token', token),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  forceSync: () => ipcRenderer.invoke('force-sync'),
  setApiUrl: (url: string) => ipcRenderer.invoke('set-api-url', url),
  onSyncStatus: (callback: (status: { pending: number; failed: number; total: number }) => void) => {
    const handler = (_event: any, status: any) => callback(status);
    ipcRenderer.on('sync-status', handler);
    return () => ipcRenderer.removeListener('sync-status', handler);
  },

  // === LLM Provider ===
  switchLLMProvider: (provider: string, apiKey?: string) => ipcRenderer.invoke('switch-llm-provider', provider, apiKey),
  getLLMProvider: () => ipcRenderer.invoke('get-llm-provider'),

  // === Post-call events ===
  onPostCallStatus: (callback: (status: string) => void) => {
    const handler = (_event: any, status: string) => callback(status);
    ipcRenderer.on('post-call-status', handler);
    return () => ipcRenderer.removeListener('post-call-status', handler);
  },
  onPostCallResult: (callback: (result: any) => void) => {
    const handler = (_event: any, result: any) => callback(result);
    ipcRenderer.on('post-call-result', handler);
    return () => ipcRenderer.removeListener('post-call-result', handler);
  },

  // === Updates ===
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string; releaseDate: string }) => void) => {
    const handler = (_event: any, info: any) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateProgress: (callback: (progress: { percent: number }) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const handler = (_event: any, info: any) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },

  // === Auth ===
  authSignIn: (email: string, password: string) => ipcRenderer.invoke('auth-sign-in', email, password),
  authSignUp: (email: string, password: string) => ipcRenderer.invoke('auth-sign-up', email, password),
  authConfirmSignUp: (email: string, code: string) => ipcRenderer.invoke('auth-confirm-sign-up', email, code),
  authSignOut: () => ipcRenderer.invoke('auth-sign-out'),
  authGetState: () => ipcRenderer.invoke('auth-get-state'),
  onAuthStateChange: (callback: (state: { isAuthenticated: boolean; email?: string }) => void) => {
    const handler = (_event: any, state: any) => callback(state);
    ipcRenderer.on('auth-state-change', handler);
    return () => ipcRenderer.removeListener('auth-state-change', handler);
  },

  // === Data export ===
  exportTranscript: (format: 'json' | 'csv') => ipcRenderer.invoke('export-transcript', format),
  exportSuggestions: () => ipcRenderer.invoke('export-suggestions'),

  // === Events from main → renderer ===
  onTranscriptSegment: (callback: (segment: any) => void) => {
    const handler = (_event: any, segment: any) => callback(segment);
    ipcRenderer.on('transcript-segment', handler);
    return () => ipcRenderer.removeListener('transcript-segment', handler);
  },
  onCoachingSuggestion: (callback: (suggestion: any) => void) => {
    const handler = (_event: any, suggestion: any) => callback(suggestion);
    ipcRenderer.on('coaching-suggestion', handler);
    return () => ipcRenderer.removeListener('coaching-suggestion', handler);
  },
  onSentimentUpdate: (callback: (analysis: any) => void) => {
    const handler = (_event: any, analysis: any) => callback(analysis);
    ipcRenderer.on('sentiment-update', handler);
    return () => ipcRenderer.removeListener('sentiment-update', handler);
  },
  onTalkRatioUpdate: (callback: (ratio: any) => void) => {
    const handler = (_event: any, ratio: any) => callback(ratio);
    ipcRenderer.on('talk-ratio-update', handler);
    return () => ipcRenderer.removeListener('talk-ratio-update', handler);
  },
  onTechMention: (callback: (mention: any) => void) => {
    const handler = (_event: any, mention: any) => callback(mention);
    ipcRenderer.on('tech-mention', handler);
    return () => ipcRenderer.removeListener('tech-mention', handler);
  },
  onSessionState: (callback: (state: string) => void) => {
    const handler = (_event: any, state: string) => callback(state);
    ipcRenderer.on('session-state', handler);
    return () => ipcRenderer.removeListener('session-state', handler);
  },
  onSessionError: (callback: (error: string) => void) => {
    const handler = (_event: any, error: string) => callback(error);
    ipcRenderer.on('session-error', handler);
    return () => ipcRenderer.removeListener('session-error', handler);
  },
  onVadChange: (callback: (data: { source: string; active: boolean }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('vad-change', handler);
    return () => ipcRenderer.removeListener('vad-change', handler);
  },

  // === Hotkey events ===
  onToggleCollapse: (callback: () => void) => {
    ipcRenderer.on('toggle-collapse', callback);
    return () => ipcRenderer.removeListener('toggle-collapse', callback);
  },
  onQuickAsk: (callback: () => void) => {
    ipcRenderer.on('quick-ask', callback);
    return () => ipcRenderer.removeListener('quick-ask', callback);
  },
  onToggleCapture: (callback: () => void) => {
    ipcRenderer.on('toggle-capture', callback);
    return () => ipcRenderer.removeListener('toggle-capture', callback);
  },
  onBookmarkMoment: (callback: () => void) => {
    ipcRenderer.on('bookmark-moment', callback);
    return () => ipcRenderer.removeListener('bookmark-moment', callback);
  },
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('open-settings', callback);
    return () => ipcRenderer.removeListener('open-settings', callback);
  },
});
