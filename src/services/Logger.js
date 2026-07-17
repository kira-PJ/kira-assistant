"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleLogger = exports.Logger = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
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
class Logger {
    static instance;
    logDir;
    currentFile;
    buffer = [];
    flushInterval = null;
    maxFileSize = 5 * 1024 * 1024; // 5MB
    maxFiles = 5;
    minLevel = 'info';
    constructor() {
        this.logDir = path_1.default.join(electron_1.app?.getPath('userData') ?? process.cwd(), 'logs');
        this.currentFile = path_1.default.join(this.logDir, 'kira.log');
        // Flush buffer every 5 seconds
        this.flushInterval = setInterval(() => this.flush(), 5000);
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    /**
     * Create a child logger with a module tag
     */
    child(module) {
        return new ModuleLogger(this, module);
    }
    setLevel(level) {
        this.minLevel = level;
    }
    async initialize() {
        await fs_1.promises.mkdir(this.logDir, { recursive: true });
    }
    log(level, module, message, data) {
        if (!this.shouldLog(level))
            return;
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            module,
            message,
            data,
        };
        const line = JSON.stringify(entry);
        this.buffer.push(line);
        // Console output in dev
        if (!electron_1.app?.isPackaged) {
            const prefix = `[${entry.timestamp.slice(11, 23)}] [${level.toUpperCase()}] [${module}]`;
            if (level === 'error')
                console.error(prefix, message, data ?? '');
            else if (level === 'warn')
                console.warn(prefix, message, data ?? '');
            else
                console.log(prefix, message, data ?? '');
        }
    }
    async flush() {
        if (this.buffer.length === 0)
            return;
        const lines = this.buffer.splice(0, this.buffer.length);
        const content = lines.join('\n') + '\n';
        try {
            await fs_1.promises.appendFile(this.currentFile, content);
            await this.rotateIfNeeded();
        }
        catch {
            // Can't log if logging fails
        }
    }
    /**
     * Export all logs as a single string (for user to share for debugging)
     */
    async exportLogs() {
        await this.flush();
        try {
            return await fs_1.promises.readFile(this.currentFile, 'utf-8');
        }
        catch {
            return '';
        }
    }
    async shutdown() {
        if (this.flushInterval)
            clearInterval(this.flushInterval);
        await this.flush();
    }
    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(level) >= levels.indexOf(this.minLevel);
    }
    async rotateIfNeeded() {
        try {
            const stat = await fs_1.promises.stat(this.currentFile);
            if (stat.size < this.maxFileSize)
                return;
            // Rotate files: kira.log → kira.1.log → kira.2.log ...
            for (let i = this.maxFiles - 1; i >= 1; i--) {
                const from = path_1.default.join(this.logDir, `kira.${i}.log`);
                const to = path_1.default.join(this.logDir, `kira.${i + 1}.log`);
                try {
                    await fs_1.promises.rename(from, to);
                }
                catch { /* ignore */ }
            }
            await fs_1.promises.rename(this.currentFile, path_1.default.join(this.logDir, 'kira.1.log'));
        }
        catch { /* ignore */ }
    }
}
exports.Logger = Logger;
class ModuleLogger {
    logger;
    module;
    constructor(logger, module) {
        this.logger = logger;
        this.module = module;
    }
    debug(message, data) { this.logger.log('debug', this.module, message, data); }
    info(message, data) { this.logger.log('info', this.module, message, data); }
    warn(message, data) { this.logger.log('warn', this.module, message, data); }
    error(message, data) { this.logger.log('error', this.module, message, data); }
}
exports.ModuleLogger = ModuleLogger;
