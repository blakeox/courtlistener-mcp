#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Cache Manager
 * Tests caching behavior, TTL expiration, LRU eviction, and statistics
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

class MockLogger {
  constructor() {
    this.logs = [];
  }
  
  info(msg, meta) { this.logs.push({ level: 'info', msg, meta }); }
  debug(msg, meta) { this.logs.push({ level: 'debug', msg, meta }); }
}

// Import the actual CacheManager
const { CacheManager } = await import('../../dist/cache.js');

describe('Cache Manager', () => {
  let cache;
  let mockLogger;
  
  beforeEach(() => {
    mockLogger = new MockLogger();
    
    const config = {
      enabled: true,
      ttl: 300, // 5 minutes
      maxSize: 5 // Small size for testing LRU
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
    it('should store and retrieve values', () => {
      const testData = { result: 'test data' };
      
      cache.set('test-endpoint', { param: 'value' }, testData);
      const retrieved = cache.get('test-endpoint', { param: 'value' });
      
      assert.deepStrictEqual(retrieved, testData);
    });
    
    it('should return null for non-existent keys', () => {
      const result = cache.get('non-existent', { param: 'value' });
      assert.strictEqual(result, null);
    });

    it('should generate consistent cache keys', () => {
      const testData1 = { result: 'data1' };
      const testData2 = { result: 'data2' };
      
      // Same parameters should generate same key
      cache.set('endpoint', { a: 1, b: 2 }, testData1);
      cache.set('endpoint', { b: 2, a: 1 }, testData2); // Different order
      
      const retrieved = cache.get('endpoint', { a: 1, b: 2 });
      assert.deepStrictEqual(retrieved, testData2); // Should get the second one
    });

    it('should handle undefined parameters', () => {
      const testData = { result: 'test' };
      
      cache.set('endpoint', undefined, testData);
      const retrieved = cache.get('endpoint', undefined);
      
      assert.deepStrictEqual(retrieved, testData);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should respect TTL expiration', async () => {
      // Create cache with very short TTL
      const shortTtlConfig = {
        enabled: true,
        ttl: 0.1, // 100ms
        maxSize: 10
      };
      const shortTtlCache = new CacheManager(shortTtlConfig, mockLogger);
      
      try {
        const testData = { result: 'expires soon' };
        shortTtlCache.set('endpoint', { param: 'value' }, testData);
        
        // Should be available immediately
        let retrieved = shortTtlCache.get('endpoint', { param: 'value' });
        assert.deepStrictEqual(retrieved, testData);
        
        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Should be expired
        retrieved = shortTtlCache.get('endpoint', { param: 'value' });
        assert.strictEqual(retrieved, null);
      } finally {
        shortTtlCache.destroy();
      }
    });

    it('should support custom TTL', () => {
      const testData = { result: 'custom ttl' };
      
      // Set with custom TTL
      cache.set('endpoint', { param: 'value' }, testData, 600); // 10 minutes
      
      const retrieved = cache.get('endpoint', { param: 'value' });
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
        const retrieved = cache.get('endpoint', { id: i });
        assert.deepStrictEqual(retrieved, { data: `item${i}` });
      }
      
      // Add one more item (should evict the first one)
      cache.set('endpoint', { id: 5 }, { data: 'item5' });
      
      // First item should be evicted
      const evicted = cache.get('endpoint', { id: 0 });
      assert.strictEqual(evicted, null);
      
      // New item should be available
      const newest = cache.get('endpoint', { id: 5 });
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
      const stillAvailable = cache.get('endpoint', { id: 0 });
      assert.deepStrictEqual(stillAvailable, { data: 'item0' });
      
      // Item 1 should be evicted
      const evicted = cache.get('endpoint', { id: 1 });
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
        maxSize: 10
      };
      const shortTtlCache = new CacheManager(shortTtlConfig, mockLogger);
      
      try {
        // Add items
        shortTtlCache.set('endpoint1', { id: 1 }, { data: 'test1' });
        shortTtlCache.set('endpoint2', { id: 2 }, { data: 'test2' });
        
        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 150));
        
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
      assert.deepStrictEqual(cache.get('endpoint', { id: 0 }), { data: 'item0' });
      
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
        maxSize: 10
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
      const circularData = { name: 'test' };
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
        undefinedValue: undefined
      };
      
      const testData = { result: 'complex params' };
      
      cache.set('endpoint', complexParams, testData);
      const retrieved = cache.get('endpoint', complexParams);
      
      assert.deepStrictEqual(retrieved, testData);
    });
  });

  describe('Automatic Cleanup', () => {
    it('should remove expired entries during access', async () => {
      // Create cache with short TTL
      const shortTtlConfig = {
        enabled: true,
        ttl: 0.1, // 100ms
        maxSize: 10
      };
      const shortTtlCache = new CacheManager(shortTtlConfig, mockLogger);
      
      try {
        // Add item
        shortTtlCache.set('endpoint', { id: 1 }, { data: 'test' });
        
        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Access should trigger cleanup
        const result = shortTtlCache.get('endpoint', { id: 1 });
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
        maxSize: 1000
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
          const retrieved = largeCache.get('endpoint', { id: i });
          assert.deepStrictEqual(retrieved, { data: `item${i}` });
        }
        
        const duration = Date.now() - startTime;
        
        // Should complete quickly (under 1 second)
        assert.ok(duration < 1000, `Cache operations took too long: ${duration}ms`);
      } finally {
        // Always clean up the large cache instance
        largeCache.destroy();
      }
    });
  });
});

console.log('✅ Cache Manager unit tests completed');
