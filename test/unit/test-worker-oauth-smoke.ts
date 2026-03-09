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

function withCors(response: Response): Response {
  return response;
}

describe('worker OAuth smoke', () => {
  it('serves discovery metadata and leaves provider endpoints unhandled', async () => {
    const deps: WorkerOAuthRouteDeps<TestEnv> = {
      jsonError,
      jsonResponse,
      withCors,
    };

    const discoveryRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorizationServerMetadata}`,
      { method: 'GET' },
    );
    const discoveryResponse = await handleWorkerOAuthRoutes(
      { request: discoveryRequest, url: new URL(discoveryRequest.url), origin: null, allowedOrigins: [], env: {} },
      deps,
    );
    assert.ok(discoveryResponse);
    assert.equal(discoveryResponse.status, 200);

    const tokenRequest = new Request(`https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=x&code_verifier=y',
    });
    const tokenResponse = await handleWorkerOAuthRoutes(
      { request: tokenRequest, url: new URL(tokenRequest.url), origin: null, allowedOrigins: [], env: {} },
      deps,
    );
    assert.equal(tokenResponse, null);
  });
});
