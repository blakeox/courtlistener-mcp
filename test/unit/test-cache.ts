#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Cache Manager (TypeScript)
 * Tests caching behavior, TTL expiration, LRU eviction, and statistics
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import type { CacheManager } from '../../src/infrastructure/cache.js';
import type { Logger } from '../../src/infrastructure/logger.js';
import { createMockLogger } from '../utils/test-helpers.ts';

// Type-safe mock logger
class MockLogger implements Logger {
  public readonly logs: Array<{
    level: string;
    msg: string;
    meta?: unknown;
  }> = [];

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', msg, meta });
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', msg, meta });
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', msg, meta });
  }

  error(msg: string, error?: Error, meta?: Record<string, unknown>): void {
    this.logs.push({
      level: 'error',
      msg,
      meta: { ...meta, error: error?.message },
    });
  }

  toolExecution(
    toolName: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    this.logs.push({
      level: success ? 'info' : 'error',
      msg: `Tool: ${toolName}`,
      meta: { duration, success, ...metadata },
    });
  }

  apiCall(
    method: string,
    endpoint: string,
    duration: number,
    status: number,
    metadata?: Record<string, unknown>
  ): void {
    this.logs.push({
      level: 'info',
      msg: `API ${method} ${endpoint}`,
      meta: { duration, status, ...metadata },
    });
  }

  child(component: string): Logger {
    return this; // Simplified for tests
  }

  startTimer(operation: string) {
    return {
      end(): number {
        return 0;
      },
      endWithError(): number {
        return 0;
      },
    };
  }
}

// Import the actual CacheManager (compiled version)
const { CacheManager } = await import('../../dist/infrastructure/cache.js');

describe('Cache Manager (TypeScript)', () => {
  let cache: CacheManager;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = new MockLogger();

    const config = {
      enabled: true,
      ttl: 300, // 5 minutes
      maxSize: 5, // Small size for testing LRU
    };

    cache = new CacheManager(config, mockLogger);
  });

  afterEach(() => {
    // Clean up cache instances to prevent hanging intervals
    if (cache && typeof cache.destroy === 'function') {
      cache.destroy();
    }
  });

  describe('Basic Caching', () => {
    it('should store and retrieve values with type safety', () => {
      const testData: Record<string, unknown> = {
        result: 'test data',
        count: 42,
      };

      cache.set('test-endpoint', { param: 'value' }, testData);
      const retrieved = cache.get<Record<string, unknown>>('test-endpoint', {
        param: 'value',
      });

      assert.notStrictEqual(retrieved, null);
      assert.deepStrictEqual(retrieved, testData);
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get<Record<string, unknown>>('non-existent', {
        param: 'value',
      });
      assert.strictEqual(result, null);
    });

    it('should generate consistent cache keys', () => {
      const testData1: Record<string, unknown> = { result: 'data1' };
      const testData2: Record<string, unknown> = { result: 'data2' };

      // Same parameters should generate same key
      cache.set('endpoint', { a: 1, b: 2 }, testData1);
      cache.set('endpoint', { b: 2, a: 1 }, testData2); // Different order

      const retrieved = cache.get<Record<string, unknown>>('endpoint', {
        a: 1,
        b: 2,
      });
      assert.deepStrictEqual(retrieved, testData2); // Should get the second one
    });

    it('should handle undefined parameters', () => {
      const testData: Record<string, unknown> = { result: 'test' };

      cache.set('endpoint', {}, testData);
      const retrieved = cache.get<Record<string, unknown>>('endpoint', {});

      assert.deepStrictEqual(retrieved, testData);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should respect TTL expiration', async () => {
      // Create cache with very short TTL
      const shortTtlConfig = {
        enabled: true,
        ttl: 0.1, // 100ms
        maxSize: 10,
      };
      const shortTtlCache = new CacheManager(shortTtlConfig, mockLogger);

      try {
        const testData: Record<string, unknown> = { result: 'expires soon' };
        shortTtlCache.set('endpoint', { param: 'value' }, testData);

        // Should be available immediately
        let retrieved = shortTtlCache.get<Record<string, unknown>>(
          'endpoint',
          { param: 'value' }
        );
        assert.deepStrictEqual(retrieved, testData);

        // Wait for expiration
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Should be expired
        retrieved = shortTtlCache.get<Record<string, unknown>>('endpoint', {
          param: 'value',
        });
        assert.strictEqual(retrieved, null);
      } finally {
        shortTtlCache.destroy();
      }
    });

    it('should support custom TTL', () => {
      const testData: Record<string, unknown> = { result: 'custom ttl' };

      // Set with custom TTL
      cache.set('endpoint', { param: 'value' }, testData, 600); // 10 minutes

      const retrieved = cache.get<Record<string, unknown>>('endpoint', {
        param: 'value',
      });
      assert.deepStrictEqual(retrieved, testData);
    });
  });

  describe('LRU (Least Recently Used) Eviction', () => {
    it('should evict least recently used items when full', () => {
      // Fill cache to capacity
      for (let i = 0; i < 5; i++) {
        cache.set('endpoint', { id: i }, { data: `item${i}` });
      }

      // Verify all items are stored
      for (let i = 0; i < 5; i++) {
        const retrieved = cache.get<{ data: string }>('endpoint', { id: i });
        assert.deepStrictEqual(retrieved, { data: `item${i}` });
      }

      // Add one more item (should evict the first one)
      cache.set('endpoint', { id: 5 }, { data: 'item5' });

      // First item should be evicted
      const evicted = cache.get<{ data: string }>('endpoint', { id: 0 });
      assert.strictEqual(evicted, null);

      // New item should be available
      const newest = cache.get<{ data: string }>('endpoint', { id: 5 });
      assert.deepStrictEqual(newest, { data: 'item5' });
    });

    it('should update access order on get', () => {
      // Fill cache
      for (let i = 0; i < 5; i++) {
        cache.set('endpoint', { id: i }, { data: `item${i}` });
      }

      // Access the first item (making it most recently used)
      cache.get('endpoint', { id: 0 });

      // Add new item (should evict item 1, not item 0)
      cache.set('endpoint', { id: 5 }, { data: 'item5' });

      // Item 0 should still be available (was accessed recently)
      const stillAvailable = cache.get<{ data: string }>('endpoint', {
        id: 0,
      });
      assert.deepStrictEqual(stillAvailable, { data: 'item0' });

      // Item 1 should be evicted
      const evicted = cache.get<{ data: string }>('endpoint', { id: 1 });
      assert.strictEqual(evicted, null);
    });
  });

  describe('Cache Statistics', () => {
    it('should provide accurate statistics', () => {
      // Add some items
      cache.set('endpoint1', { id: 1 }, { data: 'test1' });
      cache.set('endpoint2', { id: 2 }, { data: 'test2' });

      const stats = cache.getStats();

      assert.strictEqual(stats.totalEntries, 2);
      assert.strictEqual(stats.validEntries, 2);
      assert.strictEqual(stats.expiredEntries, 0);
      assert.strictEqual(stats.maxSize, 5);
      assert.strictEqual(stats.enabled, true);
      assert.strictEqual(stats.ttl, 300);
    });

    it('should count expired entries in statistics', async () => {
      // Create cache with short TTL
      const shortTtlConfig = {
        enabled: true,
        ttl: 0.1, // 100ms
        maxSize: 10,
      };
      const shortTtlCache = new CacheManager(shortTtlConfig, mockLogger);

      try {
        // Add items
        shortTtlCache.set('endpoint1', { id: 1 }, { data: 'test1' });
        shortTtlCache.set('endpoint2', { id: 2 }, { data: 'test2' });

        // Wait for expiration
        await new Promise((resolve) => setTimeout(resolve, 150));

        const stats = shortTtlCache.getStats();

        assert.strictEqual(stats.totalEntries, 2);
        assert.strictEqual(stats.validEntries, 0);
        assert.strictEqual(stats.expiredEntries, 2);
      } finally {
        shortTtlCache.destroy();
      }
    });
  });

  describe('Cache Control', () => {
    it('should clear all cache entries', () => {
      // Add multiple items
      for (let i = 0; i < 3; i++) {
        cache.set('endpoint', { id: i }, { data: `item${i}` });
      }

      // Verify items exist
      assert.deepStrictEqual(cache.get('endpoint', { id: 0 }), {
        data: 'item0',
      });

      // Clear cache
      cache.clear();

      // All items should be gone
      for (let i = 0; i < 3; i++) {
        const result = cache.get('endpoint', { id: i });
        assert.strictEqual(result, null);
      }

      // Stats should show empty cache
      const stats = cache.getStats();
      assert.strictEqual(stats.totalEntries, 0);
    });

    it('should respect enabled/disabled state', () => {
      // Create disabled cache
      const disabledConfig = {
        enabled: false,
        ttl: 300,
        maxSize: 10,
      };
      const disabledCache = new CacheManager(disabledConfig, mockLogger);

      try {
        // Try to set value
        disabledCache.set('endpoint', { param: 'value' }, { data: 'test' });

        // Should return null (caching disabled)
        const result = disabledCache.get('endpoint', { param: 'value' });
        assert.strictEqual(result, null);

        // Should report disabled in stats
        assert.strictEqual(disabledCache.isEnabled(), false);
      } finally {
        disabledCache.destroy();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed data gracefully', () => {
      // Test with circular reference
      const circularData: Record<string, unknown> = { name: 'test' };
      circularData.self = circularData;

      // Should not throw error
      assert.doesNotThrow(() => {
        cache.set('endpoint', { param: 'value' }, circularData);
      });
    });

    it('should handle complex parameter types', () => {
      const complexParams = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        nullValue: null,
        undefinedValue: undefined,
      };

      const testData: Record<string, unknown> = { result: 'complex params' };

      cache.set('endpoint', complexParams, testData);
      const retrieved = cache.get<Record<string, unknown>>(
        'endpoint',
        complexParams
      );

      assert.deepStrictEqual(retrieved, testData);
    });
  });

  describe('Automatic Cleanup', () => {
    it('should remove expired entries during access', async () => {
      // Create cache with short TTL
      const shortTtlConfig = {
        enabled: true,
        ttl: 0.1, // 100ms
        maxSize: 10,
      };
      const shortTtlCache = new CacheManager(shortTtlConfig, mockLogger);

      try {
        // Add item
        shortTtlCache.set('endpoint', { id: 1 }, { data: 'test' });

        // Wait for expiration
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Access should trigger cleanup
        const result = shortTtlCache.get<Record<string, unknown>>('endpoint', {
          id: 1,
        });
        assert.strictEqual(result, null);

        // Cache should be empty after cleanup
        const stats = shortTtlCache.getStats();
        assert.strictEqual(stats.totalEntries, 0);
      } finally {
        shortTtlCache.destroy();
      }
    });
  });

  describe('Performance', () => {
    it('should handle large datasets efficiently', () => {
      // Create larger cache
      const largeConfig = {
        enabled: true,
        ttl: 300,
        maxSize: 1000,
      };
      const largeCache = new CacheManager(largeConfig, mockLogger);

      try {
        const startTime = Date.now();

        // Add many items
        for (let i = 0; i < 500; i++) {
          largeCache.set('endpoint', { id: i }, { data: `item${i}` });
        }

        // Retrieve many items
        for (let i = 0; i < 500; i++) {
          const retrieved = largeCache.get<{ data: string }>('endpoint', {
            id: i,
          });
          assert.deepStrictEqual(retrieved, { data: `item${i}` });
        }

        const duration = Date.now() - startTime;

        // Should complete quickly (under 1 second)
        assert.ok(
          duration < 1000,
          `Cache operations took too long: ${duration}ms`
        );
      } finally {
        // Always clean up the large cache instance
        largeCache.destroy();
      }
    });
  });
});

