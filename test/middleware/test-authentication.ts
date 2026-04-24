/**
 * Production tests for the API-key authentication middleware.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AuthenticationMiddleware } from '../../src/middleware/authentication.js';
import type { MockLogger } from '../utils/test-helpers.ts';
import { createMockLogger } from '../utils/test-helpers.ts';

describe('AuthenticationMiddleware', () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  function createMiddleware(
    overrides: Partial<ConstructorParameters<typeof AuthenticationMiddleware>[0]> = {},
  ): AuthenticationMiddleware {
    return new AuthenticationMiddleware(
      {
        enabled: true,
        apiKeys: ['test-api-key-123', 'backup-key-456'],
        allowAnonymous: false,
        headerName: 'x-api-key',
        ...overrides,
      },
      logger,
    );
  }

  it('authenticates a valid API key from the configured header', async () => {
    const middleware = createMiddleware();

    const context = await middleware.authenticate({ 'x-api-key': 'test-api-key-123' });

    assert.equal(context.isAuthenticated, true);
    assert.equal(context.apiKey, 'test-api-key-123');
    assert.equal(context.clientId, 'client_test-api');
    assert.deepEqual(context.permissions, ['read', 'write', 'admin']);
  });

  it('supports bearer authorization headers', async () => {
    const middleware = createMiddleware();

    const context = await middleware.authenticate({
      authorization: 'Bearer backup-key-456',
    });

    assert.equal(context.isAuthenticated, true);
    assert.equal(context.apiKey, 'backup-key-456');
    assert.equal(context.clientId, 'client_backup-k');
  });

  it('allows anonymous requests when configured', async () => {
    const middleware = createMiddleware({ allowAnonymous: true });

    const context = await middleware.authenticate({});

    assert.deepEqual(context, {
      isAuthenticated: false,
      permissions: ['read'],
    });
    assert.equal(logger.getLogs().debug.length, 1);
  });

  it('rejects missing API keys when anonymous access is disabled', async () => {
    const middleware = createMiddleware();

    await assert.rejects(
      () => middleware.authenticate({}),
      /Authentication required: API key missing/,
    );
    assert.equal(logger.getLogs().warn.length, 1);
  });

  it('rejects invalid API keys', async () => {
    const middleware = createMiddleware();

    await assert.rejects(
      () => middleware.authenticate({ 'x-api-key': 'wrong-key' }),
      /Authentication failed: Invalid API key/,
    );
    assert.equal(logger.getLogs().warn.length, 1);
  });

  it('bypasses authentication entirely when disabled', async () => {
    const middleware = createMiddleware({ enabled: false });

    const context = await middleware.authenticate({});

    assert.deepEqual(context, {
      isAuthenticated: true,
      permissions: ['*'],
    });
  });

  it('checks permissions against explicit grants or wildcard access', () => {
    const middleware = createMiddleware();

    assert.equal(
      middleware.hasPermission({ isAuthenticated: true, permissions: ['read'] }, 'read'),
      true,
    );
    assert.equal(
      middleware.hasPermission({ isAuthenticated: true, permissions: ['read'] }, 'admin'),
      false,
    );
    assert.equal(
      middleware.hasPermission({ isAuthenticated: true, permissions: ['*'] }, 'admin'),
      true,
    );
  });
});
