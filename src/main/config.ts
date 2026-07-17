import Store from 'electron-store';

export interface GhostConfig {
  // Window
  windowBounds?: { x: number; y: number; width: number; height: number };
  windowOpacity?: number;
  expandedHeight?: number;

  // Hotkeys
  hotkeyToggle?: string;
  hotkeyCollapse?: string;
  hotkeyQuickAsk?: string;
  hotkeyCaptureToggle?: string;
  hotkeyBookmark?: string;

  // Transcription
  transcriptionMode?: 'local' | 'cloud';
  whisperModelPath?: string;

  // AWS
  awsRegion?: string;
  bedrockModelId?: string;

  // Call
  callType?: string;

  // General
  firstRun?: boolean;
}

export class ConfigStore {
  private static instance: ConfigStore;
  private store: Store<GhostConfig>;

  private constructor() {
    this.store = new Store<GhostConfig>({
      name: 'kira-config',
      defaults: {
        windowOpacity: 0.95,
        expandedHeight: 600,
        hotkeyToggle: 'CommandOrControl+Shift+G',
        hotkeyCollapse: 'CommandOrControl+Shift+M',
        hotkeyQuickAsk: 'CommandOrControl+Shift+A',
        hotkeyCaptureToggle: 'CommandOrControl+Shift+R',
        hotkeyBookmark: 'CommandOrControl+Shift+B',
        transcriptionMode: 'local',
        whisperModelPath: 'ggml-tiny.en.bin',
        awsRegion: 'us-east-1',
        bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        callType: 'discovery',
        firstRun: true,
      },
    });
  }

  static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore();
    }
    return ConfigStore.instance;
  }

  get(key: string): unknown {
    return this.store.get(key as keyof GhostConfig);
  }

  set(key: string, value: unknown): void {
    if (value === undefined) {
      this.store.delete(key as keyof GhostConfig);
    } else {
      this.store.set(key as keyof GhostConfig, value as never);
    }
  }

  getAll(): GhostConfig {
    return this.store.store;
  }
}
