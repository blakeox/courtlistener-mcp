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

type Fetcher = (url: string) => Promise<FetchResponse>;

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
  createRemoteJWKSet?: () => unknown;
  jwtVerify?: (token: string, jwks: unknown) => Promise<JWTVerifyResult>;
}

function makeFetch(status: number, json: unknown): Fetcher {
  return async (): Promise<FetchResponse> => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  });
}

describe('OIDC verification (TypeScript)', () => {
  it('fails discovery with HTTP error', async () => {
    const fetcher = makeFetch(404, {});
    await assert.rejects(
      () =>
        verifyAccessToken(
          't',
          { issuer: 'https://issuer' } as OIDCConfig,
          fetcher
        ),
      /OIDC discovery failed \(404\) for issuer https:\/\/issuer/
    );
  });

  it('fails discovery when jwks_uri missing', async () => {
    const fetcher = makeFetch(200, {});
    await assert.rejects(
      () =>
        verifyAccessToken(
          't',
          { issuer: 'https://issuer' } as OIDCConfig,
          fetcher
        ),
      /OIDC discovery missing jwks_uri/
    );
  });

  it('rejects when required scope is not present', async () => {
    const fetcher = makeFetch(200, { jwks_uri: 'https://issuer/jwks' });
    const deps: OIDCDeps = {
      createRemoteJWKSet: () => ({}),
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
          't',
          { issuer: 'https://issuer', requiredScope: 'admin' } as OIDCConfig,
          fetcher,
          deps2
        ),
      /insufficient_scope/
    );
  });

  it('accepts when required scope is present via scp array', async () => {
    const fetcher = makeFetch(200, { jwks_uri: 'https://issuer/jwks' });
    const deps: OIDCDeps = {
      createRemoteJWKSet: () => ({}),
    };
    const deps2: OIDCDeps = {
      ...deps,
      jwtVerify: async () => ({
        payload: { sub: 'abc', scp: ['read', 'admin'] },
      }),
    };
    const res = await verifyAccessToken(
      't',
      { issuer: 'https://issuer', requiredScope: 'admin' } as OIDCConfig,
      fetcher,
      deps2
    );
    assert.equal(res.payload.sub, 'abc');
  });
});

