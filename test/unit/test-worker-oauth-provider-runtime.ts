#!/usr/bin/env node

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import {
  createRegistrationAccessToken,
  verifyRegistrationAccessToken,
} from '../../src/server/worker-oauth-registration-token.js';
import { mergeHostedAiClientOrigins } from '../../src/server/oauth-client-origins.js';
import {
  buildOAuthProviderErrorResponse,
  getRegistrationAllowedOrigins,
  handleOAuthProviderApiRequest,
  handleOAuthProviderDefaultRequest,
  isOAuthProtectedApiPath,
  resolveExternalOAuthToken,
  withRegistrationCors,
} from '../../src/server/worker-oauth-provider-runtime-helpers.js';
import { installNodeWebCryptoForTests } from '../utils/node-webcrypto.ts';

installNodeWebCryptoForTests();

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function createOidcToken(
  overrides: {
    issuer?: string;
    audience?: string | string[];
    subject?: string;
    kid?: string;
  } = {},
): Promise<{
  token: string;
  jwk: Record<string, unknown>;
}> {
  const issuer = overrides.issuer ?? 'https://issuer.example';
  const audience = overrides.audience ?? 'https://worker.example';
  const subject = overrides.subject ?? 'user-123';
  const kid = overrides.kid ?? 'kid-1';

  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = kid;

  const token = await new SignJWT({ scope: 'openid profile email' })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime('5m')
    .sign(privateKey);

  return { token, jwk };
}

describe('OAuth client origins', () => {
  it('adds hosted AI client origins to registration CORS defaults', () => {
    const origins = mergeHostedAiClientOrigins(['https://auth.courtlistenermcp.blakeoxford.com']);

    assert.deepEqual(origins, [
      'https://auth.courtlistenermcp.blakeoxford.com',
      'https://chatgpt.com',
      'https://chat.openai.com',
      'https://claude.ai',
      'https://claude.com',
    ]);
  });

  it('preserves wildcard registrations unchanged', () => {
    const origins = mergeHostedAiClientOrigins(['*']);

    assert.deepEqual(origins, ['*']);
  });
});

describe('registration access tokens', () => {
  it('creates expiring versioned registration tokens and verifies them', async () => {
    const env = {
      MCP_OAUTH_REGISTRATION_TOKEN_SECRET: 'registration-secret',
      MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS: '60',
    };

    const token = await createRegistrationAccessToken(env, 'client-123');
    assert.match(String(token), /^clreg\.v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(await verifyRegistrationAccessToken(env, 'client-123', String(token)), true);
    assert.equal(await verifyRegistrationAccessToken(env, 'client-999', String(token)), false);
  });

  it('rejects expired registration tokens', async () => {
    const originalNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      const env = {
        MCP_OAUTH_REGISTRATION_TOKEN_SECRET: 'registration-secret',
        MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS: '1',
      };

      const token = await createRegistrationAccessToken(env, 'client-123');
      Date.now = () => 1_700_000_010_000;
      assert.equal(await verifyRegistrationAccessToken(env, 'client-123', String(token)), false);
    } finally {
      Date.now = originalNow;
    }
  });
});

describe('worker OAuth provider runtime', () => {
  it('recognizes protected MCP API paths', () => {
    assert.equal(isOAuthProtectedApiPath('/mcp'), true);
    assert.equal(isOAuthProtectedApiPath('/sse'), true);
    assert.equal(isOAuthProtectedApiPath('/api/usage'), true);
    assert.equal(isOAuthProtectedApiPath('/health'), false);
  });

  it('rejects unauthenticated API fallthrough instead of forwarding to legacy MCP', async () => {
    let legacyCalled = false;
    const response = await handleOAuthProviderDefaultRequest(
      new Request('https://worker.example/mcp'),
      {},
      {} as ExecutionContext,
      {
        handleAuthorizeRoute: async () => new Response('authorize'),
        handleLegacyWorkerFetch: async () => {
          legacyCalled = true;
          return new Response('legacy');
        },
      },
    );

    assert.equal(response.status, 401);
    assert.equal(legacyCalled, false);
    assert.match(response.headers.get('www-authenticate') ?? '', /oauth-protected-resource/);
  });

  it('derives registration allowed origins from configured origins', () => {
    const origins = getRegistrationAllowedOrigins(
      { MCP_ALLOWED_ORIGINS: 'https://auth.example, https://console.example' },
      {
        getCachedAllowedOrigins: (raw) =>
          raw
            ?.split(',')
            .map((value) => value.trim())
            .filter(Boolean) ?? [],
      },
    );

    assert.deepEqual(origins, [
      'https://auth.example',
      'https://console.example',
      'https://chatgpt.com',
      'https://chat.openai.com',
      'https://claude.ai',
      'https://claude.com',
    ]);
  });

  it('applies registration CORS headers without dropping response headers', () => {
    const response = withRegistrationCors(
      new Response('ok', {
        status: 201,
        headers: { 'content-type': 'text/plain' },
      }),
      new Request('https://worker.example/register', {
        headers: { origin: 'https://chatgpt.com' },
      }),
      { MCP_ALLOWED_ORIGINS: 'https://auth.example' },
      {
        getRequestOrigin: (request) => request.headers.get('origin'),
        getCachedAllowedOrigins: () => ['https://auth.example'],
        buildCorsHeaders: (origin, allowedOrigins) => {
          let allowOrigin = 'null';
          if (origin) {
            try {
              const normalizedOrigin = new URL(origin).origin;
              const isAllowed = allowedOrigins.some((allowed) => {
                try {
                  return new URL(allowed).origin === normalizedOrigin;
                } catch {
                  return false;
                }
              });
              if (isAllowed) {
                allowOrigin = normalizedOrigin;
              }
            } catch {
              // ignore invalid origin values in tests
            }
          }
          return new Headers({
            'access-control-allow-origin': allowOrigin,
            vary: 'Origin',
          });
        },
      },
    );

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('content-type'), 'text/plain');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://chatgpt.com');
    assert.equal(response.headers.get('vary'), 'Origin');
  });

  it('rejects the provider fast path without a prevalidated OAuth identity', async () => {
    const response = await handleOAuthProviderApiRequest(
      new Request('https://worker.example/mcp', {
        headers: { authorization: 'Bearer token' },
      }),
      {},
      {} as ExecutionContext,
      {
        handleLegacyWorkerFetch: async () => new Response('legacy'),
      },
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: 'invalid_prevalidated_oauth_context',
      message: 'Validated OAuth context is required for the internal provider fast path.',
    });
  });

  it('forwards provider-authenticated requests with the bearer token for MCP defense in depth', async () => {
    let forwardedAuthorization: string | null = null;
    let forwardedOptions: { skipGatewayAuth?: boolean } | undefined;

    const response = await handleOAuthProviderApiRequest(
      new Request('https://worker.example/mcp', {
        headers: { authorization: 'Bearer token' },
      }),
      {},
      {
        props: {
          userId: 'user-123',
          authMethod: 'service',
        },
      } as ExecutionContext,
      {
        handleLegacyWorkerFetch: async (request, _env, _ctx, options) => {
          forwardedAuthorization = request.headers.get('authorization');
          forwardedOptions = options;
          return new Response('legacy-ok');
        },
      },
    );

    assert.equal(await response.text(), 'legacy-ok');
    assert.equal(forwardedAuthorization, 'Bearer token');
    assert.deepEqual(forwardedOptions, { skipGatewayAuth: true });
  });

  it('routes authorize requests to the dedicated authorize handler when OAuth helpers exist', async () => {
    let authorizeCalls = 0;
    const legacyCalls = 0;

    const response = await handleOAuthProviderDefaultRequest(
      new Request('https://worker.example/authorize'),
      { OAUTH_PROVIDER: {} as OAuthHelpers },
      {} as ExecutionContext,
      {
        handleAuthorizeRoute: async () => {
          authorizeCalls += 1;
          return new Response('authorize-ok');
        },
        handleLegacyWorkerFetch: async () => new Response('legacy'),
      },
    );

    assert.equal(await response.text(), 'authorize-ok');
    assert.equal(authorizeCalls, 1);
    assert.equal(legacyCalls, 0);
  });

  it('adds resource metadata links to auth challenges relative to the current request origin', () => {
    const response = buildOAuthProviderErrorResponse({
      code: 'insufficient_scope',
      description: 'missing required scope',
      status: 403,
      headers: {},
      currentRequestOrigin: 'https://custom.worker.example',
      baseOrigin: 'https://fallback.worker.example',
    });

    assert.equal(response.status, 403);
    assert.equal(
      response.headers.get('WWW-Authenticate'),
      'Bearer resource_metadata="https://custom.worker.example/.well-known/oauth-protected-resource"',
    );
    assert.equal(
      response.headers.get('Link'),
      '<https://custom.worker.example/.well-known/oauth-protected-resource>; rel="oauth-protected-resource"',
    );
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  it('verifies external OIDC tokens into provider props', async () => {
    const { token, jwk } = await createOidcToken({
      audience: ['https://worker.example', 'https://api.example'],
    });
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const result = await resolveExternalOAuthToken(token, {
      OIDC_ISSUER: 'https://issuer.example',
      OIDC_AUDIENCE: 'https://worker.example',
      OIDC_JWKS_URL: 'https://issuer.example/jwks',
    });

    assert.deepEqual(result, {
      props: {
        userId: 'user-123',
        authMethod: 'oidc',
        source: 'external_oidc',
      },
      audience: ['https://worker.example', 'https://api.example'],
    });
  });
});
