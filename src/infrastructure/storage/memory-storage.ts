import { StorageBackend } from './storage-backend.js';

interface Entry {
  value: string;
  expiresAt: number | null;
}

/**
 * In-memory StorageBackend backed by a Map with optional per-key TTL.
 *
 * A periodic cleanup timer removes expired entries so memory doesn't
 * grow unbounded. This is the default backend and preserves the
 * current behaviour of the system — just formalised behind the
 * StorageBackend interface.
 */
export class InMemoryStorage implements StorageBackend {
  private store = new Map<string, Entry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs = 60_000) {
    if (cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => this.evictExpired(), cleanupIntervalMs);
      // Allow the process to exit even if the timer is still running
      this.cleanupTimer.unref();
    }
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs != null ? Date.now() + ttlMs : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const result: string[] = [];
    for (const [key, entry] of this.store) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        continue;
      }
      if (regex.test(key)) result.push(key);
    }
    return result;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /** Stop the background cleanup timer (useful in tests). */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  private evictExpired(): void {
    for (const [key, entry] of this.store) {
      if (this.isExpired(entry)) this.store.delete(key);
    }
  }
}
