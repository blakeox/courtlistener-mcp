#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HOSTED_MCP_OAUTH_CONTRACT } from '../../src/auth/oauth-contract.js';
import {
  buildOAuthErrorRedirect,
  getUnsupportedScopes,
  resolveGrantedScopes,
  UnsupportedOAuthScopeError,
} from '../../src/auth/oauth-scope-resolver.js';

describe('resolveGrantedScopes', () => {
  it('filters unsupported scopes from the requested list', () => {
    assert.deepEqual(getUnsupportedScopes({ scope: ['legal:read', 'unknown:scope'] }), [
      'unknown:scope',
    ]);
    assert.throws(
      () => resolveGrantedScopes({ scope: ['legal:read', 'unknown:scope'] }),
      (error: unknown) =>
        error instanceof UnsupportedOAuthScopeError &&
        error.code === 'invalid_scope' &&
        error.unsupportedScopes[0] === 'unknown:scope',
    );
  });

  it('rejects an unsupported-only request instead of escalating to every supported scope', () => {
    assert.throws(
      () => resolveGrantedScopes({ scope: ['unknown:scope'] }),
      UnsupportedOAuthScopeError,
    );
  });

  it('falls back to the hosted contract scopes when no scopes were requested', () => {
    assert.deepEqual(
      resolveGrantedScopes({ scope: [] }),
      HOSTED_MCP_OAUTH_CONTRACT.scopesSupported,
    );
  });

  it('builds an OAuth error redirect that preserves validated client state', () => {
    const redirect = buildOAuthErrorRedirect(
      {
        scope: ['unknown:scope'],
        redirectUri: 'https://client.example/callback?existing=1#fragment',
        state: 'state-1',
      },
      'invalid_scope',
      'One or more requested OAuth scopes are not supported.',
    );

    assert.ok(redirect);
    const url = new URL(redirect);
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.get('existing'), '1');
    assert.equal(url.searchParams.get('error'), 'invalid_scope');
    assert.equal(url.searchParams.get('state'), 'state-1');
  });
});
