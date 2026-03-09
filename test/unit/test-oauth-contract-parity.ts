#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createOAuthMetadata,
  getOAuthProtectedResourceMetadataUrl,
} from '@modelcontextprotocol/sdk/server/auth/router.js';

import {
  HOSTED_MCP_OAUTH_CONTRACT,
  buildHostedMcpAuthorizationServerMetadata,
  buildHostedMcpOpenIdConfiguration,
  buildHostedMcpProtectedResourceMetadata,
} from '../../src/auth/oauth-contract.js';
import { LegalOAuthClientsStore } from '../../src/auth/oauth-clients-store.js';
import { LegalOAuthProvider } from '../../src/auth/oauth-provider.js';
import { getHostedMcpScopesSupported } from '../../src/auth/oauth-service.js';

describe('hosted OAuth contract parity', () => {
  it('keeps core hosted metadata aligned while exposing compatibility fields for remote clients', () => {
    const issuerUrl = new URL('https://priority-client.example');
    const provider = new LegalOAuthProvider(new LegalOAuthClientsStore());
    const nodeMetadata = createOAuthMetadata({
      provider,
      issuerUrl,
      scopesSupported: getHostedMcpScopesSupported(),
    });
    const workerMetadata = buildHostedMcpAuthorizationServerMetadata(issuerUrl.origin);
    const openIdMetadata = buildHostedMcpOpenIdConfiguration(issuerUrl.origin);

    assert.deepEqual(HOSTED_MCP_OAUTH_CONTRACT.priorityClients, [
      'chatgpt',
      'codex',
      'vscode-copilot',
    ]);
    assert.equal(
      new URL(nodeMetadata.authorization_endpoint).pathname,
      HOSTED_MCP_OAUTH_CONTRACT.paths.authorize,
    );
    assert.equal(new URL(nodeMetadata.token_endpoint).pathname, HOSTED_MCP_OAUTH_CONTRACT.paths.token);

    assert.equal(workerMetadata.issuer, issuerUrl.origin);
    assert.equal(workerMetadata.authorization_endpoint, nodeMetadata.authorization_endpoint);
    assert.equal(workerMetadata.token_endpoint, nodeMetadata.token_endpoint);
    assert.deepEqual(workerMetadata.response_types_supported, nodeMetadata.response_types_supported);
    assert.deepEqual(workerMetadata.grant_types_supported, nodeMetadata.grant_types_supported);
    assert.deepEqual(
      workerMetadata.code_challenge_methods_supported,
      nodeMetadata.code_challenge_methods_supported,
    );
    assert.deepEqual(workerMetadata.scopes_supported, nodeMetadata.scopes_supported);
    assert.deepEqual(workerMetadata.response_modes_supported, ['query']);
    assert.equal(workerMetadata.revocation_endpoint, `${issuerUrl.origin}/token`);
    assert.equal(workerMetadata.client_id_metadata_document_supported, false);
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
      `${origin}${HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata}`,
    );
    assert.equal(protectedResourceMetadata.resource, origin);
    assert.deepEqual(protectedResourceMetadata.authorization_servers, [origin]);
    assert.deepEqual(protectedResourceMetadata.scopes_supported, getHostedMcpScopesSupported());
    assert.deepEqual(protectedResourceMetadata.bearer_methods_supported, ['header']);
    assert.equal(protectedResourceMetadata.resource_name, 'CourtListener MCP');
  });
});
