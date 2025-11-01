#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Utility Functions (TypeScript)
 * Tests common utilities, retry logic, and helper functions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  retry,
  sleep,
  deepMerge,
  generateId,
  pick,
  omit,
  isEmpty,
} from '../../src/common/utils.js';

describe('Utility Functions (TypeScript)', () => {
  describe('Retry Logic', () => {
    it('should retry on failure with exponential backoff', async () => {
      let attempts = 0;
      const operation = async (): Promise<string> => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Operation failed');
        }
        return 'success';
      };

      const result = await retry(operation, {
        maxAttempts: 5,
        baseDelay: 10,
        maxDelay: 100,
      });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 3);
    });

    it('should throw error after max attempts', async () => {
      const operation = async (): Promise<string> => {
        throw new Error('Always fails');
      };

      await assert.rejects(
        () =>
          retry(operation, {
            maxAttempts: 3,
            baseDelay: 10,
          }),
        /Always fails/
      );
    });

    it('should succeed immediately on first attempt', async () => {
      const operation = async (): Promise<string> => {
        return 'success';
      };

      const result = await retry(operation);
      assert.strictEqual(result, 'success');
    });
  });

  describe('Sleep Function', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const duration = Date.now() - start;

      assert.ok(duration >= 90 && duration < 150, `Expected ~100ms, got ${duration}ms`);
    });
  });

  describe('Deep Merge', () => {
    it('should merge objects deeply', () => {
      const target = {
        a: 1,
        b: {
          c: 2,
          d: 3,
        },
      };

      const source = {
        b: {
          d: 4,
          e: 5,
        },
        f: 6,
      };

      const result = deepMerge(target, source);

      assert.strictEqual(result.a, 1);
      assert.strictEqual(result.b.c, 2);
      assert.strictEqual(result.b.d, 4);
      assert.strictEqual(result.b.e, 5);
      assert.strictEqual(result.f, 6);
    });

    it('should handle null and undefined sources', () => {
      const target = { a: 1 };

      const result = deepMerge(target, null, undefined, { b: 2 });

      assert.strictEqual(result.a, 1);
      assert.strictEqual(result.b, 2);
    });

    it('should not mutate target object', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 } };

      const result = deepMerge(target, source);

      assert.strictEqual(result.b.c, 2);
      assert.strictEqual(result.b.d, 3);
    });
  });

  describe('UUID Generation', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();

      assert.notStrictEqual(id1, id2);
      assert.ok(id1.length > 0);
      assert.ok(id2.length > 0);
    });

    it('should generate valid UUID v4 format', () => {
      const id = generateId();
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      assert.ok(uuidRegex.test(id), `Expected UUID format, got: ${id}`);
    });
  });

  describe('Pick Function', () => {
    it('should pick specified keys from object', () => {
      const obj = {
        a: 1,
        b: 2,
        c: 3,
        d: 4,
      };

      const result = pick(obj, ['a', 'c'] as const);

      assert.strictEqual(result.a, 1);
      assert.strictEqual(result.c, 3);
      assert.strictEqual(Object.keys(result).length, 2);
    });

    it('should handle missing keys gracefully', () => {
      const obj = { a: 1, b: 2 };
      const result = pick(obj, ['a', 'c'] as const);

      assert.strictEqual(result.a, 1);
      assert.ok(!('c' in result));
    });
  });

  describe('Omit Function', () => {
    it('should omit specified keys from object', () => {
      const obj = {
        a: 1,
        b: 2,
        c: 3,
        d: 4,
      };

      const result = omit(obj, ['b', 'd'] as const);

      assert.strictEqual(result.a, 1);
      assert.strictEqual(result.c, 3);
      assert.ok(!('b' in result));
      assert.ok(!('d' in result));
    });
  });

  describe('Is Empty Function', () => {
    it('should identify empty values', () => {
      assert.strictEqual(isEmpty(null), true);
      assert.strictEqual(isEmpty(undefined), true);
      assert.strictEqual(isEmpty(''), true);
      assert.strictEqual(isEmpty([]), true);
      assert.strictEqual(isEmpty({}), true);
    });

    it('should identify non-empty values', () => {
      assert.strictEqual(isEmpty('text'), false);
      assert.strictEqual(isEmpty([1]), false);
      assert.strictEqual(isEmpty({ a: 1 }), false);
      assert.strictEqual(isEmpty(0), false);
      assert.strictEqual(isEmpty(false), false);
    });
  });
});

