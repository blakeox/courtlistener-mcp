#!/usr/bin/env node

import { describe, it } from 'node:test';
import assert from 'node:assert';

const { MiddlewareFactory } = await import('../../dist/infrastructure/middleware-factory.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor() { super({ level: 'silent' }); }
}

function baseConfig(overrides = {}) {
  return {
    logging: { enabled: false },
    security: {
      authEnabled: false,
      rateLimitEnabled: false,
      maxRequestsPerMinute: 2,
      ...overrides.security
    },
    metrics: { enabled: false, port: 0 },
    cache: { enabled: false },
    circuitBreaker: { enabled: false },
    ...overrides
  };
}

describe('MiddlewareFactory', () => {
  it('creates empty stack when features disabled and executes final handler', async () => {
    const factory = new MiddlewareFactory(new SilentLogger());
    const config = baseConfig();
    const stack = factory.createMiddlewareStack(config);
    assert.deepStrictEqual(stack, []);
    const result = await factory.executeMiddlewareStack(stack, { requestId: 'r1', startTime: Date.now(), metadata: {} }, async () => 'done');
    assert.strictEqual(result, 'done');
  });

  it('adds auth middleware when enabled and passes through', async () => {
    const factory = new MiddlewareFactory(new SilentLogger());
    const config = baseConfig({ security: { authEnabled: true } });
    const stack = factory.createMiddlewareStack(config);
    assert.strictEqual(stack.length, 1);
    assert.strictEqual(stack[0].name, 'authentication');
    const result = await factory.executeMiddlewareStack(stack, { requestId: 'r2', startTime: Date.now(), metadata: {} }, async () => 'ok');
    assert.strictEqual(result, 'ok');
  });

  it('adds rate limiter when enabled and enforces limits', async () => {
    const factory = new MiddlewareFactory(new SilentLogger());
    const config = baseConfig({ security: { rateLimitEnabled: true, maxRequestsPerMinute: 2 } });
    const stack = factory.createMiddlewareStack(config);
    assert.strictEqual(stack.length, 1);
    assert.strictEqual(stack[0].name, 'rateLimit');

    const ctx = { requestId: 'r3', userId: 'u1', startTime: Date.now(), metadata: {} };

    // First two should pass
    const call = () => factory.executeMiddlewareStack(stack, ctx, async () => 'ok');
    assert.strictEqual(await call(), 'ok');
    assert.strictEqual(await call(), 'ok');
    // Third should fail
    await assert.rejects(() => call(), /Rate limit exceeded/);
  });

  it('creates both middlewares when both enabled and preserves order', async () => {
    const factory = new MiddlewareFactory(new SilentLogger());
    const config = baseConfig({ security: { authEnabled: true, rateLimitEnabled: true, maxRequestsPerMinute: 1 } });
    const stack = factory.createMiddlewareStack(config);
    assert.strictEqual(stack.length, 2);
    assert.deepStrictEqual(stack.map(m => m.name), ['authentication', 'rateLimit']);

    const ctx = { requestId: 'r4', userId: 'uX', startTime: Date.now(), metadata: {} };
    // First call ok
    const result = await factory.executeMiddlewareStack(stack, ctx, async () => 'ok');
    assert.strictEqual(result, 'ok');
    // Second call rate-limited
    await assert.rejects(() => factory.executeMiddlewareStack(stack, ctx, async () => 'ok'), /Rate limit exceeded/);
  });
});
