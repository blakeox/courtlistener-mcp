import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateReleaseReceipt } from '../../scripts/cloudflare/validate-release-receipt.mjs';

function validReceipt() {
  return {
    schema_version: 'v1',
    release_id: 'release-test-1',
    environment: 'staging',
    source_sha: 'a'.repeat(40),
    workflow_run: '12345',
    deployment_authority: 'github-actions',
    toolchain: {
      node: '24.18.0',
      pnpm: '10.14.0',
      wrangler: '4.124.0',
      compatibility_date: '2026-08-18',
    },
    workers: {
      auth_limiter: { version_id: 'auth-v1', traffic_percent: 0 },
      edge: { version_id: 'edge-v1', traffic_percent: 0 },
      mcp: { version_id: 'mcp-v1', traffic_percent: 0 },
    },
    topology: {
      routes_hash: 'routes-hash',
      bindings_hash: 'bindings-hash',
      resource_manifest: 'artifact/resource-manifest.json',
    },
    probes: {
      health: 'artifact/health.json',
      readiness: 'artifact/readiness.json',
      oauth: 'artifact/oauth.json',
      mcp_discover: 'artifact/mcp-discover.json',
      direct_mcp_denial: 'artifact/direct-mcp-denial.json',
      version_override: 'artifact/version-override.json',
    },
    queue: {
      consumer_owner: 'worker:courtlistener-mcp-mcp',
      max_retries: 3,
      dead_letter_queue: 'courtlistener-mcp-staging-async-dlq',
      oldest_message_age_seconds: 0,
    },
    rollback: {
      target_version_ids: ['auth-prior', 'edge-prior', 'mcp-prior'],
      migration_reversal_allowed: false,
      kill_switches: ['MCP_ASYNC_QUEUE_ENABLED=false', 'CODEMODE_ENABLED=false'],
    },
    decision: 'hold',
    approved_by: 'operator@example.com',
    recorded_at: '2026-08-03T12:00:00.000Z',
  };
}

describe('Cloudflare release receipt validator', () => {
  it('accepts a complete redacted receipt', () => {
    assert.deepEqual(validateReleaseReceipt(validReceipt()), []);
  });

  it('rejects incomplete or unsafe promotion evidence', () => {
    const receipt = validReceipt() as Record<string, unknown>;
    delete (receipt.workers as Record<string, unknown>).mcp;
    (receipt.rollback as Record<string, unknown>).migration_reversal_allowed = true;
    (receipt as Record<string, unknown>).COURTLISTENER_API_KEY = 'must-not-appear';

    const errors = validateReleaseReceipt(receipt);
    assert.ok(errors.some((error) => error.includes('workers.mcp')));
    assert.ok(errors.some((error) => error.includes('migration_reversal_allowed')));
    assert.ok(errors.some((error) => error.includes('secret-bearing')));
  });
});
