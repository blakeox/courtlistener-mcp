#!/usr/bin/env node

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { verifyTurnstileForRoute } from '../../src/server/worker-turnstile.js';

describe('verifyTurnstileForRoute', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects successful tokens whose action does not match the enforced route', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          action: 'session_bootstrap',
        }),
        { status: 200 },
      )) as typeof fetch;

    const result = await verifyTurnstileForRoute(
      new Request('https://example.com/api/ai-chat', {
        method: 'POST',
        headers: { 'cf-turnstile-response': 'token-1' },
      }),
      {
        TURNSTILE_SITE_KEY: 'site-key-1',
        TURNSTILE_SECRET_KEY: 'secret-key-1',
        MCP_TURNSTILE_ENFORCED_ROUTES: 'ai_chat',
      },
      'ai_chat',
      '127.0.0.1',
    );

    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'turnstile_action_mismatch');
    assert.equal(result.action, 'session_bootstrap');
  });
});
