import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertAuthPortalHandoffContent,
  assertHostedAuthReadinessContract,
  probeHostedAuthReadiness,
  summarizeHostedAuthProbeResponse,
} from '../../scripts/testing/e2e-remote-oauth-handshake.mjs';

describe('remote oauth handshake probe', () => {
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
