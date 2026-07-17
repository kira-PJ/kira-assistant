import { EventEmitter } from 'events';
import path from 'path';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { TranscriptionEngine, TranscriptionOptions, TranscriptSegment } from './types';

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
export class WhisperEngine extends EventEmitter implements TranscriptionEngine {
  private options: Required<TranscriptionOptions>;
  private ready = false;
  private whisperBinaryPath: string | null = null;
  private segmentCounter = 0;

  constructor() {
    super();
    this.options = {
      modelPath: '',
      language: 'en',
      translateToEnglish: false,
      threads: 4,
      awsRegion: '',
    };
  }

  async initialize(options: TranscriptionOptions): Promise<boolean> {
    this.options = { ...this.options, ...options } as Required<TranscriptionOptions>;

    // Find whisper binary
    this.whisperBinaryPath = await this.findWhisperBinary();
    if (!this.whisperBinaryPath) {
      this.emit('error', new Error('whisper-cli binary not found. Install whisper.cpp.'));
      return false;
    }

    // Verify model exists
    const modelPath = this.resolveModelPath();
    try {
      await fs.access(modelPath);
    } catch {
      this.emit('error', new Error(`Whisper model not found at: ${modelPath}`));
      return false;
    }

    this.ready = true;
    this.emit('ready');
    return true;
  }

  async transcribe(pcmData: Buffer, source: 'mic' | 'system'): Promise<TranscriptSegment[]> {
    if (!this.ready || !this.whisperBinaryPath) {
      return [];
    }

    const tempFile = path.join(tmpdir(), `ghost-audio-${Date.now()}-${source}.wav`);

    try {
      // Write PCM data as WAV file for whisper-cli
      await this.writeWav(tempFile, pcmData);

      // Run whisper inference
      const output = await this.runWhisper(tempFile);

      // Parse output into segments
      const segments = this.parseOutput(output, source);

      // Cleanup temp file
      await fs.unlink(tempFile).catch(() => {});

      return segments;
    } catch (err) {
      await fs.unlink(tempFile).catch(() => {});
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      return [];
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  shutdown(): void {
    this.ready = false;
  }

  private async runWhisper(wavFile: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '-m', this.resolveModelPath(),
        '-f', wavFile,
        '-l', this.options.language,
        '-t', String(this.options.threads),
        '--no-timestamps',
        '--print-progress', 'false',
        '--no-fallback',
        '--beam-size', '5',
        '--entropy-thold', '2.8',
        '-otxt',
      ];

      if (this.options.translateToEnglish && this.options.language !== 'en') {
        args.push('--translate');
      }

      execFile(this.whisperBinaryPath!, args, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Whisper failed: ${stderr || error.message}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  private parseOutput(output: string, source: 'mic' | 'system'): TranscriptSegment[] {
    if (!output || output.trim().length === 0) {
      return [];
    }

    const lines = output.split('\n').filter(l => l.trim().length > 0);
    const segments: TranscriptSegment[] = [];

    // Known whisper hallucination patterns to filter
    const hallucinations = [
      /^\[.*\]$/,                          // [BLANK_AUDIO], [music], etc.
      /^\(.*\)$/,                          // (sighs), (mumbling), etc.
      /^♪/,                                // Music notes
      /thank you for watching/i,
      /please subscribe/i,
      /thanks for watching/i,
      /you$/,                              // Single word "you" (common hallucination)
      /^\.+$/,                             // Just dots
      /^\s*$/,                             // Empty
    ];

    for (const line of lines) {
      const text = line.trim();
      if (!text) continue;

      // Filter hallucinations
      const isHallucination = hallucinations.some(pattern => pattern.test(text));
      if (isHallucination) continue;

      // Skip very short outputs (likely noise)
      if (text.length < 4) continue;

      this.segmentCounter++;
      segments.push({
        id: `seg-${Date.now()}-${this.segmentCounter}`,
        speaker: source === 'mic' ? 'you' : 'other',
        speakerName: source === 'mic' ? 'You' : 'Customer',
        text,
        timestamp: Date.now(),
        endTimestamp: Date.now(),
        confidence: 0.85,
        isPartial: false,
      });
    }

    return segments;
  }

  private async writeWav(filePath: string, pcmData: Buffer): Promise<void> {
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
    header.writeUInt32LE(16, 16);             // chunk size
    header.writeUInt16LE(1, 20);              // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28); // byte rate
    header.writeUInt16LE(channels * bitsPerSample / 8, 32);              // block align
    header.writeUInt16LE(bitsPerSample, 34);
    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    const wav = Buffer.concat([header, pcmData]);
    await fs.writeFile(filePath, wav);
  }

  private async findWhisperBinary(): Promise<string | null> {
    const candidates = [
      'whisper-cli',
      'whisper',
      path.join(process.cwd(), 'bin', 'whisper-cli'),
      '/usr/local/bin/whisper-cli',
      '/usr/bin/whisper-cli',
    ];

    for (const candidate of candidates) {
      try {
        await new Promise<void>((resolve, reject) => {
          execFile(candidate, ['--help'], { timeout: 5000 }, (err) => {
            if (err && err.code === 'ENOENT') reject(err);
            else resolve(); // Even if --help exits non-zero, binary exists
          });
        });
        return candidate;
      } catch {
        continue;
      }
    }

    return null;
  }

  private resolveModelPath(): string {
    if (path.isAbsolute(this.options.modelPath)) {
      return this.options.modelPath;
    }
    return path.resolve(process.cwd(), 'models', this.options.modelPath || 'ggml-small.en.bin');
  }
}
