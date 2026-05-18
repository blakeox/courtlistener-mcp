#!/usr/bin/env node

/**
 * Validates that E2E_BASE_URL points at a Worker deployment that exposes the
 * hosted-auth readiness contract used by scheduled OAuth monitors.
 */

import { pathToFileURL } from 'node:url';
import {
  OAUTH_PROBE_USER_AGENT,
  assertHostedAuthReadinessContractOrDegraded,
  probeHostedAuthReadiness,
  resolveProbeConfig,
} from './e2e-remote-oauth-handshake.mjs';

const RECOMMENDED_BASE_URL = 'https://courtlistenermcp.blakeoxford.com';

export async function validateE2eOAuthTarget(env = process.env, fetchImpl = fetch) {
  const cfg = resolveProbeConfig(env);
  if ('skipReason' in cfg) {
    throw new Error(cfg.skipReason);
  }

  const probe = await probeHostedAuthReadiness(cfg.baseUrl, null, fetchImpl);
  try {
    const readiness = assertHostedAuthReadinessContractOrDegraded(probe);
    if (readiness.degraded) {
      return {
        ok: true,
        baseUrl: cfg.baseUrl,
        recommendedBaseUrl: RECOMMENDED_BASE_URL,
        probe,
        degraded: true,
        degradedReason:
          'Hosted-auth diagnostic headers were stripped (likely Cloudflare Bot Fight on GitHub Actions egress). Redirect contract still looks healthy.',
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = [
      `status=${probe.status}`,
      probe.hostedAuthStatus ? `x-hosted-auth-status=${probe.hostedAuthStatus}` : null,
      probe.hostedAuthError ? `x-hosted-auth-error=${probe.hostedAuthError}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    throw new Error(
      [
        `E2E OAuth target failed hosted-auth readiness validation for ${cfg.baseUrl}.`,
        message,
        diagnostics ? `Probe response: ${diagnostics}.` : null,
        `Update repository secret E2E_BASE_URL to the production custom domain (recommended: ${RECOMMENDED_BASE_URL}).`,
        'workers.dev aliases and stale deployments do not expose /auth/start with X-Hosted-Auth-* headers.',
        'If the host is correct, allow User-Agent courtlistener-mcp-oauth-probe/1.0 through Cloudflare Bot Fight / WAF for GitHub Actions egress.',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  return {
    ok: true,
    baseUrl: cfg.baseUrl,
    recommendedBaseUrl: RECOMMENDED_BASE_URL,
    probe,
  };
}

async function main() {
  const result = await validateE2eOAuthTarget();
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        baseUrl: result.baseUrl,
        hostedAuthRoute: result.probe.hostedAuthRoute,
        hostedAuthStatus: result.probe.hostedAuthStatus,
        userAgent: OAUTH_PROBE_USER_AGENT,
        ...(result.degraded ? { degraded: true, degradedReason: result.degradedReason } : {}),
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
