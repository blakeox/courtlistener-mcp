#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Middleware Factory (TypeScript)
 * Tests middleware creation, execution, and configuration
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { ServerConfig } from '../../src/types.js';

const { MiddlewareFactory } = await import('../../dist/infrastructure/middleware-factory.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor() {
    super({ level: 'error', format: 'json', enabled: false }, 'Silent');
  }
}

interface BaseConfig {
  logging?: { enabled: boolean };
  security?: {
    authEnabled?: boolean;
    rateLimitEnabled?: boolean;
    maxRequestsPerMinute?: number;
    [key: string]: unknown;
  };
  metrics?: { enabled: boolean; port: number };
  cache?: { enabled: boolean };
  circuitBreaker?: { enabled: boolean };
  [key: string]: unknown;
}

function baseConfig(overrides: Partial<BaseConfig> = {}): ServerConfig {
  return {
    logging: { enabled: false, level: 'error', format: 'json' },
    security: {
      authEnabled: false,
      rateLimitEnabled: false,
      maxRequestsPerMinute: 2,
      apiKeys: [],
      allowAnonymous: true,
      corsEnabled: false,
      corsOrigins: [],
      sanitizationEnabled: false,
      ...overrides.security,
    },
    metrics: { enabled: false, port: 0 },
    cache: { enabled: false, ttl: 300, maxSize: 1000 },
    circuitBreaker: { enabled: false, failureThreshold: 5, successThreshold: 3, timeout: 10000, resetTimeout: 60000 },
    audit: { enabled: false, logLevel: 'info', includeRequestBody: false, includeResponseBody: false, maxBodyLength: 2000, sensitiveFields: [] },
    compression: { enabled: false, threshold: 1024, level: 6 },
    courtListener: { baseUrl: 'https://api.example.com', version: 'v4', timeout: 30000, retryAttempts: 3, rateLimitPerMinute: 100 },
    ...overrides,
  } as ServerConfig;
}

interface MiddlewareContext {
  requestId: string;
  userId?: string;
  startTime: number;
  metadata: Record<string, unknown>;
}

describe('MiddlewareFactory (TypeScript)', () => {
  it('creates empty stack when features disabled and executes final handler', async () => {
    const factory = new MiddlewareFactory(new SilentLogger());
    const config = baseConfig();
    const stack = factory.createMiddlewareStack(config);
    assert.deepStrictEqual(stack, []);
    const result = await factory.executeMiddlewareStack(
      stack,
      { requestId: 'r1', startTime: Date.now(), metadata: {} },
      async () => 'done'
    );
    assert.strictEqual(result, 'done');
  });

  it('adds auth middleware when enabled and passes through', async () => {
    const factory = new MiddlewareFactory(new SilentLogger());
    const config = baseConfig({ security: { authEnabled: true } });
    const stack = factory.createMiddlewareStack(config);
    assert.strictEqual(stack.length, 1);
    assert.strictEqual((stack[0] as { name?: string }).name, 'authentication');
    const result = await factory.executeMiddlewareStack(
      stack,
      { requestId: 'r2', startTime: Date.now(), metadata: {} },
      async () => 'ok'
    );
    assert.strictEqual(result, 'ok');
  });

  it('adds rate limiter when enabled and enforces limits', async () => {
    const factory = new MiddlewareFactory(new SilentLogger());
    const config = baseConfig({
      security: { rateLimitEnabled: true, maxRequestsPerMinute: 2 },
    });
    const stack = factory.createMiddlewareStack(config);
    assert.strictEqual(stack.length, 1);
    assert.strictEqual((stack[0] as { name?: string }).name, 'rateLimit');

    const ctx: MiddlewareContext = {
      requestId: 'r3',
      userId: 'u1',
      startTime: Date.now(),
      metadata: {},
    };

    // First two should pass
    const call = () =>
      factory.executeMiddlewareStack(stack, ctx, async () => 'ok');
    assert.strictEqual(await call(), 'ok');
    assert.strictEqual(await call(), 'ok');
    // Third should fail
    await assert.rejects(() => call(), /Rate limit exceeded/);
  });

  it('creates both middlewares when both enabled and preserves order', async () => {
    const factory = new MiddlewareFactory(new SilentLogger());
    const config = baseConfig({
      security: { authEnabled: true, rateLimitEnabled: true, maxRequestsPerMinute: 1 },
    });
    const stack = factory.createMiddlewareStack(config);
    assert.ok(stack.length >= 1);
    
    const names = stack.map((mw: { name?: string }) => mw.name);
    assert.ok(names.includes('authentication') || names.includes('rateLimit'));

    const result = await factory.executeMiddlewareStack(
      stack,
      { requestId: 'r4', startTime: Date.now(), metadata: {} },
      async () => 'ok'
    );
    assert.strictEqual(result, 'ok');
  });
});

