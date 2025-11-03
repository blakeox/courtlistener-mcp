/**
 * Enhanced caching strategies for better performance
 * Phase 5: Performance Optimizations
 */

import { CacheManager } from './cache.js';
import { Logger } from './logger.js';

/**
 * Enhanced cache with advanced strategies
 */
export class EnhancedCache {
  private warmupKeys: Set<string> = new Set();

  constructor(private cache: CacheManager, private logger: Logger) {}

  /**
   * Get value with stale-while-revalidate pattern
   * Returns stale data immediately while fetching fresh data in background
   */
  getStaleWhileRevalidate<T>(
    key: string,
    params: Record<string, unknown>,
    revalidate: () => Promise<T>,
    ttl: number = 3600
  ): { data: T | null; stale: boolean } {
    const value = this.cache.get<T>(key, params);
    
    if (value) {
      // Trigger background revalidation (simplified - no age checking for now)
      this.revalidateInBackground(key, params, revalidate, ttl);
      return { data: value, stale: false };
    }
    
    return { data: null, stale: false };
  }

  /**
   * Revalidate cache entry in background
   */
  private async revalidateInBackground<T>(
    key: string,
    params: Record<string, unknown>,
    fetcher: () => Promise<T>,
    ttl: number
  ): Promise<void> {
    try {
      const fresh = await fetcher();
      this.cache.set(key, params, fresh, ttl);
      this.logger.debug('Cache revalidated in background', { key });
    } catch (error) {
      this.logger.warn('Background revalidation failed', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get stale data (even if expired) - useful for fallback
   * Note: Current Cache implementation auto-expires, so this returns fresh or null
   */
  getStale<T>(key: string, params?: Record<string, unknown>): T | null {
    return this.cache.get<T>(key, params);
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmup(
    key: string,
    params: Record<string, unknown>,
    fetcher: () => Promise<unknown>,
    ttl: number
  ): Promise<void> {
    const fullKey = JSON.stringify({ key, params });
    
    if (this.warmupKeys.has(fullKey)) {
      this.logger.debug('Cache warmup already in progress', { key });
      return;
    }

    this.warmupKeys.add(fullKey);

    try {
      const data = await fetcher();
      this.cache.set(key, params, data, ttl);
      this.logger.info('Cache warmed up successfully', { key });
    } catch (error) {
      this.logger.warn('Cache warmup failed', {
        key,
        error: (error as Error).message,
      });
    } finally {
      this.warmupKeys.delete(fullKey);
    }
  }

  /**
   * Batch get multiple cache entries
   */
  getMultiple<T>(
    keys: Array<{ key: string; params: Record<string, unknown> }>
  ): Map<string, T | null> {
    const results = new Map<string, T | null>();
    
    for (const { key, params } of keys) {
      results.set(key, this.cache.get<T>(key, params));
    }
    
    return results;
  }

  /**
   * Batch set multiple cache entries
   */
  setMultiple(
    entries: Array<{
      key: string;
      params: Record<string, unknown>;
      value: unknown;
      ttl: number;
    }>
  ): void {
    for (const { key, params, value, ttl } of entries) {
      this.cache.set(key, params, value, ttl);
    }
  }

  /**
   * Invalidate all entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    
    for (const [key] of (this as any).cache.entries()) {
      if (pattern.test(key)) {
        (this as any).cache.delete(key);
        count++;
      }
    }
    
    (this as any).logger.info('Invalidated cache entries by pattern', {
      pattern: pattern.source,
      count,
    });
    
    return count;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    warmupInProgress: number;
  } {
    const baseStats = this.cache.getStats();
    return {
      size: baseStats.validEntries,
      maxSize: baseStats.maxSize,
      warmupInProgress: this.warmupKeys.size,
    };
  }
}

/**
 * Pagination-aware cache for better hit rates
 */
export class PaginationCache {
  constructor(private baseCache: EnhancedCache) {}

  /**
   * Set paginated result with per-page caching
   */
  setPaginatedResult<T>(
    baseKey: string,
    page: number,
    pageSize: number,
    data: T[],
    totalCount: number,
    ttl: number = 3600
  ): void {
    const pageKey = `${baseKey}:page:${page}:size:${pageSize}`;
    
    (this.baseCache as any).set(
      pageKey,
      {},
      {
        data,
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      ttl
    );
  }

  /**
   * Get paginated result for specific page
   */
  getPaginatedResult<T>(
    baseKey: string,
    page: number,
    pageSize: number
  ): { data: T[]; page: number; pageSize: number; totalCount: number; totalPages: number } | null {
    const pageKey = `${baseKey}:page:${page}:size:${pageSize}`;
    return (this.baseCache as any).get(pageKey, {});
  }

  /**
   * Invalidate all pages for a base key
   */
  invalidateAllPages(baseKey: string): void {
    const pattern = new RegExp(`^${baseKey}:page:`);
    
    if (this.baseCache instanceof EnhancedCache) {
      this.baseCache.invalidatePattern(pattern);
    }
  }

  /**
   * Prefetch next/previous pages
   */
  async prefetchAdjacentPages<T>(
    baseKey: string,
    currentPage: number,
    pageSize: number,
    fetcher: (page: number) => Promise<{ data: T[]; totalCount: number }>,
    ttl: number = 3600
  ): Promise<void> {
    const pagesToPrefetch = [currentPage + 1, currentPage - 1].filter((p) => p > 0);

    await Promise.allSettled(
      pagesToPrefetch.map(async (page) => {
        const existing = this.getPaginatedResult<T>(baseKey, page, pageSize);
        if (!existing) {
          try {
            const result = await fetcher(page);
            this.setPaginatedResult(baseKey, page, pageSize, result.data, result.totalCount, ttl);
          } catch {
            // Prefetch failure is non-critical
          }
        }
      })
    );
  }
}

