#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for OIDC Token Verification (TypeScript)
 * Tests OIDC discovery, token verification, and scope validation
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { verifyAccessToken } = await import('../../dist/security/oidc.js');

interface FetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<FetchResponse>;

interface OIDCConfig {
  issuer: string;
  requiredScope?: string;
}

interface JWTVerifyResult {
  payload: {
    sub: string;
    scope?: string;
    scp?: string[];
  };
}

interface OIDCDeps {
  importJWK?: () => Promise<unknown>;
  jwtVerify?: (token: string, jwks: unknown) => Promise<JWTVerifyResult>;
}

function makeFetchSequence(
  responses: Array<{ status: number; json: unknown; matchUrl?: string }>,
): { fetcher: Fetcher; calls: string[] } {
  const calls: string[] = [];
  let cursor = 0;

  return {
    fetcher: async (url: string): Promise<FetchResponse> => {
      calls.push(url);
      const current = responses[cursor];
      cursor += 1;
      assert.ok(current, `Unexpected fetch call for ${url}`);
      if (current.matchUrl) {
        assert.equal(url, current.matchUrl);
      }
      return {
        ok: current.status >= 200 && current.status < 300,
        status: current.status,
        json: async () => current.json,
      };
    },
    calls,
  };
}

function makeToken(header: Record<string, unknown> = { alg: 'RS256', kid: 'kid-1' }): string {
  const payload = { sub: 'test-user' };
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.signature`;
}

describe('OIDC verification (TypeScript)', () => {
  it('fails discovery with HTTP error', async () => {
    const { fetcher } = makeFetchSequence([{ status: 404, json: {} }]);
    await assert.rejects(
      () =>
        verifyAccessToken(
          't',
          { issuer: 'https://issuer-discovery-error' } as OIDCConfig,
          fetcher
        ),
      /OIDC discovery failed \(404\) for issuer https:\/\/issuer-discovery-error/
    );
  });

  it('fails discovery when jwks_uri missing', async () => {
    const { fetcher } = makeFetchSequence([{ status: 200, json: {} }]);
    await assert.rejects(
      () =>
        verifyAccessToken(
          't',
          { issuer: 'https://issuer-missing-jwks' } as OIDCConfig,
          fetcher
        ),
      /OIDC discovery missing jwks_uri/
    );
  });

  it('rejects when required scope is not present', async () => {
    const { fetcher } = makeFetchSequence([
      { status: 200, json: { jwks_uri: 'https://issuer-scope-miss/jwks' } },
      { status: 200, json: { keys: [{ kid: 'kid-1', alg: 'RS256', kty: 'RSA', e: 'AQAB', n: 'abc' }] } },
    ]);
    const deps: OIDCDeps = {
      importJWK: async () => ({}),
    };
    const deps2: OIDCDeps = {
      ...deps,
      jwtVerify: async () => ({
        payload: { sub: '123', scope: 'read:foo write:bar' },
      }),
    };
    await assert.rejects(
      () =>
        verifyAccessToken(
          makeToken(),
          { issuer: 'https://issuer-scope-miss', requiredScope: 'admin' } as OIDCConfig,
          fetcher,
          deps2
        ),
      /insufficient_scope/
    );
  });

  it('accepts when required scope is present via scp array', async () => {
    const { fetcher } = makeFetchSequence([
      { status: 200, json: { jwks_uri: 'https://issuer-scope-ok/jwks' } },
      { status: 200, json: { keys: [{ kid: 'kid-1', alg: 'RS256', kty: 'RSA', e: 'AQAB', n: 'abc' }] } },
    ]);
    const deps: OIDCDeps = {
      importJWK: async () => ({}),
    };
    const deps2: OIDCDeps = {
      ...deps,
      jwtVerify: async () => ({
        payload: { sub: 'abc', scp: ['read', 'admin'] },
      }),
    };
    const res = await verifyAccessToken(
      makeToken(),
      { issuer: 'https://issuer-scope-ok', requiredScope: 'admin' } as OIDCConfig,
      fetcher,
      deps2
    );
    assert.equal(res.payload.sub, 'abc');
  });

  it('refreshes JWKS once when the token kid is initially missing', async () => {
    const { fetcher, calls } = makeFetchSequence([
      { status: 200, json: { jwks_uri: 'https://issuer-refresh/jwks' }, matchUrl: 'https://issuer-refresh/.well-known/openid-configuration' },
      { status: 200, json: { keys: [{ kid: 'old-kid', alg: 'RS256', kty: 'RSA', e: 'AQAB', n: 'abc' }] }, matchUrl: 'https://issuer-refresh/jwks' },
      { status: 200, json: { keys: [{ kid: 'kid-1', alg: 'RS256', kty: 'RSA', e: 'AQAB', n: 'def' }] }, matchUrl: 'https://issuer-refresh/jwks' },
    ]);
    let importCalls = 0;

    const res = await verifyAccessToken(
      makeToken(),
      { issuer: 'https://issuer-refresh' } as OIDCConfig,
      fetcher,
      {
        importJWK: async () => {
          importCalls += 1;
          return {};
        },
        jwtVerify: async () => ({ payload: { sub: 'refreshed-user' } }),
      },
    );

    assert.equal(res.payload.sub, 'refreshed-user');
    assert.equal(importCalls, 1);
    assert.deepEqual(calls, [
      'https://issuer-refresh/.well-known/openid-configuration',
      'https://issuer-refresh/jwks',
      'https://issuer-refresh/jwks',
    ]);
  });
});
