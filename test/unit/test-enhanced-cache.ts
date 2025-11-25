#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Enhanced Cache (Phase 5)
 * Tests advanced caching strategies and pagination-aware caching
 */

import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

import { CacheManager } from '../../src/infrastructure/cache.js';
import { EnhancedCache, PaginationCache } from '../../src/infrastructure/enhanced-cache.js';
import { Logger } from '../../src/infrastructure/logger.js';

class SilentLogger extends Logger {
  constructor() {
    super({ level: 'error', format: 'json', enabled: false }, 'Silent');
  }

  child(): SilentLogger {
    return new SilentLogger();
  }
}

describe('EnhancedCache', () => {
  let baseCache: CacheManager;
  let enhancedCache: EnhancedCache;
  let logger: Logger;

  beforeEach(() => {
    logger = new SilentLogger();
    baseCache = new CacheManager({ enabled: true, ttl: 3600, maxSize: 100 }, logger);
    enhancedCache = new EnhancedCache(baseCache, logger);
  });

  describe('getStaleWhileRevalidate', () => {
    it('returns null when no cache exists', () => {
      const result = enhancedCache.getStaleWhileRevalidate(
        'test-key',
        { param: 'value' },
        async () => 'fresh-data',
        3600,
      );

      assert.strictEqual(result.data, null);
      assert.strictEqual(result.stale, false);
    });

    it('returns cached data immediately', () => {
      // Prime the cache
      baseCache.set('test-key', { param: 'value' }, 'cached-data', 3600);

      const result = enhancedCache.getStaleWhileRevalidate(
        'test-key',
        { param: 'value' },
        async () => 'fresh-data',
        3600,
      );

      assert.strictEqual(result.data, 'cached-data');
      assert.strictEqual(result.stale, false);
    });
  });

  describe('getStale', () => {
    it('returns null when no cache exists', () => {
      const result = enhancedCache.getStale('non-existent-key', {});
      assert.strictEqual(result, null);
    });

    it('returns cached data', () => {
      baseCache.set('test-key', { param: 'value' }, 'test-data', 3600);

      const result = enhancedCache.getStale('test-key', { param: 'value' });
      assert.strictEqual(result, 'test-data');
    });
  });

  describe('warmup', () => {
    it('populates cache with fetched data', async () => {
      let fetchCalled = false;

      await enhancedCache.warmup(
        'warmup-key',
        { test: 'param' },
        async () => {
          fetchCalled = true;
          return 'warmed-data';
        },
        3600,
      );

      assert.strictEqual(fetchCalled, true);
      const cached = baseCache.get('warmup-key', { test: 'param' });
      assert.strictEqual(cached, 'warmed-data');
    });

    it('handles fetch errors gracefully', async () => {
      await enhancedCache.warmup(
        'error-key',
        {},
        async () => {
          throw new Error('Fetch failed');
        },
        3600,
      );

      // Should not throw, just log warning
      const cached = baseCache.get('error-key', {});
      assert.strictEqual(cached, null);
    });

    it('prevents duplicate warmup for same key', async () => {
      let callCount = 0;

      const warmupPromise1 = enhancedCache.warmup(
        'same-key',
        {},
        async () => {
          callCount++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'data';
        },
        3600,
      );

      const warmupPromise2 = enhancedCache.warmup(
        'same-key',
        {},
        async () => {
          callCount++;
          return 'data';
        },
        3600,
      );

      await Promise.all([warmupPromise1, warmupPromise2]);

      // Should only call fetcher once
      assert.strictEqual(callCount, 1);
    });
  });

  describe('getMultiple', () => {
    it('retrieves multiple cache entries', () => {
      baseCache.set('key1', {}, 'data1', 3600);
      baseCache.set('key2', {}, 'data2', 3600);

      const results = enhancedCache.getMultiple([
        { key: 'key1', params: {} },
        { key: 'key2', params: {} },
        { key: 'key3', params: {} }, // Missing
      ]);

      assert.strictEqual(results.get('key1'), 'data1');
      assert.strictEqual(results.get('key2'), 'data2');
      assert.strictEqual(results.get('key3'), null);
    });
  });

  describe('setMultiple', () => {
    it('stores multiple cache entries', () => {
      enhancedCache.setMultiple([
        { key: 'batch1', params: {}, value: 'value1', ttl: 3600 },
        { key: 'batch2', params: {}, value: 'value2', ttl: 3600 },
        { key: 'batch3', params: {}, value: 'value3', ttl: 3600 },
      ]);

      assert.strictEqual(baseCache.get('batch1', {}), 'value1');
      assert.strictEqual(baseCache.get('batch2', {}), 'value2');
      assert.strictEqual(baseCache.get('batch3', {}), 'value3');
    });
  });

  describe('invalidatePattern', () => {
    it('invalidates entries matching regex pattern', () => {
      baseCache.set('user:123', {}, 'user-data', 3600);
      baseCache.set('user:456', {}, 'user-data', 3600);
      baseCache.set('product:789', {}, 'product-data', 3600);

      const count = enhancedCache.invalidatePattern(/^user:/);

      assert.strictEqual(count, 2);
      assert.strictEqual(baseCache.get('user:123', {}), null);
      assert.strictEqual(baseCache.get('user:456', {}), null);
      assert.strictEqual(baseCache.get('product:789', {}), 'product-data'); // Not invalidated
    });

    it('returns zero when no matches', () => {
      baseCache.set('test', {}, 'data', 3600);

      const count = enhancedCache.invalidatePattern(/^nonexistent/);
      assert.strictEqual(count, 0);
    });
  });

  describe('getStats', () => {
    it('returns cache statistics with warmup info', () => {
      baseCache.set('test1', {}, 'data1', 3600);
      baseCache.set('test2', {}, 'data2', 3600);

      const stats = enhancedCache.getStats();

      assert.ok(stats.size >= 2);
      assert.strictEqual(stats.maxSize, 100);
      assert.strictEqual(stats.warmupInProgress, 0);
    });
  });
});

describe('PaginationCache', () => {
  let baseCache: CacheManager;
  let enhancedCache: EnhancedCache;
  let paginationCache: PaginationCache;
  let logger: Logger;

  beforeEach(() => {
    logger = new SilentLogger();
    baseCache = new CacheManager({ enabled: true, ttl: 3600, maxSize: 100 }, logger);
    enhancedCache = new EnhancedCache(baseCache, logger);
    paginationCache = new PaginationCache(enhancedCache);
  });

  describe('setPaginatedResult', () => {
    it('caches paginated result', () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];

      paginationCache.setPaginatedResult(
        'search:opinions',
        1, // page
        20, // pageSize
        data,
        100, // totalCount
        3600,
      );

      const cached = paginationCache.getPaginatedResult('search:opinions', 1, 20);

      assert.ok(cached);
      assert.strictEqual(cached.data.length, 3);
      assert.strictEqual(cached.page, 1);
      assert.strictEqual(cached.pageSize, 20);
      assert.strictEqual(cached.totalCount, 100);
      assert.strictEqual(cached.totalPages, 5);
    });
  });

  describe('getPaginatedResult', () => {
    it('retrieves cached page', () => {
      const data = [{ id: 1 }, { id: 2 }];

      paginationCache.setPaginatedResult('test', 2, 10, data, 50, 3600);

      const cached = paginationCache.getPaginatedResult('test', 2, 10);

      assert.ok(cached);
      assert.strictEqual(cached.page, 2);
      assert.strictEqual(cached.pageSize, 10);
      assert.strictEqual(cached.data.length, 2);
    });

    it('returns null for non-existent page', () => {
      const cached = paginationCache.getPaginatedResult('nonexistent', 1, 20);
      assert.strictEqual(cached, null);
    });

    it('handles different page sizes separately', () => {
      paginationCache.setPaginatedResult('test', 1, 10, [{ id: 1 }], 100, 3600);
      paginationCache.setPaginatedResult('test', 1, 20, [{ id: 2 }], 100, 3600);

      const page10 = paginationCache.getPaginatedResult('test', 1, 10);
      const page20 = paginationCache.getPaginatedResult('test', 1, 20);

      assert.ok(page10);
      assert.ok(page20);
      assert.strictEqual(page10.data[0].id, 1);
      assert.strictEqual(page20.data[0].id, 2);
    });
  });

  describe('invalidateAllPages', () => {
    it('clears all pages for a base key', () => {
      paginationCache.setPaginatedResult('search', 1, 20, [{ id: 1 }], 100, 3600);
      paginationCache.setPaginatedResult('search', 2, 20, [{ id: 2 }], 100, 3600);
      paginationCache.setPaginatedResult('search', 3, 20, [{ id: 3 }], 100, 3600);
      paginationCache.setPaginatedResult('other', 1, 20, [{ id: 4 }], 50, 3600);

      paginationCache.invalidateAllPages('search');

      assert.strictEqual(paginationCache.getPaginatedResult('search', 1, 20), null);
      assert.strictEqual(paginationCache.getPaginatedResult('search', 2, 20), null);
      assert.strictEqual(paginationCache.getPaginatedResult('search', 3, 20), null);
      assert.ok(paginationCache.getPaginatedResult('other', 1, 20)); // Not invalidated
    });
  });

  describe('prefetchAdjacentPages', () => {
    it('prefetches next and previous pages', async () => {
      const fetchedPages: number[] = [];

      await paginationCache.prefetchAdjacentPages(
        'test',
        2, // current page
        10,
        async (page) => {
          fetchedPages.push(page);
          return {
            data: [{ id: page * 10 }],
            totalCount: 100,
          };
        },
        3600,
      );

      // Should prefetch pages 1 and 3
      assert.ok(fetchedPages.includes(1));
      assert.ok(fetchedPages.includes(3));
      assert.strictEqual(fetchedPages.length, 2);

      // Verify pages were cached
      const page1 = paginationCache.getPaginatedResult('test', 1, 10);
      const page3 = paginationCache.getPaginatedResult('test', 3, 10);

      assert.ok(page1);
      assert.ok(page3);
    });

    it('does not prefetch page 0 or negative pages', async () => {
      const fetchedPages: number[] = [];

      await paginationCache.prefetchAdjacentPages(
        'test',
        1, // current page
        10,
        async (page) => {
          fetchedPages.push(page);
          return {
            data: [{ id: page }],
            totalCount: 100,
          };
        },
        3600,
      );

      // Should only prefetch page 2 (not page 0)
      assert.ok(fetchedPages.includes(2));
      assert.ok(!fetchedPages.includes(0));
      assert.strictEqual(fetchedPages.length, 1);
    });

    it('skips already-cached pages', async () => {
      // Pre-cache page 3
      paginationCache.setPaginatedResult('test', 3, 10, [{ id: 30 }], 100, 3600);

      const fetchedPages: number[] = [];

      await paginationCache.prefetchAdjacentPages(
        'test',
        2,
        10,
        async (page) => {
          fetchedPages.push(page);
          return {
            data: [{ id: page * 10 }],
            totalCount: 100,
          };
        },
        3600,
      );

      // Should only fetch page 1 (page 3 already cached)
      assert.ok(fetchedPages.includes(1));
      assert.ok(!fetchedPages.includes(3));
      assert.strictEqual(fetchedPages.length, 1);
    });

    it('handles fetch errors gracefully', async () => {
      // Should not throw
      await paginationCache.prefetchAdjacentPages(
        'test',
        2,
        10,
        async () => {
          throw new Error('Fetch failed');
        },
        3600,
      );

      // Pages should not be cached
      assert.strictEqual(paginationCache.getPaginatedResult('test', 1, 10), null);
      assert.strictEqual(paginationCache.getPaginatedResult('test', 3, 10), null);
    });
  });
});

describe('Cache Integration', () => {
  it('works together for realistic scenario', async () => {
    const logger = new SilentLogger();
    const baseCache = new CacheManager({ enabled: true, ttl: 3600, maxSize: 100 }, logger);
    const enhancedCache = new EnhancedCache(baseCache, logger);
    const paginationCache = new PaginationCache(enhancedCache);

    // Simulate a paginated search
    const searchResults = [
      { id: 1, title: 'Case 1' },
      { id: 2, title: 'Case 2' },
      { id: 3, title: 'Case 3' },
    ];

    // Cache page 1
    paginationCache.setPaginatedResult('opinions:search:privacy', 1, 20, searchResults, 100, 3600);

    // Retrieve it
    const cached = paginationCache.getPaginatedResult('opinions:search:privacy', 1, 20);

    assert.ok(cached);
    assert.strictEqual(cached.data.length, 3);
    assert.strictEqual(cached.totalCount, 100);
    assert.strictEqual(cached.totalPages, 5);

    // Invalidate all pages for this search
    paginationCache.invalidateAllPages('opinions:search:privacy');

    const afterInvalidate = paginationCache.getPaginatedResult('opinions:search:privacy', 1, 20);
    assert.strictEqual(afterInvalidate, null);
  });
});
