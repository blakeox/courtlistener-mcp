#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

let worker: {
  default: {
    fetch: (
      request: Request,
      env: Record<string, unknown>,
      ctx: unknown,
    ) => Promise<Response>;
  };
} | null = null;

try {
  worker = (await import('../../dist/worker.js')) as unknown as typeof worker;
} catch {
  worker = null;
}

function buildApiRequest(
  path: string,
  payload: Record<string, unknown>,
): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-test-token',
      cookie: 'clmcp_csrf=csrf-test-token',
    },
    body: JSON.stringify(payload),
  });
}

describe('worker password reset API', () => {
  if (!worker) {
    it('skips in Node runtime without cloudflare:* loader support', { skip: true }, () => {});
    return;
  }

  it('accepts forgot-password request and calls Supabase recover endpoint', async () => {
    const originalFetch = globalThis.fetch;
    let sawRecoverCall = false;
    let observedBody = '';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/recover')) {
        sawRecoverCall = true;
        observedBody = String(init?.body || '');
        return new Response('{}', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    try {
      const response = await worker.default.fetch(
        buildApiRequest('/api/password/forgot', { email: 'USER@EXAMPLE.COM' }),
        {
          MCP_OBJECT: {},
          MCP_UI_RATE_LIMIT_ENABLED: 'false',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_PUBLISHABLE_KEY: 'anon-key',
        },
        {},
      );

      assert.equal(response.status, 202);
      const payload = (await response.json()) as { message?: string };
      assert.match(String(payload.message), /reset instructions/i);
      assert.equal(sawRecoverCall, true);

      const recoverPayload = JSON.parse(observedBody) as { email?: string; redirect_to?: string };
      assert.equal(recoverPayload.email, 'user@example.com');
      assert.equal(recoverPayload.redirect_to, 'https://example.com/app/reset-password');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('accepts reset-password request with recovery token and new password', async () => {
    const originalFetch = globalThis.fetch;
    let sawResetCall = false;
    let observedAuth = '';
    let observedBody = '';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) {
        sawResetCall = true;
        observedAuth = new Headers(init?.headers).get('Authorization') || '';
        observedBody = String(init?.body || '');
        return new Response('{}', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    try {
      const response = await worker.default.fetch(
        buildApiRequest('/api/password/reset', {
          accessToken: 'recovery-token',
          password: 'NewPassword123',
        }),
        {
          MCP_OBJECT: {},
          MCP_UI_RATE_LIMIT_ENABLED: 'false',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_PUBLISHABLE_KEY: 'anon-key',
        },
        {},
      );

      assert.equal(response.status, 200);
      const payload = (await response.json()) as { message?: string };
      assert.match(String(payload.message), /password has been reset/i);
      assert.equal(sawResetCall, true);
      assert.equal(observedAuth, 'Bearer recovery-token');
      const resetPayload = JSON.parse(observedBody) as { password?: string };
      assert.equal(resetPayload.password, 'NewPassword123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns invalid_recovery_token when upstream reset fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ message: 'token_expired' }), { status: 401 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    try {
      const response = await worker.default.fetch(
        buildApiRequest('/api/password/reset', {
          accessToken: 'expired-token',
          password: 'NewPassword123',
        }),
        {
          MCP_OBJECT: {},
          MCP_UI_RATE_LIMIT_ENABLED: 'false',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_PUBLISHABLE_KEY: 'anon-key',
        },
        {},
      );

      assert.equal(response.status, 401);
      const payload = (await response.json()) as { error_code?: string };
      assert.equal(payload.error_code, 'invalid_recovery_token');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('accepts reset-password request with tokenHash and exchanges before update', async () => {
    const originalFetch = globalThis.fetch;
    let sawVerifyCall = false;
    let sawResetCall = false;
    let observedVerifyBody = '';
    let observedResetAuth = '';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/verify')) {
        sawVerifyCall = true;
        observedVerifyBody = String(init?.body || '');
        return new Response(
          JSON.stringify({
            access_token: 'access-token-from-hash',
            user: { id: 'u1' },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/auth/v1/user')) {
        sawResetCall = true;
        observedResetAuth = new Headers(init?.headers).get('Authorization') || '';
        return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    try {
      const response = await worker.default.fetch(
        buildApiRequest('/api/password/reset', {
          tokenHash: 'recovery-token-hash',
          password: 'NewPassword123',
        }),
        {
          MCP_OBJECT: {},
          MCP_UI_RATE_LIMIT_ENABLED: 'false',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_PUBLISHABLE_KEY: 'anon-key',
        },
        {},
      );

      assert.equal(response.status, 200);
      assert.equal(sawVerifyCall, true);
      assert.equal(sawResetCall, true);
      assert.equal(observedResetAuth, 'Bearer access-token-from-hash');
      const verifyPayload = JSON.parse(observedVerifyBody) as { type?: string; token_hash?: string };
      assert.equal(verifyPayload.type, 'recovery');
      assert.equal(verifyPayload.token_hash, 'recovery-token-hash');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
