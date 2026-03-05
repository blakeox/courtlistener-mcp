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
  buildHostedMcpProtectedResourceMetadata,
} from '../../src/auth/oauth-contract.js';
import { LegalOAuthClientsStore } from '../../src/auth/oauth-clients-store.js';
import { LegalOAuthProvider } from '../../src/auth/oauth-provider.js';
import { getHostedMcpScopesSupported } from '../../src/auth/oauth-service.js';

describe('hosted OAuth contract parity', () => {
  it('keeps priority-client metadata parity between Node and Worker surfaces', () => {
    const issuerUrl = new URL('https://priority-client.example');
    const provider = new LegalOAuthProvider(new LegalOAuthClientsStore());
    const nodeMetadata = createOAuthMetadata({
      provider,
      issuerUrl,
      scopesSupported: getHostedMcpScopesSupported(),
    });
    const workerMetadata = buildHostedMcpAuthorizationServerMetadata(issuerUrl.origin);

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

    assert.equal(workerMetadata.issuer, nodeMetadata.issuer);
    assert.equal(workerMetadata.authorization_endpoint, nodeMetadata.authorization_endpoint);
    assert.equal(workerMetadata.token_endpoint, nodeMetadata.token_endpoint);
    assert.deepEqual(workerMetadata.response_types_supported, nodeMetadata.response_types_supported);
    assert.deepEqual(workerMetadata.grant_types_supported, nodeMetadata.grant_types_supported);
    assert.deepEqual(
      workerMetadata.token_endpoint_auth_methods_supported,
      nodeMetadata.token_endpoint_auth_methods_supported,
    );
    assert.deepEqual(
      workerMetadata.code_challenge_methods_supported,
      nodeMetadata.code_challenge_methods_supported,
    );
    assert.deepEqual(workerMetadata.scopes_supported, nodeMetadata.scopes_supported);
  });

  it('uses the same protected-resource metadata path and shape as Node', () => {
    const origin = 'https://priority-client.example';
    const issuerUrl = new URL(origin);
    const protectedResourceMetadata = buildHostedMcpProtectedResourceMetadata(origin);

    assert.equal(
      getOAuthProtectedResourceMetadataUrl(issuerUrl),
      `${origin}${HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata}`,
    );
    assert.equal(protectedResourceMetadata.resource, issuerUrl.href);
    assert.deepEqual(protectedResourceMetadata.authorization_servers, [issuerUrl.href]);
    assert.deepEqual(protectedResourceMetadata.scopes_supported, getHostedMcpScopesSupported());
  });
});
