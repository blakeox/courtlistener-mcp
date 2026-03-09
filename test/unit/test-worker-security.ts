#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  authorizeMcpRequest,
  authorizeMcpRequestWithPrincipal,
  isAllowedOrigin,
  parseAllowedOrigins,
  validateProtocolHeaderNegotiation,
  validateProtocolVersionHeader,
} from '../../src/server/worker-security.js';
import { SUPPORTED_MCP_PROTOCOL_VERSIONS } from '../../src/infrastructure/protocol-constants.js';
import {
  runAuthFailureContract,
  runProtocolHeaderNegotiationContract,
} from '../utils/mcp-contract-harness.js';

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
  const supported = new Set(SUPPORTED_MCP_PROTOCOL_VERSIONS);
  it('matches protocol negotiation contract', async () => {
    await runProtocolHeaderNegotiationContract(
      { supportedVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS[0] },
      async (fixture) => validateProtocolVersionHeader(fixture.headerValue, fixture.required, supported),
    );
  });

  it('returns profile fallback diagnostics for unsupported capability profiles on legacy protocol', () => {
    const result = validateProtocolHeaderNegotiation('2024-11-05', 'async', false, supported);
    assert.equal(result.error, null);
    assert.equal(result.diagnostics.accepted, true);
    assert.equal(result.diagnostics.reason, 'profile_fallback');
    assert.equal(result.diagnostics.acceptedCapabilityProfile, 'extended');
    assert.equal(result.diagnostics.profileReason, 'fallback_unsupported_profile');
  });
});

describe('worker-security auth', () => {
  it('allows request when no auth is configured', async () => {
    const res = await authorizeMcpRequest(req(), {});
    assert.equal(res, null);
  });

  it('does not accept MCP_AUTH_TOKEN as a public bearer token', async () => {
    await runAuthFailureContract(
      [
        { name: 'missing token', expectedStatus: 401, expectedError: 'invalid_token' },
        { name: 'wrong token', expectedStatus: 401, expectedError: 'invalid_token' },
      ],
      async (failure) =>
        authorizeMcpRequest(
          failure.name === 'wrong token' ? req({ Authorization: 'Bearer wrong' }) : req(),
          { MCP_AUTH_TOKEN: 'secret' },
        ),
    );
  });

  it('includes OAuth discovery challenge headers on 401 auth failures', async () => {
    const res = await authorizeMcpRequest(req(), { MCP_AUTH_TOKEN: 'secret' });
    assert.ok(res);
    assert.equal(res.status, 401);
    const challenge = res.headers.get('www-authenticate') ?? '';
    assert.match(challenge, /^Bearer resource_metadata="https:\/\/example\.workers\.dev\/\.well-known\/oauth-protected-resource"$/);
    const link = res.headers.get('link') ?? '';
    assert.match(link, /rel="oauth-protected-resource"/);
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

  it('returns OIDC principal userId when available', async () => {
    const result = await authorizeMcpRequestWithPrincipal(
      req({ Authorization: 'Bearer jwt-token' }),
      { OIDC_ISSUER: 'https://issuer.example.com' },
      {
        verifyAccessTokenFn: async () => ({ payload: { sub: 'user-123' } }),
      },
    );
    assert.equal(result.authError, null);
    assert.equal(result.principal?.authMethod, 'oidc');
    assert.equal(result.principal?.userId, 'user-123');
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
    const challenge = res.headers.get('www-authenticate') ?? '';
    assert.match(challenge, /error="insufficient_scope"/);
    assert.match(challenge, /scope="legal:read legal:search legal:analyze"/);
  });

  it('does not fall back to MCP_AUTH_TOKEN bearer auth when OIDC verification fails', async () => {
    const res = await authorizeMcpRequest(
      req({ Authorization: 'Bearer fallback-secret' }),
      {
        OIDC_ISSUER: 'https://issuer.example.com',
        MCP_AUTH_TOKEN: 'fallback-secret',
      },
      {
        verifyAccessTokenFn: async () => {
          throw new Error('jwt_invalid');
        },
      },
    );
    assert.ok(res);
    assert.equal(res.status, 401);
  });

  it('supports oauth primary alias for OIDC verification compatibility', async () => {
    const res = await authorizeMcpRequest(
      req({ Authorization: 'Bearer oauth-token' }),
      {
        OIDC_ISSUER: 'https://issuer.example.com',
      },
      {
        verifyAccessTokenFn: async () => ({ payload: { sub: 'user-oauth' } }),
      },
    );
    assert.equal(res, null);
  });

  it('prioritizes internal service-token header over OIDC primary', async () => {
    const result = await authorizeMcpRequestWithPrincipal(
      req({
        Authorization: 'Bearer not-a-valid-jwt',
        'x-mcp-service-token': 'edge-service-secret',
      }),
      {
        OIDC_ISSUER: 'https://issuer.example.com',
        MCP_AUTH_TOKEN: 'edge-service-secret',
      },
      {
        verifyAccessTokenFn: async () => {
          throw new Error('jwt_invalid');
        },
      },
    );
    assert.equal(result.authError, null);
    assert.equal(result.principal?.authMethod, 'service');
  });

  it('fails closed when a service-token header is present but invalid', async () => {
    const result = await authorizeMcpRequestWithPrincipal(
      req({
        Authorization: 'Bearer jwt-token',
        'x-mcp-service-token': 'wrong-service-secret',
      }),
      {
        OIDC_ISSUER: 'https://issuer.example.com',
        MCP_AUTH_TOKEN: 'edge-service-secret',
      },
    );
    assert.ok(result.authError);
    assert.equal(result.authError?.status, 401);
  });

  it('accepts valid service-token header when OIDC is not configured', async () => {
    const result = await authorizeMcpRequestWithPrincipal(
      req({
        'x-mcp-service-token': 'edge-service-secret',
      }),
      {
        MCP_AUTH_TOKEN: 'edge-service-secret',
      },
    );
    assert.equal(result.authError, null);
    assert.equal(result.principal?.authMethod, 'service');
  });

  it('requires Authorization bearer token for OIDC auth', async () => {
    const res = await authorizeMcpRequest(
      req({}),
      {
        OIDC_ISSUER: 'https://issuer.example.com',
      },
    );
    assert.ok(res);
    assert.equal(res.status, 401);
  });
});
