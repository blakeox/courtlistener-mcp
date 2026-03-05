#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  handleWorkerOAuthRoutes,
  type WorkerOAuthRouteDeps,
} from '../../src/server/worker-oauth-routes.js';
import { HOSTED_MCP_OAUTH_CONTRACT } from '../../src/auth/oauth-contract.js';

type TestEnv = Record<string, unknown>;
type TestSignupConfig = {
  url: string;
  anonKey: string;
};

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

function redirectResponse(location: string, status = 302, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Location', location);
  return new Response(null, { status, headers });
}

describe('worker OAuth hosted smoke', () => {
  it('serves discovery and routes authorize/token through worker OAuth handler', async () => {
    let proxiedTokenUrl = '';
    const deps: WorkerOAuthRouteDeps<TestEnv, TestSignupConfig> = {
      jsonError,
      jsonResponse,
      redirectResponse,
      getSupabaseSignupConfig: () => ({
        url: 'https://project.example.supabase.co',
        anonKey: 'anon-key-123',
      }),
      fetchFn: async (url) => {
        proxiedTokenUrl = String(url);
        return new Response(JSON.stringify({ access_token: 'token-1', token_type: 'bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    };

    const discoveryRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorizationServerMetadata}`,
      { method: 'GET' },
    );
    const discoveryResponse = await handleWorkerOAuthRoutes(
      { request: discoveryRequest, url: new URL(discoveryRequest.url), env: {} },
      deps,
    );
    assert.ok(discoveryResponse);
    assert.equal(discoveryResponse.status, 200);
    const discoveryPayload = (await discoveryResponse.json()) as {
      authorization_endpoint?: string;
      token_endpoint?: string;
    };
    assert.equal(
      discoveryPayload.authorization_endpoint,
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}`,
    );
    assert.equal(discoveryPayload.token_endpoint, `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}`);

    const protectedResourceRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata}`,
      { method: 'GET' },
    );
    const protectedResourceResponse = await handleWorkerOAuthRoutes(
      { request: protectedResourceRequest, url: new URL(protectedResourceRequest.url), env: {} },
      deps,
    );
    assert.ok(protectedResourceResponse);
    assert.equal(protectedResourceResponse.status, 200);

    const authorizeRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}?client_id=client-1&state=abc`,
      { method: 'GET' },
    );
    const authorizeResponse = await handleWorkerOAuthRoutes(
      { request: authorizeRequest, url: new URL(authorizeRequest.url), env: {} },
      deps,
    );
    assert.ok(authorizeResponse);
    assert.equal(authorizeResponse.status, 302);
    assert.equal(new URL(authorizeResponse.headers.get('Location')!).pathname, '/auth/v1/authorize');

    const tokenRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}?grant_type=authorization_code`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'code=abc123',
      },
    );
    const tokenResponse = await handleWorkerOAuthRoutes(
      { request: tokenRequest, url: new URL(tokenRequest.url), env: {} },
      deps,
    );
    assert.ok(tokenResponse);
    assert.equal(tokenResponse.status, 200);
    assert.equal(
      proxiedTokenUrl,
      'https://project.example.supabase.co/auth/v1/token?grant_type=authorization_code',
    );
  });
});
