import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import { AudioChunk } from './types';

/**
 * AudioRecorder — Records raw audio chunks to a WAV file.
 *
 * Collects PCM buffers during a call and writes a playable WAV file
 * when the call ends. Stores alongside the transcript in the calls directory.
 *
 * File is stored at: ~/.config/kira-assistant/calls/{callId}.wav
 */
export class AudioRecorder {
  private chunks: Buffer[] = [];
  private recording = false;
  private sampleRate: number;
  private channels: number;
  private callsDir: string;

  constructor(sampleRate = 16000, channels = 1) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.callsDir = path.join(
      app?.getPath('userData') ?? process.cwd(),
      'calls'
    );
  }

  /**
   * Start recording — clears previous buffer
   */
  start(): void {
    this.chunks = [];
    this.recording = true;
    console.log('[AudioRecorder] Recording started');
  }

  /**
   * Add an audio chunk to the recording buffer
   */
  addChunk(chunk: AudioChunk): void {
    if (!this.recording) return;
    // Only record active audio (skip silence to save space)
    if (chunk.isActive) {
      this.chunks.push(Buffer.from(chunk.buffer));
    }
  }

  /**
   * Stop recording and save as WAV file
   */
  async stop(callId: string): Promise<string | null> {
    this.recording = false;

    if (this.chunks.length === 0) {
      console.log('[AudioRecorder] No audio data recorded');
      return null;
    }

    try {
      await fs.mkdir(this.callsDir, { recursive: true });
      const filePath = path.join(this.callsDir, `${callId}.wav`);
      const pcmData = Buffer.concat(this.chunks);
      const wavBuffer = this.createWavHeader(pcmData);

      await fs.writeFile(filePath, wavBuffer);
      const sizeMB = (wavBuffer.length / (1024 * 1024)).toFixed(1);
      console.log(`[AudioRecorder] Saved ${sizeMB}MB to ${filePath}`);

      this.chunks = [];
      return filePath;
    } catch (err) {
      console.error('[AudioRecorder] Failed to save recording:', err);
      this.chunks = [];
      return null;
    }
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Get current buffer size in bytes
   */
  getBufferSize(): number {
    return this.chunks.reduce((acc, b) => acc + b.length, 0);
  }

  /**
   * Create a WAV file header for 16-bit PCM data
   */
  private createWavHeader(pcmData: Buffer): Buffer {
    const bitsPerSample = 16;
    const byteRate = this.sampleRate * this.channels * (bitsPerSample / 8);
    const blockAlign = this.channels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const headerSize = 44;

    const header = Buffer.alloc(headerSize);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(this.channels, 22);
    header.writeUInt32LE(this.sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }
}
