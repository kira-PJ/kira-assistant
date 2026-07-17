"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhisperEngine = void 0;
const events_1 = require("events");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
/**
 * WhisperEngine - Local transcription using whisper.cpp
 *
 * Uses the whisper.cpp CLI binary (whisper-cli) for inference.
 * Processes 5-second PCM chunks and returns transcript segments.
 *
 * Speaker diarization is handled externally by the TranscriptionService
 * which labels segments based on which audio stream (mic/system) produced them.
 *
 * Requirements:
 * - whisper.cpp binary compiled and available (whisper-cli)
 * - A GGML model file (e.g., ggml-small.en.bin)
 */
class WhisperEngine extends events_1.EventEmitter {
    options;
    ready = false;
    whisperBinaryPath = null;
    segmentCounter = 0;
    constructor() {
        super();
        this.options = {
            modelPath: '',
            language: 'en',
            translateToEnglish: false,
            threads: 4,
        };
    }
    async initialize(options) {
        this.options = { ...this.options, ...options };
        // Find whisper binary
        this.whisperBinaryPath = await this.findWhisperBinary();
        if (!this.whisperBinaryPath) {
            this.emit('error', new Error('whisper-cli binary not found. Install whisper.cpp.'));
            return false;
        }
        // Verify model exists
        const modelPath = this.resolveModelPath();
        try {
            await fs_1.promises.access(modelPath);
        }
        catch {
            this.emit('error', new Error(`Whisper model not found at: ${modelPath}`));
            return false;
        }
        this.ready = true;
        this.emit('ready');
        return true;
    }
    async transcribe(pcmData, source) {
        if (!this.ready || !this.whisperBinaryPath) {
            return [];
        }
        const tempFile = path_1.default.join((0, os_1.tmpdir)(), `ghost-audio-${Date.now()}-${source}.wav`);
        try {
            // Write PCM data as WAV file for whisper-cli
            await this.writeWav(tempFile, pcmData);
            // Run whisper inference
            const output = await this.runWhisper(tempFile);
            // Parse output into segments
            const segments = this.parseOutput(output, source);
            // Cleanup temp file
            await fs_1.promises.unlink(tempFile).catch(() => { });
            return segments;
        }
        catch (err) {
            await fs_1.promises.unlink(tempFile).catch(() => { });
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
            return [];
        }
    }
    isReady() {
        return this.ready;
    }
    shutdown() {
        this.ready = false;
    }
    async runWhisper(wavFile) {
        return new Promise((resolve, reject) => {
            const args = [
                '-m', this.resolveModelPath(),
                '-f', wavFile,
                '-l', this.options.language,
                '-t', String(this.options.threads),
                '--no-timestamps',
                '--print-progress', 'false',
                '-otxt',
            ];
            if (this.options.translateToEnglish && this.options.language !== 'en') {
                args.push('--translate');
            }
            (0, child_process_1.execFile)(this.whisperBinaryPath, args, { timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Whisper failed: ${stderr || error.message}`));
                    return;
                }
                resolve(stdout.trim());
            });
        });
    }
    parseOutput(output, source) {
        if (!output || output.trim().length === 0) {
            return [];
        }
        const lines = output.split('\n').filter(l => l.trim().length > 0);
        const segments = [];
        for (const line of lines) {
            const text = line.trim();
            if (!text || text === '[BLANK_AUDIO]')
                continue;
            this.segmentCounter++;
            segments.push({
                id: `seg-${Date.now()}-${this.segmentCounter}`,
                speaker: source === 'mic' ? 'you' : 'other',
                speakerName: source === 'mic' ? 'You' : 'Customer',
                text,
                timestamp: Date.now(),
                endTimestamp: Date.now(),
                confidence: 0.85, // whisper.cpp doesn't expose per-segment confidence easily
                isPartial: false,
            });
        }
        return segments;
    }
    async writeWav(filePath, pcmData) {
        const sampleRate = 16000;
        const channels = 1;
        const bitsPerSample = 16;
        const dataSize = pcmData.length;
        const headerSize = 44;
        const header = Buffer.alloc(headerSize);
        // RIFF header
        header.write('RIFF', 0);
        header.writeUInt32LE(dataSize + headerSize - 8, 4);
        header.write('WAVE', 8);
        // fmt chunk
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16); // chunk size
        header.writeUInt16LE(1, 20); // PCM format
        header.writeUInt16LE(channels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28); // byte rate
        header.writeUInt16LE(channels * bitsPerSample / 8, 32); // block align
        header.writeUInt16LE(bitsPerSample, 34);
        // data chunk
        header.write('data', 36);
        header.writeUInt32LE(dataSize, 40);
        const wav = Buffer.concat([header, pcmData]);
        await fs_1.promises.writeFile(filePath, wav);
    }
    async findWhisperBinary() {
        const candidates = [
            'whisper-cli',
            'whisper',
            path_1.default.join(process.cwd(), 'bin', 'whisper-cli'),
            '/usr/local/bin/whisper-cli',
            '/usr/bin/whisper-cli',
        ];
        for (const candidate of candidates) {
            try {
                await new Promise((resolve, reject) => {
                    (0, child_process_1.execFile)(candidate, ['--help'], { timeout: 5000 }, (err) => {
                        if (err && err.code === 'ENOENT')
                            reject(err);
                        else
                            resolve(); // Even if --help exits non-zero, binary exists
                    });
                });
                return candidate;
            }
            catch {
                continue;
            }
        }
        return null;
    }
    resolveModelPath() {
        if (path_1.default.isAbsolute(this.options.modelPath)) {
            return this.options.modelPath;
        }
        return path_1.default.resolve(process.cwd(), 'models', this.options.modelPath || 'ggml-small.en.bin');
    }
}
exports.WhisperEngine = WhisperEngine;
