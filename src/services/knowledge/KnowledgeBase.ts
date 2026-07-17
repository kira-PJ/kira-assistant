import path from 'path';
import { app } from 'electron';
import { KnowledgeEntry, KnowledgeSearchResult, FAQEntry } from './types';

/**
 * KnowledgeBase - Local searchable knowledge store
 *
 * Uses better-sqlite3 with FTS5 for full-text search.
 * Stores:
 * - Imported documents (markdown, text)
 * - Company/product information
 * - Personal FAQ from successful past answers
 *
 * Falls back to in-memory search if SQLite unavailable.
 */
export class KnowledgeBase {
  private db: any = null; // better-sqlite3 instance
  private entries: KnowledgeEntry[] = [];
  private faq: FAQEntry[] = [];
  private inMemoryMode = false;

  constructor() {}

  /**
   * Initialize the database
   */
  async initialize(): Promise<boolean> {
    try {
      const Database = require('better-sqlite3');
      const dbPath = path.join(
        app?.getPath('userData') ?? process.cwd(),
        'kira-knowledge.db'
      );

      this.db = new Database(dbPath);
      this.createTables();
      this.loadIntoMemory();
      return true;
    } catch {
      // Fallback to in-memory mode
      this.inMemoryMode = true;
      console.warn('[KnowledgeBase] SQLite unavailable, using in-memory search');
      return true;
    }
  }

  /**
   * Add a knowledge entry
   */
  addEntry(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeEntry {
    const full: KnowledgeEntry = {
      id: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...entry,
    };

    if (this.db && !this.inMemoryMode) {
      this.db.prepare(`
        INSERT INTO knowledge (id, title, content, source, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(full.id, full.title, full.content, full.source, JSON.stringify(full.tags), full.createdAt, full.updatedAt);

      this.db.prepare(`
        INSERT INTO knowledge_fts (rowid, title, content, tags)
        VALUES ((SELECT rowid FROM knowledge WHERE id = ?), ?, ?, ?)
      `).run(full.id, full.title, full.content, full.tags.join(' '));
    }

    this.entries.push(full);
    return full;
  }

  /**
   * Search the knowledge base
   */
  search(query: string, limit = 5): KnowledgeSearchResult[] {
    if (this.db && !this.inMemoryMode) {
      return this.searchFTS(query, limit);
    }
    return this.searchInMemory(query, limit);
  }

  /**
   * Add or update a FAQ entry
   */
  addFAQ(question: string, answer: string, tags: string[] = []): FAQEntry {
    const existing = this.faq.find(
      f => f.question.toLowerCase() === question.toLowerCase()
    );

    if (existing) {
      existing.answer = answer;
      existing.timesUsed++;
      existing.lastUsed = Date.now();
      this.saveFAQ(existing);
      return existing;
    }

    const entry: FAQEntry = {
      id: `faq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question,
      answer,
      timesUsed: 1,
      lastUsed: Date.now(),
      tags,
    };

    this.faq.push(entry);
    this.saveFAQ(entry);
    return entry;
  }

  /**
   * Search FAQ entries
   */
  searchFAQ(query: string, limit = 3): FAQEntry[] {
    const terms = query.toLowerCase().split(/\s+/);
    const scored = this.faq.map(f => {
      const searchable = `${f.question} ${f.answer} ${f.tags.join(' ')}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (searchable.includes(term)) score++;
      }
      // Boost frequently used entries
      score += f.timesUsed * 0.1;
      return { entry: f, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.entry);
  }

  /**
   * Import a text/markdown document
   */
  importDocument(title: string, content: string, source: string, tags: string[] = []): KnowledgeEntry {
    return this.addEntry({ title, content, source, tags });
  }

  /**
   * Get all entries
   */
  getAllEntries(): KnowledgeEntry[] {
    return [...this.entries];
  }

  /**
   * Delete an entry
   */
  deleteEntry(id: string): boolean {
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx === -1) return false;

    this.entries.splice(idx, 1);

    if (this.db && !this.inMemoryMode) {
      this.db.prepare('DELETE FROM knowledge WHERE id = ?').run(id);
    }

    return true;
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT,
        tags TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        title, content, tags,
        content='knowledge',
        content_rowid='rowid'
      );

      CREATE TABLE IF NOT EXISTS faq (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        times_used INTEGER DEFAULT 1,
        last_used INTEGER,
        tags TEXT
      );
    `);
  }

  private loadIntoMemory(): void {
    if (!this.db) return;

    const rows = this.db.prepare('SELECT * FROM knowledge').all();
    this.entries = rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      source: r.source,
      tags: JSON.parse(r.tags || '[]'),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    const faqRows = this.db.prepare('SELECT * FROM faq').all();
    this.faq = faqRows.map((r: any) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      timesUsed: r.times_used,
      lastUsed: r.last_used,
      tags: JSON.parse(r.tags || '[]'),
    }));
  }

  private searchFTS(query: string, limit: number): KnowledgeSearchResult[] {
    const ftsQuery = query.split(/\s+/).map(t => `"${t}"`).join(' OR ');
    const rows = this.db.prepare(`
      SELECT k.*, rank FROM knowledge_fts
      JOIN knowledge k ON knowledge_fts.rowid = k.rowid
      WHERE knowledge_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit);

    return rows.map((r: any) => ({
      entry: {
        id: r.id,
        title: r.title,
        content: r.content,
        source: r.source,
        tags: JSON.parse(r.tags || '[]'),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
      score: Math.abs(r.rank || 0),
      matchedSnippet: r.content.slice(0, 150),
    }));
  }

  private searchInMemory(query: string, limit: number): KnowledgeSearchResult[] {
    const terms = query.toLowerCase().split(/\s+/);
    const scored = this.entries.map(entry => {
      const searchable = `${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
      let score = 0;
      let matchStart = 0;

      for (const term of terms) {
        const idx = searchable.indexOf(term);
        if (idx !== -1) {
          score++;
          if (matchStart === 0) matchStart = idx;
        }
      }

      return {
        entry,
        score,
        matchedSnippet: entry.content.slice(Math.max(0, matchStart - 20), matchStart + 130),
      };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private saveFAQ(entry: FAQEntry): void {
    if (!this.db || this.inMemoryMode) return;

    this.db.prepare(`
      INSERT OR REPLACE INTO faq (id, question, answer, times_used, last_used, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.question, entry.answer, entry.timesUsed, entry.lastUsed, JSON.stringify(entry.tags));
  }
}
