import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildChecks,
  resolveDeployedOauthBaseUrl,
} from '../../scripts/reports/auth-release-gate.js';

describe('auth-release-gate', () => {
  it('skips deployed handshake when no hosted remote env is configured', () => {
    const checks = buildChecks({});
    const deployedHandshake = checks.find((entry) => entry.id === 'deployed-oauth-handshake');

    assert.ok(deployedHandshake);
    assert.equal(
      deployedHandshake.skipReason,
      'Set OAUTH_BASE_URL or REMOTE_SERVER_URL to require hosted OAuth handshake validation.',
    );
  });

  it('includes the Worker auth and browser coverage checks', () => {
    const checks = buildChecks({});

    assert.deepEqual(
      checks.map((entry) => entry.id),
      [
        'worker-oauth-contract',
        'worker-oauth-smoke',
        'worker-auth-handoff',
        'hosted-auth-html-security',
        'worker-auth-runtime',
        'spa-auth-vitest',
        'spa-auth-playwright',
        'deployed-oauth-handshake',
        'deployed-oauth-approve-contract',
      ],
    );

    const authRuntime = checks.find((entry) => entry.id === 'worker-auth-runtime');
    const spaAuthVitest = checks.find((entry) => entry.id === 'spa-auth-vitest');
    const spaAuthPlaywright = checks.find((entry) => entry.id === 'spa-auth-playwright');

    assert.ok(authRuntime);
    assert.deepEqual(authRuntime.command, [
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
    ]);

    assert.ok(spaAuthVitest);
    assert.deepEqual(spaAuthVitest.command, ['pnpm', 'run', 'test:spa:auth']);

    assert.ok(spaAuthPlaywright);
    assert.deepEqual(spaAuthPlaywright.command, ['pnpm', 'run', 'test:spa:e2e:auth']);
  });

  it('derives the hosted auth base URL from REMOTE_SERVER_URL', () => {
    assert.equal(
      resolveDeployedOauthBaseUrl({ REMOTE_SERVER_URL: 'https://example.com/mcp' }),
      'https://example.com',
    );
  });

  it('wires the deployed handshake check when a hosted remote env is configured', () => {
    const checks = buildChecks({ REMOTE_SERVER_URL: 'https://example.com/health' });
    const deployedHandshake = checks.find((entry) => entry.id === 'deployed-oauth-handshake');
    const deployedApproveContract = checks.find(
      (entry) => entry.id === 'deployed-oauth-approve-contract',
    );

    assert.ok(deployedHandshake);
    assert.equal(deployedHandshake.skipReason, undefined);
    assert.deepEqual(deployedHandshake.command, [
      'node',
      'scripts/testing/e2e-remote-oauth-handshake.mjs',
    ]);
    assert.deepEqual(deployedHandshake.env, { OAUTH_BASE_URL: 'https://example.com' });

    assert.ok(deployedApproveContract);
    assert.equal(deployedApproveContract.skipReason, undefined);
    assert.deepEqual(deployedApproveContract.command, [
      'pnpm',
      'exec',
      'tsx',
      'scripts/testing/probe-production-approve-contract.ts',
    ]);
    assert.deepEqual(deployedApproveContract.env, { OAUTH_BASE_URL: 'https://example.com' });
  });
});
