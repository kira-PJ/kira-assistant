import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import { TranscriptSegment } from '../transcription/types';

export interface SavedCall {
  id: string;
  name: string;
  date: string;
  durationMs: number;
  callType: string;
  participants: string;
  context: string;
  myRole: string;
  transcript: TranscriptSegment[];
  segmentCount: number;
}

/**
 * LocalStorage - Saves transcripts and call data locally
 *
 * All calls are saved as JSON files in the user data directory.
 * This provides offline access even without AWS sync.
 *
 * Location: ~/.config/kira-assistant/calls/
 */
export class LocalStorage {
  private callsDir: string;

  constructor() {
    this.callsDir = path.join(
      app?.getPath('userData') ?? process.cwd(),
      'calls'
    );
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.callsDir, { recursive: true });
  }

  /**
   * Save a completed call
   */
  async saveCall(call: SavedCall): Promise<void> {
    const filePath = path.join(this.callsDir, `${call.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(call, null, 2));
  }

  /**
   * List all saved calls (metadata only, not full transcript)
   */
  async listCalls(): Promise<Omit<SavedCall, 'transcript'>[]> {
    try {
      const files = await fs.readdir(this.callsDir);
      const calls: Omit<SavedCall, 'transcript'>[] = [];

      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          const data = await fs.readFile(path.join(this.callsDir, file), 'utf-8');
          const call = JSON.parse(data) as SavedCall;
          // Return metadata without full transcript (for listing)
          calls.push({
            id: call.id,
            name: call.name,
            date: call.date,
            durationMs: call.durationMs,
            callType: call.callType,
            participants: call.participants,
            context: call.context,
            myRole: call.myRole,
            segmentCount: call.segmentCount,
          });
        } catch { /* skip corrupted files */ }
      }

      return calls.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch {
      return [];
    }
  }

  /**
   * Get a full call with transcript
   */
  async getCall(id: string): Promise<SavedCall | null> {
    try {
      const filePath = path.join(this.callsDir, `${id}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as SavedCall;
    } catch {
      return null;
    }
  }

  /**
   * Delete a call
   */
  async deleteCall(id: string): Promise<boolean> {
    try {
      await fs.unlink(path.join(this.callsDir, `${id}.json`));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get storage location for user reference
   */
  getStoragePath(): string {
    return this.callsDir;
  }
}
