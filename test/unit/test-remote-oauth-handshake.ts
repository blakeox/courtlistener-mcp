import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertAuthPortalHandoffContent,
  assertHostedAuthReadinessContract,
  assertHostedAuthReadinessContractOrDegraded,
  isDegradedHostedAuthRedirect,
  probeHostedAuthReadiness,
  registerOAuthClient,
  registrationRetryDelayMs,
  resolveProbeConfig,
  summarizeHostedAuthProbeResponse,
} from '../../scripts/testing/e2e-remote-oauth-handshake.mjs';
import { validateE2eOAuthTarget } from '../../scripts/testing/validate-e2e-oauth-target.mjs';

describe('remote oauth handshake probe', () => {
  it('validates E2E OAuth targets that expose hosted-auth readiness headers', async () => {
    const result = await validateE2eOAuthTarget(
      { OAUTH_BASE_URL: 'https://worker.example' },
      async () =>
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://issuer.example/authorize',
            'x-hosted-auth-ready': 'true',
            'x-hosted-auth-status': 'ready',
            'x-hosted-auth-route': 'auth-start',
            'x-hosted-auth-outcome': 'redirect',
            'x-hosted-auth-category': 'ok',
            'x-hosted-auth-correlation-id': 'corr_e2e_target',
            'x-hosted-auth-config-error-count': '0',
            'x-hosted-auth-duration-ms': '5',
            'x-hosted-auth-upstream-discovery-duration-ms': '2',
          },
        }),
    );
    assert.equal(result.probe.hostedAuthRoute, 'auth-start');
  });

  it('accepts degraded CI redirects when hosted-auth headers are stripped', () => {
    const probe = summarizeHostedAuthProbeResponse(
      new Response(null, {
        status: 302,
        headers: {
          location:
            'https://auth.example.com/oidc/auth?client_id=probe&redirect_uri=https%3A%2F%2Fworker.example%2Fauth%2Fcallback',
        },
      }),
    );
    assert.equal(isDegradedHostedAuthRedirect(probe), true);
    const previous = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = 'true';
    try {
      assert.equal(assertHostedAuthReadinessContractOrDegraded(probe).degraded, true);
    } finally {
      if (previous === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = previous;
      }
    }
  });

  it('rejects E2E OAuth targets without hosted-auth readiness headers', async () => {
    await assert.rejects(
      () =>
        validateE2eOAuthTarget(
          { OAUTH_BASE_URL: 'https://courtlistener-mcp.blakeoxford.workers.dev' },
          async () => new Response('Not Found', { status: 404 }),
        ),
      /E2E OAuth target failed hosted-auth readiness validation/,
    );
  });

  it('resolves a preconfigured client id for CI probes', () => {
    const cfg = resolveProbeConfig({
      OAUTH_BASE_URL: 'https://worker.example',
      E2E_OAUTH_CLIENT_ID: 'probe-client-1',
      OAUTH_REGISTRATION_RETRIES: '5',
    });
    assert.ok(!('skipReason' in cfg));
    assert.equal(cfg.clientId, 'probe-client-1');
    assert.equal(cfg.registrationRetries, 5);
  });

  it('retries transient registration failures before succeeding', async () => {
    const attempts: number[] = [];
    const registration = await registerOAuthClient('https://worker.example/register', {
      clientOrigin: 'https://chatgpt.com',
      redirectUri: 'https://oauth-debug.example/callback',
      scope: 'legal:read',
      retries: 3,
      sleep: async () => {},
      fetchImpl: async () => {
        attempts.push(attempts.length + 1);
        if (attempts.length < 3) {
          return new Response('Forbidden', { status: 403 });
        }
        return new Response(
          JSON.stringify({
            client_id: 'client-registered',
          }),
          {
            status: 201,
            headers: {
              'content-type': 'application/json',
              location: 'https://worker.example/register/client-registered',
            },
          },
        );
      },
    });

    assert.equal(registration.client_id, 'client-registered');
    assert.equal(attempts.length, 3);
  });

  it('uses exponential backoff between registration retries', () => {
    assert.equal(registrationRetryDelayMs(0), 1000);
    assert.equal(registrationRetryDelayMs(1), 2000);
    assert.equal(registrationRetryDelayMs(2), 4000);
  });

  it('probes the hosted-auth readiness redirect contract', async () => {
    let requestedUrl: string | null = null;
    const probe = await probeHostedAuthReadiness(
      'https://worker.example',
      'https://worker.example/authorize?client_id=client-1',
      async (input) => {
        requestedUrl = String(input);
        return new Response(null, {
          status: 302,
          headers: {
            location: 'https://issuer.example/authorize?client_id=worker-client',
            'x-hosted-auth-ready': 'true',
            'x-hosted-auth-status': 'ready',
            'x-hosted-auth-route': 'auth-start',
            'x-hosted-auth-outcome': 'redirect',
            'x-hosted-auth-category': 'ok',
            'x-hosted-auth-correlation-id': 'corr_ready_123',
            'x-hosted-auth-credential-source': 'worker_native',
            'x-hosted-auth-config-error-count': '0',
            'x-hosted-auth-duration-ms': '12',
            'x-hosted-auth-upstream-discovery-duration-ms': '7',
          },
        });
      },
    );

    assert.equal(
      requestedUrl,
      'https://worker.example/auth/start?continue=1&return_to=https%3A%2F%2Fworker.example%2Fauthorize%3Fclient_id%3Dclient-1',
    );
    assert.equal(probe.ready, true);
    assert.equal(probe.location, 'https://issuer.example/authorize?client_id=worker-client');
    assert.doesNotThrow(() => assertHostedAuthReadinessContract(probe));
  });

  it('accepts a non-redirect failure contract from the readiness probe', () => {
    const probe = summarizeHostedAuthProbeResponse(
      new Response('Hosted auth is temporarily unavailable', {
        status: 200,
        headers: {
          'x-hosted-auth-ready': 'false',
          'x-hosted-auth-status': 'upstream_discovery_timeout',
          'x-hosted-auth-error': 'upstream_discovery_timeout',
          'x-hosted-auth-route': 'auth-start',
          'x-hosted-auth-outcome': 'unavailable',
          'x-hosted-auth-category': 'timeout',
          'x-hosted-auth-correlation-id': 'corr_fail_456',
          'x-hosted-auth-config-error-count': '0',
          'x-hosted-auth-duration-ms': '31',
          'x-hosted-auth-upstream-discovery-duration-ms': '30',
        },
      }),
    );

    assert.equal(probe.ready, false);
    assert.doesNotThrow(() => assertHostedAuthReadinessContract(probe));
  });

  it('fails when the readiness probe omits the correlation id', () => {
    const probe = summarizeHostedAuthProbeResponse(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://issuer.example/authorize',
          'x-hosted-auth-ready': 'true',
          'x-hosted-auth-status': 'ready',
          'x-hosted-auth-route': 'auth-start',
          'x-hosted-auth-outcome': 'redirect',
          'x-hosted-auth-category': 'ok',
          'x-hosted-auth-config-error-count': '0',
          'x-hosted-auth-duration-ms': '9',
          'x-hosted-auth-upstream-discovery-duration-ms': '4',
        },
      }),
    );

    assert.throws(() => assertHostedAuthReadinessContract(probe), /Correlation-Id/);
  });

  it('allows fail-closed auth portal guidance only after a failed readiness probe', () => {
    const html =
      '<h1>Worker-native auth is required for this flow.</h1><p>The target worker did not advertise same-origin hosted auth for this request.</p>';

    assert.doesNotThrow(() => assertAuthPortalHandoffContent(html, { readinessProbeReady: false }));
    assert.throws(
      () => assertAuthPortalHandoffContent(html, { readinessProbeReady: true }),
      /handoff UI/,
    );
  });
});
