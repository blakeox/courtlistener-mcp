#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  authorizeMcpRequest,
  isAllowedOrigin,
  parseAllowedOrigins,
  validateProtocolVersionHeader,
} from '../../src/server/worker-security.js';

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.workers.dev/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
  });
}

describe('worker-security origin helpers', () => {
  it('allows any origin when allow-list is empty', () => {
    assert.equal(isAllowedOrigin('https://a.example', []), true);
  });

  it('enforces explicit allow-list', () => {
    const allowed = parseAllowedOrigins('https://a.example,https://b.example');
    assert.equal(isAllowedOrigin('https://a.example', allowed), true);
    assert.equal(isAllowedOrigin('https://x.example', allowed), false);
  });
});

describe('worker-security protocol header validation', () => {
  const supported = new Set(['2024-11-05']);

  it('requires header when strict mode is enabled', () => {
    const res = validateProtocolVersionHeader(null, true, supported);
    assert.ok(res);
    assert.equal(res.status, 400);
  });

  it('rejects unsupported protocol versions', () => {
    const res = validateProtocolVersionHeader('2099-01-01', false, supported);
    assert.ok(res);
    assert.equal(res.status, 400);
  });

  it('accepts supported versions', () => {
    const res = validateProtocolVersionHeader('2024-11-05', true, supported);
    assert.equal(res, null);
  });
});

describe('worker-security auth', () => {
  it('allows request when no auth is configured', async () => {
    const res = await authorizeMcpRequest(req(), {});
    assert.equal(res, null);
  });

  it('enforces static bearer token', async () => {
    const missing = await authorizeMcpRequest(req(), { MCP_AUTH_TOKEN: 'secret' });
    assert.ok(missing);
    assert.equal(missing.status, 401);

    const ok = await authorizeMcpRequest(req({ Authorization: 'Bearer secret' }), {
      MCP_AUTH_TOKEN: 'secret',
    });
    assert.equal(ok, null);
  });

  it('accepts valid OIDC bearer token', async () => {
    const res = await authorizeMcpRequest(
      req({ Authorization: 'Bearer jwt-token' }),
      { OIDC_ISSUER: 'https://issuer.example.com' },
      {
        verifyAccessTokenFn: async () => ({ payload: { sub: 'user-1' } }),
      },
    );
    assert.equal(res, null);
  });

  it('accepts valid Cloudflare Access assertion token', async () => {
    const res = await authorizeMcpRequest(
      req({ 'CF-Access-Jwt-Assertion': 'cf-access-jwt' }),
      { OIDC_ISSUER: 'https://issuer.example.com' },
      {
        verifyAccessTokenFn: async () => ({ payload: { sub: 'user-2' } }),
      },
    );
    assert.equal(res, null);
  });

  it('tries Cloudflare Access assertion when bearer token fails verification', async () => {
    const res = await authorizeMcpRequest(
      req({
        Authorization: 'Bearer invalid-jwt',
        'CF-Access-Jwt-Assertion': 'valid-access-jwt',
      }),
      { OIDC_ISSUER: 'https://issuer.example.com' },
      {
        verifyAccessTokenFn: async (token) => {
          if (token === 'valid-access-jwt') {
            return { payload: { sub: 'user-3' } };
          }
          throw new Error('jwt_invalid');
        },
      },
    );
    assert.equal(res, null);
  });

  it('returns 403 for insufficient scope', async () => {
    const res = await authorizeMcpRequest(
      req({ Authorization: 'Bearer jwt-token' }),
      {
        OIDC_ISSUER: 'https://issuer.example.com',
        OIDC_REQUIRED_SCOPE: 'mcp:connect',
      },
      {
        verifyAccessTokenFn: async () => {
          throw new Error('insufficient_scope');
        },
      },
    );
    assert.ok(res);
    assert.equal(res.status, 403);
  });

  it('falls back to static token when OIDC token verification fails', async () => {
    const res = await authorizeMcpRequest(
      req({ Authorization: 'Bearer fallback-secret' }),
      {
        OIDC_ISSUER: 'https://issuer.example.com',
        MCP_AUTH_TOKEN: 'fallback-secret',
        MCP_ALLOW_STATIC_FALLBACK: 'true',
      },
      {
        verifyAccessTokenFn: async () => {
          throw new Error('jwt_invalid');
        },
      },
    );
    assert.equal(res, null);
  });

  it('accepts valid Supabase API key when configured', async () => {
    const res = await authorizeMcpRequest(
      req({ Authorization: 'Bearer sb-valid-key' }),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      },
      {
        verifySupabaseApiKeyFn: async (token) => token === 'sb-valid-key',
      },
    );
    assert.equal(res, null);
  });

  it('rejects invalid Supabase API key when static fallback is not configured', async () => {
    const res = await authorizeMcpRequest(
      req({ Authorization: 'Bearer sb-invalid-key' }),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      },
      {
        verifySupabaseApiKeyFn: async () => false,
      },
    );
    assert.ok(res);
    assert.equal(res.status, 401);
  });

  it('falls back to static token when Supabase rejects key', async () => {
    const res = await authorizeMcpRequest(
      req({ Authorization: 'Bearer static-fallback' }),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        MCP_AUTH_TOKEN: 'static-fallback',
        MCP_ALLOW_STATIC_FALLBACK: 'true',
      },
      {
        verifySupabaseApiKeyFn: async () => false,
      },
    );
    assert.equal(res, null);
  });

  it('prefers supabase auth and blocks static fallback by default', async () => {
    const res = await authorizeMcpRequest(
      req({ Authorization: 'Bearer static-fallback' }),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        MCP_AUTH_TOKEN: 'static-fallback',
      },
      {
        verifySupabaseApiKeyFn: async () => false,
      },
    );
    assert.ok(res);
    assert.equal(res.status, 401);
  });

  it('supports explicit static primary auth when configured', async () => {
    const res = await authorizeMcpRequest(
      req({ Authorization: 'Bearer static-primary' }),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        MCP_AUTH_TOKEN: 'static-primary',
        MCP_AUTH_PRIMARY: 'static',
      },
      {
        verifySupabaseApiKeyFn: async () => false,
      },
    );
    assert.equal(res, null);
  });

  it('requires Authorization bearer token for Supabase auth', async () => {
    const res = await authorizeMcpRequest(
      req({}),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      },
      {
        verifySupabaseApiKeyFn: async () => true,
      },
    );
    assert.ok(res);
    assert.equal(res.status, 401);
  });
});
