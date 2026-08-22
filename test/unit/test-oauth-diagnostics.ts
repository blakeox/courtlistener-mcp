#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  emitOAuthDiagnostic,
  summarizeHostedAuthReadiness,
  summarizeHostedAuthRequest,
  summarizeHostedAuthSignal,
  summarizeOAuthRequest,
  summarizeOAuthResponse,
} from '../../src/server/oauth-diagnostics.js';

describe('oauth diagnostics', () => {
  it('summarizes authorize requests without exposing secrets', async () => {
    const request = new Request(
      'https://worker.example/oauth/authorize?client_id=abc123&redirect_uri=https%3A%2F%2Fchatgpt.com%2Faip%2Fcallback&scope=legal%3Aread%20legal%3Asearch&state=opaque&code_challenge_method=S256&code_challenge=secret-challenge',
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

  it('summarizes hosted auth requests without exposing cookie values', () => {
    const summary = summarizeHostedAuthRequest(
      new Request(
        'https://worker.example/auth/start?continue=1&return_to=https%3A%2F%2Fworker.example%2Foauth%2Fauthorize&auth_error=callback_failed',
        {
          headers: {
            cookie:
              'clmcp_ui=session; clauth_state=opaque; clauth_approve=opaque; clauth_flow=flow-123; clmcp_csrf=csrf',
          },
        },
      ),
    );

    assert.equal(summary.route, 'auth-start');
    assert.equal(summary.return_to, 'https://worker.example/oauth/authorize');
    assert.equal(summary.auth_error, 'callback_failed');
    assert.equal(summary.session_cookie_present, true);
    assert.equal(summary.state_cookie_present, true);
    assert.equal(summary.approval_cookie_present, true);
    assert.equal(summary.flow_cookie_present, true);
    assert.equal(summary.csrf_cookie_present, true);
  });

  it('summarizes hosted auth readiness without secrets', () => {
    const summary = summarizeHostedAuthReadiness({
      relevantEnvPresent: true,
      ready: false,
      issuerConfigured: true,
      sessionSecretConfigured: false,
      workerNativeClientIdConfigured: true,
      workerNativeClientSecretConfigured: true,
      legacyClientIdConfigured: false,
      legacyClientSecretConfigured: false,
      credentialSource: 'worker_native',
      errors: ['Hosted auth requires MCP_UI_SESSION_SECRET.'],
    });

    assert.equal(summary.hosted_auth_ready, false);
    assert.equal(summary.credential_source, 'worker_native');
    assert.equal(summary.config_error_count, 1);
    assert.deepEqual(summary.config_errors, ['Hosted auth requires MCP_UI_SESSION_SECRET.']);
  });

  it('classifies hosted auth signals for alerting-friendly metadata', () => {
    const summary = summarizeHostedAuthSignal({
      pathname: '/oauth/approve',
      ready: false,
      status: 'ready',
      outcome: 'rejected',
      correlationId: 'corr-123',
      authError: 'csrf_validation_failed',
      credentialSource: 'worker_native',
      configErrorCount: 0,
      totalDurationMs: 42.2,
      upstreamDiscoveryCacheStatus: 'hit',
      tokenVerificationDurationMs: 11.2,
      jwksFetchDurationMs: 7.4,
      sessionCreationDurationMs: 5.1,
      approvalDurationMs: 19.6,
    });

    assert.equal(summary.hosted_auth_route, 'auth-approve');
    assert.equal(summary.hosted_auth_status, 'ready');
    assert.equal(summary.hosted_auth_correlation_id, 'corr-123');
    assert.equal(summary.hosted_auth_error, 'csrf_validation_failed');
    assert.equal(summary.hosted_auth_outcome, 'rejected');
    assert.equal(summary.hosted_auth_category, 'security');
    assert.equal(summary.hosted_auth_signal, 'csrf_validation_failed');
    assert.equal(summary.hosted_auth_failure, true);
    assert.equal(summary.hosted_auth_terminal, true);
    assert.equal(summary.hosted_auth_credential_source, 'worker_native');
    assert.equal(summary.hosted_auth_config_error_count, 0);
    assert.equal(summary.hosted_auth_duration_ms, 42);
    assert.equal(summary.hosted_auth_upstream_discovery_cache_status, 'hit');
    assert.equal(summary.hosted_auth_token_verification_duration_ms, 11);
    assert.equal(summary.hosted_auth_jwks_fetch_duration_ms, 7);
    assert.equal(summary.hosted_auth_session_creation_duration_ms, 5);
    assert.equal(summary.hosted_auth_approval_duration_ms, 20);
  });

  it('derives counter-friendly success signals without free-form event parsing', () => {
    const summary = summarizeHostedAuthSignal({
      pathname: '/auth/start',
      ready: true,
      status: 'ready',
      outcome: 'redirect',
    });

    assert.equal(summary.hosted_auth_signal, 'ready_redirect');
    assert.equal(summary.hosted_auth_failure, false);
    assert.equal(summary.hosted_auth_terminal, false);
  });
});
