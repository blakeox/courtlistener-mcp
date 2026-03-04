#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseAuthConfig } from '../../src/server/supabase-auth.js';
import {
  handleUiKeysRoutes,
  type HandleUiKeysRoutesDeps,
} from '../../src/server/worker-ui-keys-route.js';

type TestEnv = Record<string, unknown>;

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

function buildDeps(overrides: Partial<HandleUiKeysRoutesDeps<TestEnv>> = {}): HandleUiKeysRoutesDeps<TestEnv> {
  return {
    rejectDisallowedUiOrigin: () => null,
    applyUiRateLimit: async () => null,
    authenticateUiApiRequest: async () => ({ userId: 'user-1', authType: 'api_key' }),
    getSupabaseManagementConfig: () =>
      ({
        url: 'https://example.supabase.co',
        serviceRoleKey: 'secret',
        apiKeysTable: 'mcp_api_keys',
      }) satisfies SupabaseAuthConfig,
    listApiKeysForUser: async () => [{ id: 'key-1' }],
    requireCsrfToken: () => null,
    parseJsonBody: async <T>(request: Request) => (await request.json()) as T,
    getApiKeyMaxTtlDays: () => 90,
    getCappedExpiresAtFromDays: () => null,
    createApiKeyForUser: async () => ({
      key: {
        id: 'key-1',
        label: 'rotation',
        created_at: '2024-01-01T00:00:00.000Z',
        expires_at: null,
      },
      token: 'token-1',
    }),
    revokeApiKeyForUser: async () => true,
    logAuditEvent: async () => undefined,
    logWorkerWarning: () => undefined,
    getRequestIp: () => '127.0.0.1',
    jsonError,
    jsonResponse,
    ...overrides,
  };
}

describe('handleUiKeysRoutes', () => {
  it('returns keys list response shape for GET /api/keys', async () => {
    const request = new Request('https://example.com/api/keys', { method: 'GET' });
    const response = await handleUiKeysRoutes({
      request,
      url: new URL(request.url),
      origin: 'https://example.com',
      allowedOrigins: ['https://example.com'],
      env: {},
      deps: buildDeps(),
    });

    assert.ok(response);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { user_id?: string; keys?: unknown[] };
    assert.equal(payload.user_id, 'user-1');
    assert.deepEqual(payload.keys, [{ id: 'key-1' }]);
  });

  it('enforces CSRF for session auth on POST /api/keys', async () => {
    const csrfResponse = jsonError('CSRF token validation failed.', 403, 'csrf_validation_failed');
    const deps = buildDeps({
      authenticateUiApiRequest: async () => ({ userId: 'session-user', authType: 'session' }),
      requireCsrfToken: () => csrfResponse,
    });
    const request = new Request('https://example.com/api/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'rotation' }),
    });

    const response = await handleUiKeysRoutes({
      request,
      url: new URL(request.url),
      origin: 'https://example.com',
      allowedOrigins: ['https://example.com'],
      env: {},
      deps,
    });

    assert.equal(response, csrfResponse);
  });

  it('logs audit event and returns success shape for POST /api/keys/revoke', async () => {
    let auditAction = '';
    const request = new Request('https://example.com/api/keys/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyId: 'key-1' }),
    });
    const response = await handleUiKeysRoutes({
      request,
      url: new URL(request.url),
      origin: 'https://example.com',
      allowedOrigins: ['https://example.com'],
      env: {},
      deps: buildDeps({
        authenticateUiApiRequest: async () => ({ userId: 'session-user', authType: 'session' }),
        logAuditEvent: async (_config, event) => {
          auditAction = event.action;
        },
      }),
    });

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.equal(auditAction, 'keys.revoked');
    const payload = (await response.json()) as { message?: string };
    assert.equal(payload.message, 'Key revoked.');
  });
});
