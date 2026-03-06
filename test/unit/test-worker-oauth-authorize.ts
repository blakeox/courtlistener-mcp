#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerOAuthAuthorizeRoute } from '../../src/server/worker-oauth-authorize.js';

interface TestEnv {
  MCP_AUTH_UI_ORIGIN?: string;
  MCP_OAUTH_DIAGNOSTICS?: string;
  OAUTH_PROVIDER: {
    parseAuthRequest: (request: Request) => Promise<{ scope: string[] }>;
    completeAuthorization: (input: {
      request: { scope: string[] };
      userId: string;
      metadata: Record<string, unknown>;
      scope: string[];
      props: Record<string, unknown>;
    }) => Promise<{ redirectTo: string }>;
  };
}

function jsonError(message: string, status: number, errorCode: string): Response {
  return Response.json({ error: errorCode, message }, { status });
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}

describe('handleWorkerOAuthAuthorizeRoute', () => {
  it('redirects unauthenticated users to the Clerk auth UI handoff', async () => {
    const env: TestEnv = {
      MCP_AUTH_UI_ORIGIN: 'https://auth.example',
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read'] }),
        completeAuthorization: async () => ({ redirectTo: 'https://client.example/callback?code=abc' }),
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthUserId: async () => null,
    });

    assert.equal(response.status, 302);
    const location = response.headers.get('Location');
    assert.ok(location);
    const redirect = new URL(String(location));
    assert.equal(redirect.origin, 'https://auth.example');
    assert.equal(redirect.pathname, '/auth/start');
    assert.equal(
      redirect.searchParams.get('return_to'),
      request.url,
    );
  });

  it('completes authorization when the UI session already resolved a user', async () => {
    const env: TestEnv = {
      MCP_AUTH_UI_ORIGIN: 'https://auth.example',
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read', 'unknown:scope'] }),
        completeAuthorization: async ({ userId, scope }) => {
          assert.equal(userId, 'user-123');
          assert.deepEqual(scope, ['legal:read']);
          return { redirectTo: 'https://client.example/callback?code=abc' };
        },
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread+unknown%3Ascope&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthUserId: async () => 'user-123',
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), 'https://client.example/callback?code=abc');
  });

  it('returns a controlled error when the OAuth provider rejects the request', async () => {
    const env: TestEnv = {
      MCP_AUTH_UI_ORIGIN: 'https://auth.example',
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => {
          throw new Error('Unknown OAuth client.');
        },
        completeAuthorization: async () => ({ redirectTo: 'https://client.example/callback?code=abc' }),
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=bad-client&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthUserId: async () => 'user-123',
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error?: string; message?: string };
    assert.equal(payload.error, 'invalid_authorization_request');
    assert.match(String(payload.message), /Unknown OAuth client/i);
  });

  it('returns a controlled error when authorization completion fails', async () => {
    const env: TestEnv = {
      MCP_AUTH_UI_ORIGIN: 'https://auth.example',
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read'] }),
        completeAuthorization: async () => {
          throw new Error('Authorization state could not be persisted.');
        },
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthUserId: async () => 'user-123',
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error?: string; message?: string };
    assert.equal(payload.error, 'authorization_completion_failed');
    assert.match(String(payload.message), /persisted/i);
  });
});
