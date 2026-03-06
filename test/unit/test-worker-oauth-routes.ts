#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerOAuthRoutes, type WorkerOAuthRouteDeps } from '../../src/server/worker-oauth-routes.js';
import { HOSTED_MCP_OAUTH_CONTRACT } from '../../src/auth/oauth-contract.js';

type TestEnv = Record<string, unknown>;

function jsonResponse(payload: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (extraHeaders) {
    const extra = new Headers(extraHeaders);
    extra.forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function jsonError(message: string, status: number, errorCode: string): Response {
  return jsonResponse({ error: message, error_code: errorCode }, status);
}

function buildDeps(): WorkerOAuthRouteDeps<TestEnv> {
  return {
    jsonError,
    jsonResponse,
  };
}

describe('handleWorkerOAuthRoutes', () => {
  it('returns OAuth authorization-server metadata for discovery endpoint', async () => {
    const request = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorizationServerMetadata}`,
      { method: 'GET' },
    );

    const response = await handleWorkerOAuthRoutes(
      { request, url: new URL(request.url), env: {} },
      buildDeps(),
    );

    assert.ok(response);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { authorization_endpoint?: string; token_endpoint?: string };
    assert.equal(payload.authorization_endpoint, `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}`);
    assert.equal(payload.token_endpoint, `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}`);
  });

  it('returns OAuth protected-resource metadata for root and /mcp resource paths', async () => {
    const rootRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata}`,
      { method: 'GET' },
    );
    const mcpRequest = new Request('https://worker.example/.well-known/oauth-protected-resource/mcp', {
      method: 'GET',
    });

    const rootResponse = await handleWorkerOAuthRoutes(
      { request: rootRequest, url: new URL(rootRequest.url), env: {} },
      buildDeps(),
    );
    const mcpResponse = await handleWorkerOAuthRoutes(
      { request: mcpRequest, url: new URL(mcpRequest.url), env: {} },
      buildDeps(),
    );

    assert.ok(rootResponse);
    assert.ok(mcpResponse);
    assert.equal(rootResponse.status, 200);
    assert.equal(mcpResponse.status, 200);

    const rootPayload = (await rootResponse.json()) as { resource?: string };
    const mcpPayload = (await mcpResponse.json()) as { resource?: string };
    assert.equal(rootPayload.resource, 'https://worker.example/mcp');
    assert.equal(mcpPayload.resource, 'https://worker.example/mcp');
  });
});
