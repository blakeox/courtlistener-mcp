/**
 * In-memory caching layer for Legal MCP Server
 * Provides intelligent caching with TTL and LRU eviction
 */

import { CacheEntry, CacheConfig } from '../types.js';
import { Logger } from './logger.js';

export class CacheManager {
  private cache = new Map<string, CacheEntry>();
  private accessOrder = new Map<string, number>();
  private accessCounter = 0;
  private logger: Logger;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private config: CacheConfig, logger: Logger) {
    this.logger = logger;
    
    if (this.config.enabled) {
      // Cleanup expired entries every minute
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
      this.logger.info('Cache manager initialized', {
        ttl: this.config.ttl,
        maxSize: this.config.maxSize
      });
    }
  }

  /**
   * Generate cache key from endpoint and parameters
   */
  private generateKey(endpoint: string, params?: any): string {
    if (!params) return endpoint;
    
    // Sort parameters for consistent keys
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((obj, key) => {
        obj[key] = params[key];
        return obj;
      }, {} as any);
    
    return `${endpoint}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Get cached data
   */
  get<T>(endpoint: string, params?: any): T | null {
    if (!this.config.enabled) return null;

    const key = this.generateKey(endpoint, params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.logger.debug('Cache miss', { key });
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
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
  set<T>(endpoint: string, params: any, data: T): void;
  set<T>(endpoint: string, params: any, data: T, customTtl: number): void;
  set<T>(endpoint: string, params: any, data: T, customTtl?: number): void {
    if (!this.config.enabled) return;

    const key = this.generateKey(endpoint, params);
    
    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const ttl = customTtl !== undefined ? customTtl : this.config.ttl;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + (ttl * 1000)
    };

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
    
    this.logger.debug('Cache set', { 
      key, 
      size: this.cache.size,
      expiresAt: new Date(entry.expiresAt).toISOString(),
      ttl: ttl
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
        remainingEntries: this.cache.size 
      });
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < lruAccess) {
        lruAccess = accessTime;
        lruKey = key;
      }
    }

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
      ttl: this.config.ttl
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
