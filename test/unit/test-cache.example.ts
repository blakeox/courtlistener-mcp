#!/usr/bin/env node

/**
 * ✅ TypeScript Example: Unit Tests for Cache Manager
 * Demonstrates TypeScript testing with type safety and better IDE support
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import type { CacheManager } from '../../src/infrastructure/cache.js';
import type { Logger } from '../../src/infrastructure/logger.js';

// Type-safe mock logger
class MockLogger implements Logger {
  public readonly logs: Array<{ level: string; msg: string; meta?: unknown }> = [];

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
    this.logs.push({ level: 'error', msg, meta, error: error?.message });
  }

  toolExecution(
    toolName: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    this.logs.push({ level: success ? 'info' : 'error', msg: `Tool: ${toolName}`, meta: { duration, success, ...metadata } });
  }

  apiCall(
    method: string,
    endpoint: string,
    duration: number,
    status: number,
    metadata?: Record<string, unknown>
  ): void {
    this.logs.push({ level: 'info', msg: `API ${method} ${endpoint}`, meta: { duration, status, ...metadata } });
  }

  child(component: string): Logger {
    return this; // Simplified for tests
  }

  startTimer(operation: string) {
    return {
      end: (): number => 0,
      endWithError: (): number => 0,
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
      const testData: Record<string, unknown> = { result: 'test data', count: 42 };

      cache.set('test-endpoint', { param: 'value' }, testData);
      const retrieved = cache.get<Record<string, unknown>>('test-endpoint', { param: 'value' });

      assert.notStrictEqual(retrieved, null);
      assert.deepStrictEqual(retrieved, testData);
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get<Record<string, unknown>>('non-existent', { param: 'value' });
      assert.strictEqual(result, null);
    });

    it('should handle typed cache operations', () => {
      interface TestData {
        id: number;
        name: string;
      }

      const testData: TestData = { id: 1, name: 'test' };
      cache.set('typed-endpoint', {}, testData);

      const retrieved = cache.get<TestData>('typed-endpoint', {});
      assert.notStrictEqual(retrieved, null);
      assert.strictEqual(retrieved?.id, 1);
      assert.strictEqual(retrieved?.name, 'test');
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      const testData = { data: 'expires' };
      cache.set('expiring-endpoint', {}, testData, 1); // 1 second TTL

      // Should be available immediately
      let retrieved = cache.get('expiring-endpoint', {});
      assert.notStrictEqual(retrieved, null);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be expired
      retrieved = cache.get('expiring-endpoint', {});
      assert.strictEqual(retrieved, null);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used entry when max size reached', () => {
      // Fill cache to max size
      for (let i = 0; i < 5; i++) {
        cache.set(`endpoint-${i}`, {}, { data: `value-${i}` });
      }

      // Add one more to trigger eviction
      cache.set('new-endpoint', {}, { data: 'new' });

      // First entry should be evicted
      const first = cache.get('endpoint-0', {});
      assert.strictEqual(first, null);

      // New entry should be available
      const retrieved = cache.get('new-endpoint', {});
      assert.notStrictEqual(retrieved, null);
    });
  });
});

