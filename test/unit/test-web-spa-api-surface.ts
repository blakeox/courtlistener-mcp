#!/usr/bin/env node

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as api from '../../src/web-spa/src/lib/api.js';

interface CapturedRequest {
  url: string;
  method: string;
  csrfHeader: string | null;
  credentials?: RequestCredentials;
}

describe('web-spa api surface', () => {
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

  it('does not export removed browser-form auth helpers', () => {
    assert.equal('login' in api, false);
    assert.equal('loginByAccessToken' in api, false);
    assert.equal('signup' in api, false);
    assert.equal('requestPasswordReset' in api, false);
    assert.equal('resetPassword' in api, false);
  });

  it('getSession uses the current session endpoint without CSRF header', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      captured = {
        url: String(input),
        method: init?.method || 'GET',
        csrfHeader: headers.get('x-csrf-token'),
        credentials: init?.credentials,
      };
      return new Response(
        JSON.stringify({
          authenticated: true,
          user: { id: 'u1' },
          turnstile_site_key: '',
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const session = await api.getSession();

    assert.ok(captured);
    assert.equal(captured.url, '/api/session');
    assert.equal(captured.method, 'GET');
    assert.equal(captured.csrfHeader, null);
    assert.equal(captured.credentials, 'same-origin');
    assert.equal(session.authenticated, true);
    assert.equal(session.user?.id, 'u1');
  });

  it('logout posts to the hosted-auth session endpoint with CSRF header', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      captured = {
        url: String(input),
        method: init?.method || 'GET',
        csrfHeader: headers.get('x-csrf-token'),
        credentials: init?.credentials,
      };
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await api.logout();

    assert.ok(captured);
    assert.equal(captured.url, '/api/logout');
    assert.equal(captured.method, 'POST');
    assert.equal(captured.csrfHeader, 'csrf-token-123');
    assert.equal(captured.credentials, 'same-origin');
  });
});
