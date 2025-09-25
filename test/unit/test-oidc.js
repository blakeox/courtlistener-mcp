#!/usr/bin/env node

/**
 * Unit tests for OIDC token verification helper.
 * Covers discovery failures, missing jwks_uri, insufficient scope, and success path.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { verifyAccessToken } = await import('../../dist/security/oidc.js');

function makeFetch(status, json) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => json });
}

describe('OIDC verification', () => {
  it('fails discovery with HTTP error', async () => {
    const fetcher = makeFetch(404, {});
    await assert.rejects(
      () => verifyAccessToken('t', { issuer: 'https://issuer' }, fetcher),
      /OIDC discovery failed \(404\) for issuer https:\/\/issuer/,
    );
  });

  it('fails discovery when jwks_uri missing', async () => {
    const fetcher = makeFetch(200, {});
    await assert.rejects(
      () => verifyAccessToken('t', { issuer: 'https://issuer' }, fetcher),
      /OIDC discovery missing jwks_uri/,
    );
  });

  it('rejects when required scope is not present', async () => {
    const fetcher = makeFetch(200, { jwks_uri: 'https://issuer/jwks' });
    const deps = {
      createRemoteJWKSet: () => ({})
    };
    const deps2 = {
      ...deps,
      jwtVerify: async () => ({ payload: { sub: '123', scope: 'read:foo write:bar' } }),
    };
    await assert.rejects(
      () => verifyAccessToken('t', { issuer: 'https://issuer', requiredScope: 'admin' }, fetcher, deps2),
      /insufficient_scope/,
    );
  });

  it('accepts when required scope is present via scp array', async () => {
    const fetcher = makeFetch(200, { jwks_uri: 'https://issuer/jwks' });
    const deps = {
      createRemoteJWKSet: () => ({})
    };
    const deps2 = {
      ...deps,
      jwtVerify: async () => ({ payload: { sub: 'abc', scp: ['read', 'admin'] } }),
    };
    const res = await verifyAccessToken('t', { issuer: 'https://issuer', requiredScope: 'admin' }, fetcher, deps2);
    assert.equal(res.payload.sub, 'abc');
  });
});
