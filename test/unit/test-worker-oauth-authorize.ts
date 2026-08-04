#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OAuthScopeAuthorizationRequest } from '../../src/auth/oauth-scope-resolver.js';
import { handleWorkerOAuthAuthorizeRoute } from '../../src/server/worker-oauth-authorize.js';

interface TestEnv {
  OIDC_ISSUER?: string;
  MCP_AUTH_OIDC_CLIENT_ID?: string;
  MCP_AUTH_OIDC_CLIENT_SECRET?: string;
  MCP_UI_SESSION_SECRET?: string;
  MCP_OAUTH_DIAGNOSTICS?: string;
  OAUTH_PROVIDER: {
    parseAuthRequest: (request: Request) => Promise<OAuthScopeAuthorizationRequest>;
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
  it('redirects unauthenticated users to same-origin auth start when hosted auth is configured', async () => {
    const env: TestEnv = {
      OIDC_ISSUER: 'https://issuer.example',
      MCP_AUTH_OIDC_CLIENT_ID: 'same-origin-client',
      MCP_AUTH_OIDC_CLIENT_SECRET: 'same-origin-secret',
      MCP_UI_SESSION_SECRET: 'session-secret',
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read'] }),
        completeAuthorization: async () => ({
          redirectTo: 'https://client.example/callback?code=abc',
        }),
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({ kind: 'missing' }),
    });

    assert.equal(response.status, 302);
    const location = response.headers.get('Location');
    assert.ok(location);
    const redirect = new URL(String(location));
    assert.equal(redirect.origin, 'https://worker.example');
    assert.equal(redirect.pathname, '/auth/start');
    assert.equal(redirect.searchParams.get('return_to'), request.url);
  });

  it('falls back to the same-origin auth handoff when hosted OIDC is configured', async () => {
    const env: TestEnv = {
      OIDC_ISSUER: 'https://issuer.example',
      MCP_AUTH_OIDC_CLIENT_ID: 'same-origin-client',
      MCP_AUTH_OIDC_CLIENT_SECRET: 'same-origin-secret',
      MCP_UI_SESSION_SECRET: 'session-secret',
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read'] }),
        completeAuthorization: async () => ({
          redirectTo: 'https://client.example/callback?code=abc',
        }),
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({ kind: 'missing' }),
    });

    assert.equal(response.status, 302);
    const location = response.headers.get('Location');
    assert.ok(location);
    const redirect = new URL(String(location));
    assert.equal(redirect.origin, 'https://worker.example');
    assert.equal(redirect.pathname, '/auth/start');
    assert.equal(redirect.searchParams.get('return_to'), request.url);
  });

  it('redirects incomplete hosted-auth config to the same-origin auth handoff', async () => {
    const env: TestEnv = {
      OIDC_ISSUER: 'https://issuer.example',
      MCP_AUTH_OIDC_CLIENT_ID: 'same-origin-client',
      MCP_UI_SESSION_SECRET: 'session-secret',
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read'] }),
        completeAuthorization: async () => ({
          redirectTo: 'https://client.example/callback?code=abc',
        }),
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({ kind: 'missing' }),
    });

    assert.equal(response.status, 302);
    const location = response.headers.get('Location');
    assert.ok(location);
    const redirect = new URL(String(location));
    assert.equal(redirect.origin, 'https://worker.example');
    assert.equal(redirect.pathname, '/auth/start');
    assert.equal(redirect.searchParams.get('return_to'), request.url);
  });

  it('redirects missing-session-secret hosted auth setups into the same-origin auth handoff', async () => {
    const env: TestEnv = {
      OIDC_ISSUER: 'https://issuer.example',
      MCP_AUTH_OIDC_CLIENT_ID: 'same-origin-client',
      MCP_AUTH_OIDC_CLIENT_SECRET: 'same-origin-secret',
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read'] }),
        completeAuthorization: async () => ({
          redirectTo: 'https://client.example/callback?code=abc',
        }),
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({ kind: 'missing' }),
    });

    assert.equal(response.status, 302);
    const location = response.headers.get('Location');
    assert.ok(location);
    const redirect = new URL(String(location));
    assert.equal(redirect.origin, 'https://worker.example');
    assert.equal(redirect.pathname, '/auth/start');
    assert.equal(redirect.searchParams.get('return_to'), request.url);
  });

  it('returns identity_required when no hosted auth configuration is present at all', async () => {
    const env: TestEnv = {
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read'] }),
        completeAuthorization: async () => ({
          redirectTo: 'https://client.example/callback?code=abc',
        }),
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({ kind: 'missing' }),
    });

    assert.equal(response.status, 401);
    const payload = (await response.json()) as { error?: string };
    assert.equal(payload.error, 'identity_required');
  });

  it('requires an explicit approval step when the browser UI session resolved a user', async () => {
    const env: TestEnv = {
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read', 'unknown:scope'] }),
        completeAuthorization: async () => {
          throw new Error('completeAuthorization should not run before approval');
        },
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread+unknown%3Ascope&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({
        kind: 'authenticated',
        userId: 'user-123',
        authSource: 'ui_session',
      }),
    });

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('Location'),
      `https://worker.example/oauth/approve?return_to=${encodeURIComponent(request.url)}`,
    );
  });

  it('requires explicit approval before completing OAuth from Cloudflare Access identity headers', async () => {
    const env: TestEnv = {
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read'] }),
        completeAuthorization: async () => {
          throw new Error('completeAuthorization should not run before approval');
        },
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({
        kind: 'authenticated',
        userId: 'cf_user_123',
        authSource: 'cloudflare_access',
      }),
    });

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('Location'),
      `https://worker.example/oauth/approve?return_to=${encodeURIComponent(request.url)}`,
    );
  });

  it('requires explicit approval before completing OAuth from ambient dev fallback identity', async () => {
    const env: TestEnv = {
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read'] }),
        completeAuthorization: async () => {
          throw new Error('completeAuthorization should not run before approval');
        },
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({
        kind: 'authenticated',
        userId: 'dev-user',
        authSource: 'dev_fallback',
      }),
    });

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('Location'),
      `https://worker.example/oauth/approve?return_to=${encodeURIComponent(request.url)}`,
    );
  });

  it('returns a controlled error when the OAuth provider rejects the request', async () => {
    const env: TestEnv = {
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => {
          throw new Error('Unknown OAuth client.');
        },
        completeAuthorization: async () => ({
          redirectTo: 'https://client.example/callback?code=abc',
        }),
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=bad-client&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({
        kind: 'authenticated',
        userId: 'user-123',
        authSource: 'oidc_bearer',
      }),
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error?: string; message?: string };
    assert.equal(payload.error, 'invalid_authorization_request');
    assert.match(String(payload.message), /Unknown OAuth client/i);
  });

  it('returns a controlled error when authorization completion fails', async () => {
    const env: TestEnv = {
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
      resolveCloudflareOAuthIdentity: async () => ({
        kind: 'authenticated',
        userId: 'user-123',
        authSource: 'oidc_bearer',
      }),
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error?: string; message?: string };
    assert.equal(payload.error, 'authorization_completion_failed');
    assert.match(String(payload.message), /persisted/i);
  });

  it('completes authorization for an authenticated oidc bearer request', async () => {
    let parseAuthRequestCalls = 0;
    let completionInput:
      | {
          request: { scope: string[] };
          userId: string;
          metadata: Record<string, unknown>;
          scope: string[];
          props: Record<string, unknown>;
        }
      | undefined;
    const env: TestEnv = {
      OAUTH_PROVIDER: {
        parseAuthRequest: async (request) => {
          parseAuthRequestCalls += 1;
          assert.equal(request.url.includes('/authorize?'), true);
          return { scope: ['legal:read'] };
        },
        completeAuthorization: async (input) => {
          completionInput = input;
          return { redirectTo: 'https://client.example/callback?code=success' };
        },
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({
        kind: 'authenticated',
        userId: 'user-123',
        authSource: 'oidc_bearer',
      }),
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), 'https://client.example/callback?code=success');
    assert.equal(parseAuthRequestCalls, 1);
    assert.ok(completionInput);
    assert.equal(completionInput.userId, 'user-123');
    assert.deepEqual(completionInput.request, { scope: ['legal:read'] });
    assert.deepEqual(completionInput.scope, ['legal:read']);
    assert.deepEqual(completionInput.props, {
      userId: 'user-123',
      authMethod: 'cloudflare_oauth',
    });
    assert.equal(completionInput.metadata.source, 'cloudflare_oauth');
    assert.equal(typeof completionInput.metadata.approved_at, 'string');
    assert.notEqual(response.headers.get('Location')?.includes('/auth/start'), true);
    assert.notEqual(response.headers.get('Location')?.includes('/oauth/approve'), true);
  });

  it('rejects an unsupported scope with an OAuth error redirect after request validation', async () => {
    let completionCalled = false;
    const env: TestEnv = {
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({
          scope: ['legal:read', 'unknown:scope'],
          redirectUri: 'https://client.example/callback',
          state: 'state-1',
        }),
        completeAuthorization: async () => {
          completionCalled = true;
          return { redirectTo: 'https://client.example/callback?code=unexpected' };
        },
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread+unknown%3Ascope&state=state-1&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({
        kind: 'authenticated',
        userId: 'user-123',
        authSource: 'oidc_bearer',
      }),
    });

    assert.equal(response.status, 302);
    const location = response.headers.get('Location');
    assert.ok(location);
    const redirect = new URL(location);
    assert.equal(redirect.origin, 'https://client.example');
    assert.equal(redirect.pathname, '/callback');
    assert.equal(redirect.searchParams.get('error'), 'invalid_scope');
    assert.equal(redirect.searchParams.get('state'), 'state-1');
    assert.equal(completionCalled, false);
  });

  it('returns a 503 when session revocation validation is unavailable', async () => {
    const env: TestEnv = {
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({ scope: ['legal:read'] }),
        completeAuthorization: async () => ({
          redirectTo: 'https://client.example/callback?code=abc',
        }),
      },
    };
    const request = new Request(
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=legal%3Aread&state=test&code_challenge=abc&code_challenge_method=S256',
    );

    const response = await handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity: async () => ({ kind: 'session_revocation_unavailable' }),
    });

    assert.equal(response.status, 503);
    const payload = (await response.json()) as { error?: string; message?: string };
    assert.equal(payload.error, 'session_revocation_unavailable');
    assert.match(String(payload.message), /session revocation/i);
  });
});
