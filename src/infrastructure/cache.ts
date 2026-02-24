/**
 * In-memory caching layer for Legal MCP Server
 * Provides intelligent caching with TTL and LRU eviction
 */

import { CacheEntry, CacheConfig } from '../types.js';
import { Logger } from './logger.js';

/**
 * Cache Manager
 *
 * In-memory LRU cache with TTL (Time To Live) expiration.
 *
 * **Features**:
 * - LRU (Least Recently Used) eviction policy
 * - TTL-based expiration
 * - Automatic cleanup of expired entries
 * - Configurable max size
 * - Per-entry custom TTL support
 * - Cache statistics and monitoring
 *
 * **Use Cases**:
 * - API response caching
 * - Expensive computation results
 * - Database query results
 *
 * @example
 * ```typescript
 * const cache = new CacheManager(config.cache, logger);
 *
 * // Store data
 * cache.set('/api/cases', { page: 1 }, responseData);
 *
 * // Retrieve data
 * const cached = cache.get<CaseData>('/api/cases', { page: 1 });
 * if (cached) {
 *   return cached; // Cache hit
 * }
 *
 * // Custom TTL (10 minutes instead of default)
 * cache.set('/api/cases', params, data, 600);
 *
 * // Get statistics
 * const stats = cache.getStats();
 * console.log(`Cache: ${stats.validEntries}/${stats.maxSize} entries`);
 * ```
 */
export class CacheManager {
  private cache = new Map<string, CacheEntry>();
  private accessOrder = new Map<string, number>();
  private accessCounter = 0;
  private logger: Logger;
  private cleanupInterval: NodeJS.Timeout | undefined;

  constructor(
    private config: CacheConfig,
    logger: Logger,
  ) {
    this.logger = logger;

    if (this.config.enabled) {
      // Cleanup expired entries every minute
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
      this.logger.info('Cache manager initialized', {
        ttl: this.config.ttl,
        maxSize: this.config.maxSize,
      });
    }
  }

  /**
   * Generate cache key from endpoint and parameters
   */
  private generateKey(endpoint: string, params?: object): string {
    if (!params || Object.keys(params).length === 0) return endpoint;

    // Sort parameters for consistent keys
    const paramsRecord = params as Record<string, unknown>;
    const sortedParams = Object.keys(paramsRecord)
      .sort()
      .reduce<Record<string, unknown>>((obj, key) => {
        obj[key] = paramsRecord[key];
        return obj;
      }, {});

    return `${endpoint}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Get cached data
   */
  get<T>(endpoint: string, params?: object): T | null {
    if (!this.config.enabled) return null;

    const key = this.generateKey(endpoint, params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.logger.debug('Cache miss', { key });
      return null;
    }

    const now = Date.now();
    // Check if expired
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.logger.debug('Cache entry expired', { key });
      return null;
    }

    // Update access order for LRU
    this.accessOrder.set(key, ++this.accessCounter);
    this.logger.debug('Cache hit', { key });

    return entry.data as T;
  }

  /**
   * Set cache data
   */
  set<T>(endpoint: string, params: object, data: T): void;
  set<T>(endpoint: string, params: object, data: T, customTtl: number): void;
  set<T>(endpoint: string, params: object, data: T, customTtl?: number): void {
    if (!this.config.enabled) return;

    const key = this.generateKey(endpoint, params);

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const ttl = customTtl ?? this.config.ttl;
    const now = Date.now();
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + ttl * 1000,
    };

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);

    this.logger.debug('Cache set', {
      key,
      size: this.cache.size,
      expiresAt: new Date(entry.expiresAt).toISOString(),
      ttl: ttl,
    });
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
    this.logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.debug('Cache cleanup completed', {
        removedCount,
        remainingEntries: this.cache.size,
      });
    }
  }

  /**
   * Evict least recently used entry
   * Optimized: Finds the entry with minimum access time in one pass
   */
  private evictLRU(): void {
    if (this.accessOrder.size === 0) return;

    // Use Array.from with reduce for better performance on small maps
    const [lruKey] = Array.from(this.accessOrder.entries()).reduce(
      ([minKey, minTime], [key, time]) => (time < minTime ? [key, time] : [minKey, minTime]),
      ['', Number.POSITIVE_INFINITY] as const,
    );

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
      this.logger.debug('Evicted LRU entry', { key: lruKey });
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const entry of this.cache.values()) {
      if (now <= entry.expiresAt) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      maxSize: this.config.maxSize,
      enabled: this.config.enabled,
      ttl: this.config.ttl,
    };
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Destroy the cache manager and clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.cache.clear();
    this.accessOrder.clear();
    this.logger.info('Cache manager destroyed');
  }
}
