#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server';

import {
  HOSTED_MCP_OAUTH_CONTRACT,
  buildHostedMcpAuthorizationServerMetadata,
  buildHostedMcpOpenIdConfiguration,
  buildHostedMcpProtectedResourceMetadata,
} from '../../src/auth/oauth-contract.js';

describe('hosted OAuth contract parity', () => {
  it('keeps core hosted metadata aligned while exposing compatibility fields for remote clients', () => {
    const issuerUrl = new URL('https://priority-client.example');
    const workerMetadata = buildHostedMcpAuthorizationServerMetadata(issuerUrl.origin);
    const openIdMetadata = buildHostedMcpOpenIdConfiguration(issuerUrl.origin);

    assert.deepEqual(HOSTED_MCP_OAUTH_CONTRACT.priorityClients, [
      'chatgpt',
      'codex',
      'vscode-copilot',
    ]);
    assert.equal(workerMetadata.issuer, issuerUrl.origin);
    assert.equal(
      workerMetadata.authorization_endpoint,
      `${issuerUrl.origin}${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}`,
    );
    assert.equal(
      new URL(workerMetadata.authorization_endpoint).pathname,
      HOSTED_MCP_OAUTH_CONTRACT.paths.authorize,
    );
    assert.deepEqual(workerMetadata.response_modes_supported, ['query']);
    assert.equal(workerMetadata.revocation_endpoint, `${issuerUrl.origin}/token`);
    assert.equal(workerMetadata.client_id_metadata_document_supported, true);
    assert.deepEqual(workerMetadata.token_endpoint_auth_methods_supported, [
      'client_secret_basic',
      'client_secret_post',
      'none',
    ]);
    assert.deepEqual(openIdMetadata.token_endpoint_auth_methods_supported, [
      'client_secret_basic',
      'client_secret_post',
      'none',
    ]);
  });

  it('returns protected-resource metadata shaped for the canonical MCP server origin', () => {
    const origin = 'https://priority-client.example';
    const issuerUrl = new URL(origin);
    const protectedResourceMetadata = buildHostedMcpProtectedResourceMetadata(origin);

    assert.equal(
      getOAuthProtectedResourceMetadataUrl(issuerUrl),
      `${origin}/.well-known/oauth-protected-resource`,
    );
    assert.equal(protectedResourceMetadata.resource, origin);
    assert.deepEqual(protectedResourceMetadata.authorization_servers, [origin]);
    assert.deepEqual(protectedResourceMetadata.scopes_supported, [
      ...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported,
    ]);
    assert.deepEqual(protectedResourceMetadata.bearer_methods_supported, ['header']);
    assert.equal(protectedResourceMetadata.resource_name, 'CourtListener MCP');
  });
});
