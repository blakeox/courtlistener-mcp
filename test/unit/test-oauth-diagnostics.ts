#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  emitOAuthDiagnostic,
  summarizeOAuthRequest,
  summarizeOAuthResponse,
} from '../../src/server/oauth-diagnostics.js';

describe('oauth diagnostics', () => {
  it('summarizes authorize requests without exposing secrets', async () => {
    const request = new Request(
      'https://worker.example/authorize?client_id=abc123&redirect_uri=https%3A%2F%2Fchatgpt.com%2Faip%2Fcallback&scope=legal%3Aread%20legal%3Asearch&state=opaque&code_challenge_method=S256&code_challenge=secret-challenge',
      {
        headers: {
          authorization: 'Bearer super-secret-token',
          'user-agent': 'OpenAI-Connector-Test',
        },
      },
    );

    const summary = await summarizeOAuthRequest(request);

    assert.equal(summary.route, 'authorize');
    assert.equal(summary.client_id, 'abc123');
    assert.equal(summary.redirect_uri, 'https://chatgpt.com/aip/callback');
    assert.deepEqual(summary.scopes, ['legal:read', 'legal:search']);
    assert.equal(summary.authorization_scheme, 'bearer');
    assert.equal(summary.code_challenge_present, true);
  });

  it('summarizes token requests from form bodies', async () => {
    const request = new Request('https://worker.example/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&client_id=client-1&redirect_uri=https%3A%2F%2Fchat.openai.com%2Faip%2Fcallback&code=abc&code_verifier=def',
    });

    const summary = await summarizeOAuthRequest(request);

    assert.equal(summary.route, 'token');
    assert.equal(summary.grant_type, 'authorization_code');
    assert.equal(summary.client_id, 'client-1');
    assert.equal(summary.redirect_uri, 'https://chat.openai.com/aip/callback');
    assert.equal(summary.code_present, true);
    assert.equal(summary.code_verifier_present, true);
  });

  it('summarizes error responses and redacts bearer tokens', async () => {
    const response = new Response(
      JSON.stringify({
        error: 'invalid_client',
        error_description: 'Bearer super-secret-token rejected',
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' },
      },
    );

    const summary = await summarizeOAuthResponse(response);

    assert.equal(summary.status, 401);
    assert.equal(summary.content_type, 'application/json');
    assert.match(String(summary.error_body), /Bearer \[REDACTED\]/);
  });

  it('emits logs only when diagnostics are enabled', () => {
    const stderr = mock.method(console, 'error');

    emitOAuthDiagnostic({ MCP_OAUTH_DIAGNOSTICS: 'false' }, 'oauth.test', { ok: true });
    assert.equal(stderr.mock.calls.length, 0);

    emitOAuthDiagnostic({ MCP_OAUTH_DIAGNOSTICS: 'true' }, 'oauth.test', { ok: true });
    assert.equal(stderr.mock.calls.length, 1);
  });
});
