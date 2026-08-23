#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  handleWorkerOAuthEntrypoint,
  isWorkerManagedRegistrationPath,
  shouldBypassOAuthProvider,
} from '../../src/server/worker-oauth-entrypoint-runtime.js';

describe('handleWorkerOAuthEntrypoint', () => {
  it('rate limits authorize requests before provider execution', async () => {
    let providerCalls = 0;
    let limiterCalls = 0;

    const response = await handleWorkerOAuthEntrypoint(
      new Request('https://worker.example/oauth/authorize?client_id=client-1', { method: 'GET' }),
      {},
      {} as ExecutionContext,
      {
        cloudflareOAuthProvider: {
          fetch: async () => {
            providerCalls += 1;
            return new Response('ok');
          },
        },
        summarizeOAuthRequest: async () => ({ route: 'authorize' }),
        summarizeOAuthResponse: async () => ({}),
        emitOAuthDiagnostic: () => {},
        getClientIdentifier: () => '127.0.0.1',
        getAuthRouteRateLimitedResponse: async () => {
          limiterCalls += 1;
          return Response.json({ error: 'oauth_route_rate_limited' }, { status: 429 });
        },
        now: () => 123,
      },
    );

    assert.equal(limiterCalls, 1);
    assert.equal(providerCalls, 0);
    assert.equal(response.status, 429);
  });
});

describe('isWorkerManagedRegistrationPath', () => {
  it('claims the public registration endpoint', () => {
    assert.equal(isWorkerManagedRegistrationPath('/register'), true);
  });

  it('claims registration management endpoints', () => {
    assert.equal(isWorkerManagedRegistrationPath('/register/client-123'), true);
  });

  it('does not claim unrelated oauth routes', () => {
    assert.equal(isWorkerManagedRegistrationPath('/authorize'), false);
  });
});

describe('shouldBypassOAuthProvider', () => {
  it('lets health and readiness reach the core route layer', () => {
    assert.equal(shouldBypassOAuthProvider('/health'), true);
    assert.equal(shouldBypassOAuthProvider('/ready'), true);
  });

  it('keeps unrelated routes behind the OAuth provider', () => {
    assert.equal(shouldBypassOAuthProvider('/'), false);
  });
});
