#!/usr/bin/env node

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { UnifiedAuthMiddleware } from '../../src/middleware/unified-auth.js';
import { installNodeWebCryptoForTests } from '../utils/node-webcrypto.ts';
import { createMockLogger } from '../utils/test-helpers.ts';

installNodeWebCryptoForTests();

const originalFetch = globalThis.fetch;

async function createOidcToken(
  overrides: {
    issuer?: string;
    audience?: string;
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

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('UnifiedAuthMiddleware', () => {
  it('allows requests when no auth mechanism is configured', async () => {
    const middleware = new UnifiedAuthMiddleware({});

    const result = await middleware.authenticate(new Request('https://worker.example/mcp'));

    assert.deepEqual(result, { isAuthenticated: true });
  });

  it('authenticates a valid static bearer token', async () => {
    const middleware = new UnifiedAuthMiddleware({ staticToken: 'secret-token' });

    const result = await middleware.authenticate(
      new Request('https://worker.example/mcp', {
        headers: { authorization: 'Bearer secret-token' },
      }),
    );

    assert.equal(result.isAuthenticated, true);
    assert.deepEqual(result.payload, { sub: 'static-token-user' });
  });

  it('rejects a missing static token with a bearer challenge', async () => {
    const middleware = new UnifiedAuthMiddleware({ staticToken: 'secret-token' });

    const result = await middleware.authenticate(new Request('https://worker.example/mcp'));

    assert.equal(result.isAuthenticated, false);
    assert.deepEqual(result.error, {
      status: 401,
      message: 'Unauthorized',
      headers: { 'WWW-Authenticate': 'Bearer realm="mcp"' },
    });
  });

  it('rejects an invalid static token and logs a warning', async () => {
    const logger = createMockLogger();
    const middleware = new UnifiedAuthMiddleware({ staticToken: 'secret-token' }, logger);

    const result = await middleware.authenticate(
      new Request('https://worker.example/mcp', {
        headers: { authorization: 'Bearer wrong-token' },
      }),
    );

    assert.equal(result.isAuthenticated, false);
    assert.equal(result.error?.status, 403);
    assert.equal(logger.getLogs().warn.length, 1);
  });

  it('authenticates a valid OIDC bearer token', async () => {
    const { token, jwk } = await createOidcToken();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const middleware = new UnifiedAuthMiddleware({
      oidc: {
        issuer: 'https://issuer.example',
        audience: 'https://worker.example',
        jwksUrl: 'https://issuer.example/jwks',
      },
    });

    const result = await middleware.authenticate(
      new Request('https://worker.example/mcp', {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    assert.equal(result.isAuthenticated, true);
    assert.equal((result.payload as { sub?: string }).sub, 'user-123');
  });

  it('accepts OIDC tokens from the access_token query string', async () => {
    const { token, jwk } = await createOidcToken();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const middleware = new UnifiedAuthMiddleware({
      oidc: {
        issuer: 'https://issuer.example',
        audience: 'https://worker.example',
        jwksUrl: 'https://issuer.example/jwks',
      },
    });

    const result = await middleware.authenticate(
      new Request(`https://worker.example/mcp?access_token=${encodeURIComponent(token)}`),
    );

    assert.equal(result.isAuthenticated, true);
    assert.equal((result.payload as { sub?: string }).sub, 'user-123');
  });

  it('rejects missing OIDC tokens with an invalid_request challenge', async () => {
    const middleware = new UnifiedAuthMiddleware({
      oidc: {
        issuer: 'https://issuer.example',
        audience: 'https://worker.example',
        jwksUrl: 'https://issuer.example/jwks',
      },
    });

    const result = await middleware.authenticate(new Request('https://worker.example/mcp'));

    assert.equal(result.isAuthenticated, false);
    assert.deepEqual(result.error, {
      status: 401,
      message: 'Unauthorized',
      headers: {
        'WWW-Authenticate':
          'Bearer realm="mcp", error="invalid_request", error_description="missing_token"',
      },
    });
  });

  it('rejects invalid OIDC tokens and logs the verification failure', async () => {
    const logger = createMockLogger();
    const { jwk } = await createOidcToken();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const middleware = new UnifiedAuthMiddleware(
      {
        oidc: {
          issuer: 'https://issuer.example',
          audience: 'https://worker.example',
          jwksUrl: 'https://issuer.example/jwks',
        },
      },
      logger,
    );

    const result = await middleware.authenticate(
      new Request('https://worker.example/mcp', {
        headers: { authorization: 'Bearer not-a-jwt' },
      }),
    );

    assert.equal(result.isAuthenticated, false);
    assert.equal(result.error?.status, 403);
    assert.match(String(result.error?.headers?.['WWW-Authenticate']), /insufficient_scope/);
    assert.equal(logger.getLogs().error.length, 1);
  });
});
