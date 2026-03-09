#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HOSTED_MCP_OAUTH_CONTRACT } from '../../src/auth/oauth-contract.js';
import { resolveGrantedScopes } from '../../src/auth/oauth-scope-resolver.js';

describe('resolveGrantedScopes', () => {
  it('filters unsupported scopes from the requested list', () => {
    assert.deepEqual(resolveGrantedScopes({ scope: ['legal:read', 'unknown:scope'] }), ['legal:read']);
  });

  it('falls back to the hosted contract scopes when nothing supported was requested', () => {
    assert.deepEqual(
      resolveGrantedScopes({ scope: ['unknown:scope'] }),
      HOSTED_MCP_OAUTH_CONTRACT.scopesSupported,
    );
  });

  it('falls back to the hosted contract scopes when no scopes were requested', () => {
    assert.deepEqual(resolveGrantedScopes({ scope: [] }), HOSTED_MCP_OAUTH_CONTRACT.scopesSupported);
  });
});
