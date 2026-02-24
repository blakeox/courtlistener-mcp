export { StorageBackend } from './storage-backend.js';
export { InMemoryStorage } from './memory-storage.js';

import { StorageBackend } from './storage-backend.js';
import { InMemoryStorage } from './memory-storage.js';

/**
 * Factory that creates a StorageBackend based on the STORAGE_BACKEND
 * environment variable. Defaults to the in-memory implementation.
 */
export function createStorageBackend(): StorageBackend {
  const backend = process.env.STORAGE_BACKEND || 'memory';

  if (backend === 'memory') return new InMemoryStorage();

  // Future: if (backend === 'redis') return new RedisStorage(process.env.REDIS_URL);

  throw new Error(`Unknown storage backend: ${backend}`);
}
