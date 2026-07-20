import Store from 'electron-store';
import { safeStorage } from 'electron';

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

// Keys that contain sensitive data — stored encrypted
const SENSITIVE_KEYS = new Set([
  'groqApiKey',
  'geminiApiKey',
  'authTokens',
  'authEmail',
  'authToken',
  'apiUrl',
]);

export class ConfigStore {
  private static instance: ConfigStore;
  private store: Store<GhostConfig>;
  private secureStore: Store; // Separate store for encrypted values

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
        transcriptionMode: 'cloud',
        whisperModelPath: 'ggml-small.en.bin',
        awsRegion: 'us-east-1',
        bedrockModelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        callType: 'discovery',
        firstRun: true,
      },
    });

    this.secureStore = new Store({ name: 'kira-secure' });
  }

  static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore();
    }
    return ConfigStore.instance;
  }

  get(key: string): unknown {
    if (SENSITIVE_KEYS.has(key)) {
      return this.getSecure(key);
    }
    return this.store.get(key as keyof GhostConfig);
  }

  set(key: string, value: unknown): void {
    if (SENSITIVE_KEYS.has(key)) {
      this.setSecure(key, value);
      return;
    }
    if (value === undefined) {
      this.store.delete(key as keyof GhostConfig);
    } else {
      this.store.set(key as keyof GhostConfig, value as never);
    }
  }

  getAll(): GhostConfig {
    return this.store.store;
  }

  /**
   * Store a value encrypted using OS keychain
   */
  private setSecure(key: string, value: unknown): void {
    if (value === undefined || value === null) {
      this.secureStore.delete(key);
      return;
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const serialized = JSON.stringify(value);
        const encrypted = safeStorage.encryptString(serialized);
        this.secureStore.set(key, encrypted.toString('base64'));
      } else {
        // Fallback: store as-is if encryption unavailable (dev mode)
        this.secureStore.set(key, value);
      }
    } catch {
      // Fallback on error
      this.secureStore.set(key, value);
    }
  }

  /**
   * Retrieve and decrypt a secure value
   */
  private getSecure(key: string): unknown {
    const raw = this.secureStore.get(key) as string | undefined;
    if (!raw) return undefined;

    try {
      if (safeStorage.isEncryptionAvailable() && typeof raw === 'string') {
        // Try to decrypt (base64 encoded encrypted data)
        const buffer = Buffer.from(raw, 'base64');
        const decrypted = safeStorage.decryptString(buffer);
        return JSON.parse(decrypted);
      }
    } catch {
      // If decryption fails, it might be old unencrypted data — return as-is
    }

    // Fallback: return raw value (for migration from unencrypted)
    return raw;
  }
}
