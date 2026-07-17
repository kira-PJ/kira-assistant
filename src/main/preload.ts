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

  // === First-run ===
  isFirstRun: () => ipcRenderer.invoke('is-first-run'),
  completeSetup: (data: Record<string, unknown>) => ipcRenderer.invoke('complete-setup', data),

  // === AI manual trigger ===
  manualAsk: (question: string) => ipcRenderer.invoke('manual-ask', question),

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
