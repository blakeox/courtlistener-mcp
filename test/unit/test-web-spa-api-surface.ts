#!/usr/bin/env node

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as api from '../../src/web-spa/src/lib/api.js';

interface CapturedRequest {
  url: string;
  method: string;
  csrfHeader: string | null;
  credentials?: RequestCredentials;
  body?: string | null;
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
    delete (globalThis as { window?: Window }).window;
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
        body: typeof init?.body === 'string' ? init.body : null,
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
        body: typeof init?.body === 'string' ? init.body : null,
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

  it('getUsage parses browser bootstrap analytics from the usage payload', async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          userId: 'u1',
          totalRequests: 17,
          dailyRequests: 4,
          currentDay: '2026-03-05',
          lastSeenAt: '2026-03-05T12:00:00.000Z',
          byRoute: { '/mcp': 11 },
          browserBootstrap: {
            attempted: 2,
            succeeded: 1,
            failed: 1,
            turnstileRefreshed: 3,
            lastOutcome: 'success',
            lastEventAt: '2026-03-05T11:59:00.000Z',
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const usage = await api.getUsage();

    assert.equal(usage.browserBootstrap.succeeded, 1);
    assert.equal(usage.browserBootstrap.turnstileRefreshed, 3);
    assert.equal(usage.browserBootstrap.lastOutcome, 'success');
  });

  it('getWorkerHealth parses Cloudflare worker posture from the health payload', async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'courtlistener-mcp',
          transport: 'cloudflare-mcp-v2-streamable-http',
          runtime: 'cloudflare-worker',
          version: '1.0.5',
          timestamp: new Date().toISOString(),
          diagnostics: {
            cloudflare: {
              analytics_enabled: true,
              async_queue_configured: true,
              async_jobs_kv_configured: true,
              turnstile_enforced_routes: ['session_bootstrap', 'ai_chat'],
            },
            metrics: {
              latency_ms: {
                route_latency_ms: { '/mcp': { count: 4, avg_ms: 120 } },
              },
            },
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const health = await api.getWorkerHealth();

    assert.equal(health.diagnostics.cloudflare.analytics_enabled, true);
    assert.equal(health.diagnostics.cloudflare.async_queue_configured, true);
    assert.deepEqual(health.diagnostics.cloudflare.turnstile_enforced_routes, [
      'session_bootstrap',
      'ai_chat',
    ]);
  });

  it('bootstrapSession forwards authorization and turnstile token', async () => {
    let authHeader: string | null = null;
    let turnstileHeader: string | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      authHeader = headers.get('authorization');
      turnstileHeader = headers.get('cf-turnstile-response');
      return new Response(JSON.stringify({ ok: true, userId: 'u1', expiresInSeconds: 10 }), {
        status: 200,
      });
    }) as typeof fetch;

    const response = await api.bootstrapSession({
      authorization: 'Bearer token-123',
      turnstileToken: 'turnstile-token-xyz',
    });

    assert.equal(authHeader, 'Bearer token-123');
    assert.equal(turnstileHeader, 'turnstile-token-xyz');
    assert.equal(response.ok, true);
  });

  it('bootstrapSession consumes the global turnstile token after a protected request', async () => {
    (globalThis as { window?: Window }).window = {
      __clmcpTurnstileToken: 'turnstile-token-xyz',
    } as Window;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, userId: 'u1', expiresInSeconds: 10 }), {
        status: 200,
      })) as typeof fetch;

    await api.bootstrapSession({
      authorization: 'Bearer token-123',
      turnstileToken: 'turnstile-token-xyz',
    });

    assert.equal(globalThis.window?.__clmcpTurnstileToken, undefined);
  });

  it('aiChat consumes the global turnstile token after a protected request', async () => {
    (globalThis as { window?: Window }).window = {
      __clmcpTurnstileToken: 'turnstile-token-xyz',
    } as Window;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          test_mode: false,
          fallback_used: false,
          mode: 'cheap',
          tool: 'search_cases',
          ai_response: 'resp',
          mcp_result: {},
        }),
        { status: 200 },
      )) as typeof fetch;

    await api.aiChat({
      message: 'hello',
      turnstileToken: 'turnstile-token-xyz',
    });

    assert.equal(globalThis.window?.__clmcpTurnstileToken, undefined);
  });

  it('postUiTelemetryEvent posts the allowlisted browser telemetry payload', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      captured = {
        url: String(input),
        method: init?.method || 'GET',
        csrfHeader: headers.get('x-csrf-token'),
        credentials: init?.credentials,
        body: typeof init?.body === 'string' ? init.body : null,
      };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    await api.postUiTelemetryEvent({
      name: 'browser_session_bootstrap_succeeded',
      route: '/app/account',
      outcome: 'success',
    });

    assert.ok(captured);
    assert.equal(captured.url, '/api/telemetry');
    assert.equal(captured.method, 'POST');
    assert.equal(captured.csrfHeader, 'csrf-token-123');
    assert.equal(captured.credentials, 'same-origin');
    assert.equal(
      captured.body,
      JSON.stringify({
        name: 'browser_session_bootstrap_succeeded',
        route: '/app/account',
        outcome: 'success',
      }),
    );
  });
});
