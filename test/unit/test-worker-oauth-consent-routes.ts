#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  handleWorkerOAuthConsentRoutes,
  type OAuthConsentRouteDeps,
} from '../../src/server/worker-oauth-consent-routes.js';

type TestEnv = Record<string, unknown>;

type TestOauthDetails = {
  authorization_id: string;
};

function jsonResponse(payload: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (extraHeaders) {
    const extra = new Headers(extraHeaders);
    extra.forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function jsonError(message: string, status: number, errorCode: string): Response {
  return jsonResponse({ error: message, error_code: errorCode }, status);
}

function redirectResponse(location: string, status = 302, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Location', location);
  return new Response(null, { status, headers });
}

function buildDeps(
  overrides: Partial<OAuthConsentRouteDeps<TestEnv, Record<string, unknown>, TestOauthDetails>> = {},
): OAuthConsentRouteDeps<TestEnv, Record<string, unknown>, TestOauthDetails> {
  return {
    jsonError,
    rejectDisallowedUiOrigin: () => null,
    getSupabaseSignupConfig: () => ({ enabled: true }),
    getUiSessionSecret: () => 'session-secret',
    getCookieValue: () => 'cookie-token',
    parseUiSessionToken: () => ({ jti: 'session-jti' }),
    getUiSessionUserId: async () => 'user-1',
    isUiSessionRevoked: async () => false,
    redirectResponse,
    getUiSessionSupabaseAccessToken: async () => 'supabase-access-token',
    getOAuthAuthorizationDetails: async () => ({
      type: 'details',
      details: { authorization_id: 'auth-1' },
    }),
    sanitizeExternalHttpUrl: (value) => {
      const raw = value?.trim();
      return raw ? raw : null;
    },
    getCsrfTokenFromCookie: () => 'csrf-cookie-token',
    generateRandomToken: () => 'random-token',
    generateCspNonce: () => 'nonce-1',
    buildCsrfCookie: (token) => `clmcp_csrf=${token}`,
    isSecureCookieRequest: () => true,
    htmlResponse: (html, _nonce, extraHeaders) => new Response(html, { status: 200, headers: extraHeaders }),
    renderOAuthConsentHtml: () => '<html></html>',
    clearUiSessionSupabaseAccessToken: async () => undefined,
    submitOAuthAuthorizationConsent: async () => ({ redirectUrl: 'https://client.example/callback' }),
    constantTimeEqual: (a, b) => a === b,
    ...overrides,
  };
}

describe('handleWorkerOAuthConsentRoutes', () => {
  it('redirects unauthenticated users to login preserving next path', async () => {
    const request = new Request('https://example.com/oauth/consent?authorization_id=auth-1', {
      method: 'GET',
    });

    const response = await handleWorkerOAuthConsentRoutes(
      {
        request,
        url: new URL(request.url),
        origin: 'https://example.com',
        allowedOrigins: ['https://example.com'],
        env: {},
      },
      buildDeps({ parseUiSessionToken: () => null }),
    );

    assert.ok(response);
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('Location'),
      'https://example.com/app/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dauth-1',
    );
  });

  it('rejects POST /oauth/consent when CSRF tokens do not match', async () => {
    const form = new URLSearchParams({
      authorization_id: 'auth-1',
      decision: 'approve',
      csrf_token: 'different-token',
    });
    const request = new Request('https://example.com/oauth/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    const response = await handleWorkerOAuthConsentRoutes(
      {
        request,
        url: new URL(request.url),
        origin: 'https://example.com',
        allowedOrigins: ['https://example.com'],
        env: {},
      },
      buildDeps({ getCsrfTokenFromCookie: () => 'cookie-token' }),
    );

    assert.ok(response);
    assert.equal(response.status, 403);
    const payload = (await response.json()) as { error_code?: string };
    assert.equal(payload.error_code, 'csrf_validation_failed');
  });
});
