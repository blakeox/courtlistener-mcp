#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { normalizeRemoteEndpoints } from '../resolve-remote-endpoints.js';

const outputPath =
  process.env.AUTH_RELEASE_GATE_OUTPUT || 'test-output/auth-release-gate/auth-release-gate.json';

export function resolveDeployedOauthBaseUrl(env = process.env) {
  const explicitBaseUrl = env.OAUTH_BASE_URL?.trim();
  if (explicitBaseUrl) {
    return normalizeRemoteEndpoints(explicitBaseUrl).baseUrl;
  }

  const remoteServerUrl = env.REMOTE_SERVER_URL?.trim();
  if (remoteServerUrl) {
    return normalizeRemoteEndpoints(remoteServerUrl).baseUrl;
  }

  return null;
}

export function buildChecks(env = process.env) {
  const deployedOauthBaseUrl = resolveDeployedOauthBaseUrl(env);
  const checks = [
    {
      id: 'worker-oauth-contract',
      command: ['pnpm', 'exec', 'tsx', '--test', 'test/unit/test-worker-oauth-routes.ts'],
    },
    {
      id: 'worker-oauth-smoke',
      command: ['pnpm', 'exec', 'tsx', '--test', 'test/unit/test-worker-oauth-smoke.ts'],
    },
    {
      id: 'worker-auth-handoff',
      command: ['pnpm', 'exec', 'tsx', '--test', 'test/unit/test-worker-auth-handoff-routes.ts'],
    },
    {
      id: 'hosted-auth-html-security',
      command: [
        'pnpm',
        'exec',
        'tsx',
        '--test',
        'test/unit/test-hosted-auth-html-security.ts',
        'test/unit/test-worker-response-runtime.ts',
      ],
    },
    {
      id: 'worker-auth-runtime',
      command: [
        'pnpm',
        'exec',
        'tsx',
        '--test',
        'test/unit/test-worker-oauth-authorize.ts',
        'test/unit/test-worker-oauth-provider-runtime.ts',
        'test/unit/test-prevalidated-oauth-context.ts',
        'test/unit/test-worker-oauth-frontdoor-rate-limit.ts',
        'test/unit/test-oauth-authorization-completion.ts',
        'test/unit/test-worker-core-routes.ts',
        'test/unit/test-worker-ui-session-runtime.ts',
      ],
    },
    {
      id: 'spa-auth-vitest',
      command: ['pnpm', 'run', 'test:spa:auth'],
    },
    {
      id: 'spa-auth-playwright',
      command: ['pnpm', 'run', 'test:spa:e2e:auth'],
    },
  ];

  if (deployedOauthBaseUrl) {
    checks.push({
      id: 'deployed-oauth-handshake',
      command: ['node', 'scripts/testing/e2e-remote-oauth-handshake.mjs'],
      env: { OAUTH_BASE_URL: deployedOauthBaseUrl },
    });
    checks.push({
      id: 'deployed-oauth-approve-contract',
      command: ['pnpm', 'exec', 'tsx', 'scripts/testing/probe-production-approve-contract.ts'],
      env: { OAUTH_BASE_URL: deployedOauthBaseUrl },
    });
  } else {
    checks.push({
      id: 'deployed-oauth-handshake',
      command: ['node', 'scripts/testing/e2e-remote-oauth-handshake.mjs'],
      skipReason:
        'Set OAUTH_BASE_URL or REMOTE_SERVER_URL to require hosted OAuth handshake validation.',
    });
    checks.push({
      id: 'deployed-oauth-approve-contract',
      command: ['pnpm', 'exec', 'tsx', 'scripts/testing/probe-production-approve-contract.ts'],
      skipReason:
        'Set OAUTH_BASE_URL or REMOTE_SERVER_URL to require hosted OAuth approve/CSP contract validation.',
    });
  }

  return checks;
}

function runCheck(entry) {
  if (entry.skipReason) {
    return {
      id: entry.id,
      command: entry.command.join(' '),
      durationMs: 0,
      status: 'skipped',
      exitCode: 0,
      reason: entry.skipReason,
    };
  }

  const [bin, ...args] = entry.command;
  const startedAt = Date.now();
  const result = spawnSync(bin, args, {
    stdio: 'inherit',
    env: { ...process.env, ...(entry.env || {}) },
  });
  return {
    id: entry.id,
    command: entry.command.join(' '),
    durationMs: Date.now() - startedAt,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
  };
}

export async function main() {
  const deployedOauthBaseUrl = resolveDeployedOauthBaseUrl();
  const results = buildChecks().map(runCheck);

  const failed = results.filter((entry) => entry.status === 'failed');
  const skipped = results.filter((entry) => entry.status === 'skipped');
  const passed = results.filter((entry) => entry.status === 'passed');
  const report = {
    generatedAt: new Date().toISOString(),
    deployedOauthBaseUrl,
    summary: {
      totalChecks: results.length,
      passed: passed.length,
      failed: failed.length,
      skipped: skipped.length,
    },
    results,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    const failureList = failed.map((entry) => entry.id).join(', ');
    console.error(`❌ Auth release gate failed: ${failureList}. Artifact: ${outputPath}`);
    process.exit(1);
  }

  const skippedSuffix = skipped.length > 0 ? `, ${skipped.length} skipped` : '';
  console.log(
    `✅ Auth release gate passed (${passed.length} passed${skippedSuffix}). Artifact: ${outputPath}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
