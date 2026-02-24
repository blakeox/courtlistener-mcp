/**
 * Pluggable storage backend interface.
 *
 * All key-value storage in the system (event store, OAuth tokens,
 * rate limits, cache) should go through this interface so that
 * backends can be swapped (e.g. in-memory → Redis) without
 * changing consumer code.
 */
export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}
