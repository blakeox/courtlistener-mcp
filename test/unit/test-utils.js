#!/usr/bin/env node

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

const utils = await import('../../dist/common/utils.js');

describe('Common Utils', () => {
  describe('safely', () => {
    it('wraps success into Result', async () => {
      const res = await utils.safely(async () => 42);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data, 42);
    });

    it('wraps error into Result failure', async () => {
      const res = await utils.safely(async () => { throw new Error('boom'); });
      assert.strictEqual(res.success, false);
      assert.ok(res.error instanceof Error);
      assert.match(res.error.message, /boom/);
    });
  });

  describe('retry', () => {
    it('retries and succeeds before maxAttempts', async () => {
      let attempts = 0;
      const start = Date.now();
      const value = await utils.retry(async () => {
        attempts++;
        if (attempts < 2) throw new Error('fail once');
        return 'ok';
      }, { maxAttempts: 3, baseDelay: 5, maxDelay: 10, backoffMultiplier: 2 });
      const elapsed = Date.now() - start;
      assert.strictEqual(value, 'ok');
      assert.ok(attempts === 2);
      assert.ok(elapsed >= 5);
    });

    it('throws after maxAttempts', async () => {
      let attempts = 0;
      await assert.rejects(() => utils.retry(async () => {
        attempts++;
        throw new Error('always');
      }, { maxAttempts: 2, baseDelay: 1, maxDelay: 2, backoffMultiplier: 2 }));
      assert.strictEqual(attempts, 2);
    });
  });

  describe('sleep', () => {
    it('delays roughly the requested time', async () => {
      const start = Date.now();
      await utils.sleep(10);
      assert.ok(Date.now() - start >= 9);
    });
  });

  describe('deepMerge', () => {
    it('merges nested objects deeply', () => {
      const a = { a: 1, nest: { x: 1 } };
      const b = { b: 2, nest: { y: 2 } };
      const res = utils.deepMerge({ ...a }, b);
      assert.deepStrictEqual(res, { a: 1, b: 2, nest: { x: 1, y: 2 } });
    });
  });

  describe('generateId', () => {
    it('produces a UUID-like v4 string', () => {
      const id = utils.generateId();
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('debounce', () => {
    it('debounces rapid calls', async () => {
      let count = 0;
      const debounced = utils.debounce(() => { count++; }, 10);
      debounced(); debounced(); debounced();
      assert.strictEqual(count, 0);
      await utils.sleep(15);
      assert.strictEqual(count, 1);
    });
  });

  describe('throttle', () => {
    it('throttles repeated calls', async () => {
      let count = 0;
      const throttled = utils.throttle(() => { count++; }, 20);
      throttled(); // fires
      throttled(); // ignored
      await utils.sleep(25);
      throttled(); // fires again
      assert.strictEqual(count, 2);
    });
  });

  describe('pick/omit', () => {
    it('picks specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const res = utils.pick(obj, ['a', 'c']);
      assert.deepStrictEqual(res, { a: 1, c: 3 });
    });

    it('omits specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const res = utils.omit(obj, ['b']);
      assert.deepStrictEqual(res, { a: 1, c: 3 });
    });
  });

  describe('isEmpty', () => {
    it('detects empties', () => {
      assert.strictEqual(utils.isEmpty(null), true);
      assert.strictEqual(utils.isEmpty(undefined), true);
      assert.strictEqual(utils.isEmpty(''), true);
      assert.strictEqual(utils.isEmpty([]), true);
      assert.strictEqual(utils.isEmpty({}), true);
    });

    it('detects non-empties', () => {
      assert.strictEqual(utils.isEmpty('x'), false);
      assert.strictEqual(utils.isEmpty([1]), false);
      assert.strictEqual(utils.isEmpty({ a: 1 }), false);
    });
  });

  describe('isValidEmail', () => {
    it('validates simple formats', () => {
      assert.strictEqual(utils.isValidEmail('a@b.com'), true);
      assert.strictEqual(utils.isValidEmail('nope'), false);
    });
  });

  describe('sanitize', () => {
    it('removes dangerous patterns', () => {
      const s = '<img src=x onload=alert(1)> javascript:evil() test';
      const safe = utils.sanitize(s);
      assert.ok(!safe.includes('<'));
      assert.ok(!safe.includes('>'));
      assert.ok(!/on\w+=/i.test(safe));
      assert.ok(!/javascript:/i.test(safe));
    });
  });
});
