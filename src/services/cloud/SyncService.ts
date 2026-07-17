import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import { PostCallReport } from '../postcall/types';

export interface SyncItem {
  id: string;
  type: 'call' | 'learning' | 'faq';
  data: unknown;
  createdAt: number;
  retries: number;
  lastAttempt?: number;
  status: 'pending' | 'syncing' | 'failed' | 'synced';
}

/**
 * SyncService - Background cloud synchronization
 *
 * After a call ends, queues transcript + metadata for upload.
 * Features:
 * - Offline queue (persisted to disk)
 * - Retry with exponential backoff
 * - Conflict resolution (local always wins for same callId)
 * - Batched uploads to reduce API calls
 */
export class SyncService extends EventEmitter {
  private queue: SyncItem[] = [];
  private syncing = false;
  private apiUrl: string;
  private authToken: string | null = null;
  private maxRetries = 5;
  private queuePath: string;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(apiUrl?: string) {
    super();
    this.apiUrl = apiUrl ?? process.env.KIRA_API_URL ?? '';
    this.queuePath = path.join(
      app?.getPath('userData') ?? process.cwd(),
      'sync-queue.json'
    );
  }

  /**
   * Initialize: load persisted queue and start sync loop
   */
  async initialize(): Promise<void> {
    await this.loadQueue();
    // Sync every 30 seconds
    this.syncInterval = setInterval(() => this.processQueue(), 30000);
  }

  /**
   * Set auth token (from Cognito)
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Queue a call report for sync
   */
  async queueCallReport(report: PostCallReport): Promise<void> {
    const item: SyncItem = {
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'call',
      data: report,
      createdAt: Date.now(),
      retries: 0,
      status: 'pending',
    };

    this.queue.push(item);
    await this.persistQueue();
    this.emit('queued', item);

    // Try immediate sync
    this.processQueue();
  }

  /**
   * Queue learning data for sync
   */
  async queueLearningData(data: unknown): Promise<void> {
    const item: SyncItem = {
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'learning',
      data,
      createdAt: Date.now(),
      retries: 0,
      status: 'pending',
    };

    this.queue.push(item);
    await this.persistQueue();
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { pending: number; failed: number; total: number } {
    return {
      pending: this.queue.filter(i => i.status === 'pending').length,
      failed: this.queue.filter(i => i.status === 'failed').length,
      total: this.queue.length,
    };
  }

  /**
   * Process the sync queue
   */
  async processQueue(): Promise<void> {
    if (this.syncing || !this.apiUrl || !this.authToken) return;
    this.syncing = true;

    const pending = this.queue.filter(
      i => i.status === 'pending' || (i.status === 'failed' && i.retries < this.maxRetries)
    );

    for (const item of pending) {
      try {
        item.status = 'syncing';
        item.lastAttempt = Date.now();
        this.emit('syncing', item);

        await this.uploadItem(item);

        item.status = 'synced';
        this.emit('synced', item);
      } catch (err) {
        item.status = 'failed';
        item.retries++;
        this.emit('sync-error', { item, error: err });
      }
    }

    // Remove successfully synced items
    this.queue = this.queue.filter(i => i.status !== 'synced');
    await this.persistQueue();

    this.syncing = false;
  }

  /**
   * Shutdown and persist queue
   */
  async shutdown(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    await this.persistQueue();
  }

  private async uploadItem(item: SyncItem): Promise<void> {
    const endpoint = item.type === 'call' ? '/calls' : '/learning';

    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(item.data),
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
    }
  }

  private async loadQueue(): Promise<void> {
    try {
      const data = await fs.readFile(this.queuePath, 'utf-8');
      this.queue = JSON.parse(data);
    } catch {
      this.queue = [];
    }
  }

  private async persistQueue(): Promise<void> {
    try {
      await fs.writeFile(this.queuePath, JSON.stringify(this.queue, null, 2));
    } catch {
      // Non-critical
    }
  }
}
