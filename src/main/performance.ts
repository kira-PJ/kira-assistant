import { app, powerMonitor, BrowserWindow } from 'electron';
import { Logger } from '../services/Logger';

const log = Logger.getInstance().child('performance');

/**
 * Performance optimizations for K.I.R.A.
 *
 * - Disables unused Chromium features
 * - Implements idle detection (sleep after 30 min inactivity)
 * - Provides lazy-load helpers for heavy resources
 */

/**
 * Apply Electron/Chromium optimizations before app is ready.
 * Call this before app.whenReady().
 */
export function applyStartupOptimizations(): void {
  // Disable hardware acceleration if not needed (saves GPU memory)
  // app.disableHardwareAcceleration(); // Uncomment if GPU not needed

  // Disable Chromium features we don't use
  app.commandLine.appendSwitch('disable-features', [
    'TranslateUI',
    'SpellcheckService',
    'AutofillServerCommunication',
  ].join(','));

  // Reduce renderer process memory
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');

  // Disable background timer throttling (we need timers for audio)
  app.commandLine.appendSwitch('disable-background-timer-throttling');

  log.info('Startup optimizations applied');
}

/**
 * Set up idle detection — puts services to sleep after inactivity.
 * Returns a cleanup function.
 */
export function setupIdleDetection(
  onIdle: () => void,
  onResume: () => void,
  thresholdSeconds = 1800 // 30 minutes
): () => void {
  let idleTimer: ReturnType<typeof setInterval> | null = null;
  let isIdle = false;

  idleTimer = setInterval(() => {
    const idleTime = powerMonitor.getSystemIdleTime();

    if (idleTime >= thresholdSeconds && !isIdle) {
      isIdle = true;
      log.info('System idle detected, entering low-power mode', { idleSeconds: idleTime });
      onIdle();
    } else if (idleTime < 60 && isIdle) {
      isIdle = false;
      log.info('System resumed from idle');
      onResume();
    }
  }, 30000); // Check every 30 seconds

  return () => {
    if (idleTimer) clearInterval(idleTimer);
  };
}

/**
 * Lazy resource loader — loads heavy resources on first use only.
 */
export class LazyLoader<T> {
  private instance: T | null = null;
  private loading = false;
  private factory: () => Promise<T>;
  private destroyFn?: (instance: T) => void;

  constructor(factory: () => Promise<T>, destroyFn?: (instance: T) => void) {
    this.factory = factory;
    this.destroyFn = destroyFn;
  }

  async get(): Promise<T> {
    if (this.instance) return this.instance;
    if (this.loading) {
      // Wait for existing load
      while (this.loading) {
        await new Promise(r => setTimeout(r, 50));
      }
      return this.instance!;
    }

    this.loading = true;
    try {
      this.instance = await this.factory();
      return this.instance;
    } finally {
      this.loading = false;
    }
  }

  unload(): void {
    if (this.instance && this.destroyFn) {
      this.destroyFn(this.instance);
    }
    this.instance = null;
  }

  isLoaded(): boolean {
    return this.instance !== null;
  }
}

/**
 * Monitor memory usage and log warnings
 */
export function startMemoryMonitor(window: BrowserWindow, intervalMs = 60000): () => void {
  const timer = setInterval(() => {
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);

    if (rssMB > 400) {
      log.warn('High memory usage', { heapMB, rssMB });
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
