#!/usr/bin/env node

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { requestPasswordReset, resetPassword } from '../../src/web-spa/src/lib/api.js';

interface CapturedRequest {
  url: string;
  method: string;
  body: string;
  csrfHeader: string | null;
  credentials?: RequestCredentials;
}

describe('web-spa api password reset', () => {
  const originalDocument = (globalThis as Record<string, unknown>).document;
  const originalFetch = globalThis.fetch;
  let captured: CapturedRequest | null = null;

  beforeEach(() => {
    captured = null;
    (globalThis as unknown as { document: { cookie: string } }).document = {
      cookie: 'clmcp_csrf=csrf-token-123',
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalDocument) {
      (globalThis as Record<string, unknown>).document = originalDocument;
    } else {
      delete (globalThis as Record<string, unknown>).document;
    }
  });

  it('requestPasswordReset posts to /api/password/forgot with csrf header', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      captured = {
        url: String(input),
        method: init?.method || 'GET',
        body: String(init?.body || ''),
        csrfHeader: headers.get('x-csrf-token'),
        credentials: init?.credentials,
      };
      return new Response(
        JSON.stringify({
          message: 'If the request can be processed, check your email for password reset instructions.',
        }),
        { status: 202 },
      );
    }) as typeof fetch;

    const result = await requestPasswordReset({ email: 'user@example.com' });

    assert.ok(captured);
    assert.equal(captured.url, '/api/password/forgot');
    assert.equal(captured.method, 'POST');
    assert.equal(captured.csrfHeader, 'csrf-token-123');
    assert.equal(captured.credentials, 'same-origin');
    assert.equal(JSON.parse(captured.body).email, 'user@example.com');
    assert.match(String(result.message), /reset instructions/i);
  });

  it('resetPassword posts to /api/password/reset with token and password', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      captured = {
        url: String(input),
        method: init?.method || 'GET',
        body: String(init?.body || ''),
        csrfHeader: headers.get('x-csrf-token'),
        credentials: init?.credentials,
      };
      return new Response(
        JSON.stringify({
          message: 'Password has been reset. You can now log in.',
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await resetPassword({
      accessToken: 'recovery-token',
      password: 'NewPassword123',
    });

    assert.ok(captured);
    assert.equal(captured.url, '/api/password/reset');
    assert.equal(captured.method, 'POST');
    assert.equal(captured.csrfHeader, 'csrf-token-123');
    assert.equal(captured.credentials, 'same-origin');
    const parsed = JSON.parse(captured.body) as { accessToken?: string; password?: string };
    assert.equal(parsed.accessToken, 'recovery-token');
    assert.equal(parsed.password, 'NewPassword123');
    assert.match(String(result.message), /password has been reset/i);
  });
});
