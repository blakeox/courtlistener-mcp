#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOSTED_MCP_OAUTH_CONTRACT, HOSTED_MCP_OAUTH_DEFAULT_SCOPE } from '../../src/auth/oauth-contract.js';
import {
  buildHostedMcpDefaultClientAttributes,
  buildSupabaseHostedOAuthAuthorizeUrl,
  buildSupabaseHostedOAuthTokenUrl,
  getHostedMcpScopesSupported,
  resolveHostedMcpRequestedScopes,
} from '../../src/auth/oauth-service.js';

describe('oauth service helpers', () => {
  it('resolves default supported scopes when no scopes are requested', () => {
    assert.deepEqual(resolveHostedMcpRequestedScopes(), [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported]);
    assert.deepEqual(getHostedMcpScopesSupported(), [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported]);
  });

  it('filters invalid scopes and rejects unsupported-only scope requests', () => {
    assert.deepEqual(resolveHostedMcpRequestedScopes(['legal:read', 'unknown']), ['legal:read']);
    assert.throws(() => resolveHostedMcpRequestedScopes(['unknown']), /No valid scopes requested/);
  });

  it('builds hosted default client attributes from canonical contract', () => {
    assert.deepEqual(buildHostedMcpDefaultClientAttributes('secret').grant_types, [
      ...HOSTED_MCP_OAUTH_CONTRACT.grantTypesSupported,
    ]);
    assert.deepEqual(buildHostedMcpDefaultClientAttributes('secret').response_types, [
      ...HOSTED_MCP_OAUTH_CONTRACT.responseTypesSupported,
    ]);
    assert.equal(buildHostedMcpDefaultClientAttributes('secret').token_endpoint_auth_method, 'client_secret_post');
    assert.equal(buildHostedMcpDefaultClientAttributes(undefined).token_endpoint_auth_method, 'none');
    assert.equal(buildHostedMcpDefaultClientAttributes('secret').scope, HOSTED_MCP_OAUTH_DEFAULT_SCOPE);
  });

  it('builds Supabase OAuth upstream authorize/token URLs with copied query params', () => {
    const query = new URLSearchParams('client_id=client-1&state=abc');
    const authorizeUrl = buildSupabaseHostedOAuthAuthorizeUrl(
      'https://project.example.supabase.co/',
      query,
    );
    const tokenUrl = buildSupabaseHostedOAuthTokenUrl('https://project.example.supabase.co/', query);

    assert.equal(authorizeUrl.toString(), 'https://project.example.supabase.co/auth/v1/authorize?client_id=client-1&state=abc');
    assert.equal(tokenUrl.toString(), 'https://project.example.supabase.co/auth/v1/token?client_id=client-1&state=abc');
  });
});
