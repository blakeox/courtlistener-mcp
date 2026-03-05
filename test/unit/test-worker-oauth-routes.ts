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

function buildDeps(
  overrides: Partial<WorkerOAuthRouteDeps<TestEnv, TestSignupConfig>> = {},
): WorkerOAuthRouteDeps<TestEnv, TestSignupConfig> {
  return {
    jsonError,
    jsonResponse,
    getSupabaseSignupConfig: () => ({
      url: 'https://project.example.supabase.co',
      anonKey: 'anon-key-123',
    }),
    redirectResponse,
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          token_type: 'bearer',
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        },
      ),
    ...overrides,
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
    const payload = (await response.json()) as {
      issuer?: string;
      authorization_endpoint?: string;
      token_endpoint?: string;
      response_types_supported?: string[];
      grant_types_supported?: string[];
      token_endpoint_auth_methods_supported?: string[];
      code_challenge_methods_supported?: string[];
      scopes_supported?: string[];
    };
    assert.equal(payload.issuer, 'https://worker.example/');
    assert.equal(
      payload.authorization_endpoint,
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}`,
    );
    assert.equal(payload.token_endpoint, `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}`);
    assert.deepEqual(payload.response_types_supported, [...HOSTED_MCP_OAUTH_CONTRACT.responseTypesSupported]);
    assert.deepEqual(payload.grant_types_supported, [...HOSTED_MCP_OAUTH_CONTRACT.grantTypesSupported]);
    assert.deepEqual(
      payload.token_endpoint_auth_methods_supported,
      [...HOSTED_MCP_OAUTH_CONTRACT.tokenEndpointAuthMethodsSupported],
    );
    assert.deepEqual(
      payload.code_challenge_methods_supported,
      [...HOSTED_MCP_OAUTH_CONTRACT.codeChallengeMethodsSupported],
    );
    assert.deepEqual(payload.scopes_supported, [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported]);
  });

  it('returns OAuth protected-resource metadata for discovery endpoint', async () => {
    const request = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata}`,
      { method: 'GET' },
    );

    const response = await handleWorkerOAuthRoutes(
      { request, url: new URL(request.url), env: {} },
      buildDeps(),
    );

    assert.ok(response);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      resource?: string;
      authorization_servers?: string[];
      scopes_supported?: string[];
    };
    assert.equal(payload.resource, 'https://worker.example/');
    assert.deepEqual(payload.authorization_servers, ['https://worker.example/']);
    assert.deepEqual(payload.scopes_supported, [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported]);
  });

  it('redirects /authorize requests to Supabase authorization endpoint', async () => {
    const request = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}?client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&state=abc`,
      { method: 'GET' },
    );

    const response = await handleWorkerOAuthRoutes(
      { request, url: new URL(request.url), env: {} },
      buildDeps(),
    );

    assert.ok(response);
    assert.equal(response.status, 302);
    const location = response.headers.get('Location');
    assert.ok(location);
    const redirectUrl = new URL(location!);
    assert.equal(redirectUrl.origin, 'https://project.example.supabase.co');
    assert.equal(redirectUrl.pathname, '/auth/v1/authorize');
    assert.equal(redirectUrl.searchParams.get('client_id'), 'client-1');
    assert.equal(redirectUrl.searchParams.get('state'), 'abc');
  });

  it('accepts POST /authorize requests and forwards form parameters', async () => {
    const request = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'client_id=client-2&state=post-state',
      },
    );

    const response = await handleWorkerOAuthRoutes(
      { request, url: new URL(request.url), env: {} },
      buildDeps(),
    );

    assert.ok(response);
    assert.equal(response.status, 302);
    const location = response.headers.get('Location');
    assert.ok(location);
    const redirectUrl = new URL(location!);
    assert.equal(redirectUrl.pathname, '/auth/v1/authorize');
    assert.equal(redirectUrl.searchParams.get('client_id'), 'client-2');
    assert.equal(redirectUrl.searchParams.get('state'), 'post-state');
  });

  it('proxies /token requests to Supabase token endpoint with anon-key headers', async () => {
    let forwardedUrl = '';
    let forwardedHeaders: HeadersInit | undefined;
    let forwardedBody = '';
    const request = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}?grant_type=authorization_code`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'code=abc123&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback',
      },
    );

    const response = await handleWorkerOAuthRoutes(
      { request, url: new URL(request.url), env: {} },
      buildDeps({
        fetchFn: async (url, init) => {
          forwardedUrl = String(url);
          forwardedHeaders = init?.headers;
          forwardedBody = typeof init?.body === 'string' ? init.body : '';
          return new Response(JSON.stringify({ access_token: 'token-1', token_type: 'bearer' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      }),
    );

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.equal(
      forwardedUrl,
      'https://project.example.supabase.co/auth/v1/token?grant_type=authorization_code',
    );
    assert.equal(forwardedBody, 'code=abc123&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback');
    const headers = new Headers(forwardedHeaders);
    assert.equal(headers.get('apikey'), 'anon-key-123');
    assert.equal(headers.get('authorization'), 'Bearer anon-key-123');
  });

  it('rejects unsupported token grant types before proxying upstream', async () => {
    let fetchCalled = false;
    const request = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}?grant_type=client_credentials`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'client_id=client-1',
      },
    );

    const response = await handleWorkerOAuthRoutes(
      { request, url: new URL(request.url), env: {} },
      buildDeps({
        fetchFn: async () => {
          fetchCalled = true;
          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
        },
      }),
    );

    assert.ok(response);
    assert.equal(response.status, 400);
    assert.equal(fetchCalled, false);
    const payload = (await response.json()) as { error_code?: string };
    assert.equal(payload.error_code, 'unsupported_grant_type');
  });
});
