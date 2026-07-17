import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

/**
 * Logger - Structured logging with rotation
 *
 * Features:
 * - File-based logging with rotation (max 5MB per file, keep 5 files)
 * - Module-tagged entries for filtering
 * - JSON format for machine parsing
 * - Console output in development
 * - Exportable for debugging
 */
export class Logger {
  private static instance: Logger;
  private logDir: string;
  private currentFile: string;
  private buffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private maxFileSize = 5 * 1024 * 1024; // 5MB
  private maxFiles = 5;
  private minLevel: LogLevel = 'info';

  private constructor() {
    this.logDir = path.join(
      app?.getPath('userData') ?? process.cwd(),
      'logs'
    );
    this.currentFile = path.join(this.logDir, 'kira.log');

    // Flush buffer every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Create a child logger with a module tag
   */
  child(module: string): ModuleLogger {
    return new ModuleLogger(this, module);
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  log(level: LogLevel, module: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
    };

    const line = JSON.stringify(entry);
    this.buffer.push(line);

    // Console output in dev
    if (!app?.isPackaged) {
      const prefix = `[${entry.timestamp.slice(11, 23)}] [${level.toUpperCase()}] [${module}]`;
      if (level === 'error') console.error(prefix, message, data ?? '');
      else if (level === 'warn') console.warn(prefix, message, data ?? '');
      else console.log(prefix, message, data ?? '');
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const lines = this.buffer.splice(0, this.buffer.length);
    const content = lines.join('\n') + '\n';

    try {
      await fs.appendFile(this.currentFile, content);
      await this.rotateIfNeeded();
    } catch {
      // Can't log if logging fails
    }
  }

  /**
   * Export all logs as a single string (for user to share for debugging)
   */
  async exportLogs(): Promise<string> {
    await this.flush();
    try {
      return await fs.readFile(this.currentFile, 'utf-8');
    } catch {
      return '';
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) clearInterval(this.flushInterval);
    await this.flush();
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const stat = await fs.stat(this.currentFile);
      if (stat.size < this.maxFileSize) return;

      // Rotate files: kira.log → kira.1.log → kira.2.log ...
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const from = path.join(this.logDir, `kira.${i}.log`);
        const to = path.join(this.logDir, `kira.${i + 1}.log`);
        try { await fs.rename(from, to); } catch { /* ignore */ }
      }
      await fs.rename(this.currentFile, path.join(this.logDir, 'kira.1.log'));
    } catch { /* ignore */ }
  }
}

export class ModuleLogger {
  private logger: Logger;
  private module: string;

  constructor(logger: Logger, module: string) {
    this.logger = logger;
    this.module = module;
  }

  debug(message: string, data?: unknown): void { this.logger.log('debug', this.module, message, data); }
  info(message: string, data?: unknown): void { this.logger.log('info', this.module, message, data); }
  warn(message: string, data?: unknown): void { this.logger.log('warn', this.module, message, data); }
  error(message: string, data?: unknown): void { this.logger.log('error', this.module, message, data); }
}
