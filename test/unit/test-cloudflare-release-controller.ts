import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildReceipt,
  buildTrafficArgs,
  parseDeploymentVersions,
  parseVersionId,
  requireValidOptions,
} from '../../scripts/cloudflare/release-controller.mjs';

describe('Cloudflare release controller contracts', () => {
  it('extracts version IDs from Wrangler output with package-manager warnings', () => {
    assert.equal(
      parseVersionId(
        '[WARN] pnpm override warning\nUploaded worker\nWorker Version ID: 123e4567-e89b-12d3-a456-426614174000',
      ),
      '123e4567-e89b-12d3-a456-426614174000',
    );
  });

  it('reads the latest active deployment while ignoring wrapper output', () => {
    const output = `[WARN] pnpm warning\n[
      {
        "id": "deployment-old",
        "versions": [
          { "version_id": "stale-version", "percentage": 100 }
        ]
      },
      {
        "id": "deployment-latest",
        "versions": [
          { "version_id": "prior-version", "percentage": 100 }
        ]
      }
    ]`;

    assert.deepEqual(parseDeploymentVersions(output), [
      { version_id: 'prior-version', percentage: 100 },
    ]);
  });

  it('creates an explicit two-version canary split', () => {
    assert.deepEqual(buildTrafficArgs('new-version', 'prior-version', 1), [
      'new-version@1',
      'prior-version@99',
    ]);
    assert.throws(() => buildTrafficArgs('same', 'same', 1), /must differ/iu);
  });

  it('rejects release operations without a pinned identity or source SHA', () => {
    const errors = requireValidOptions({
      environment: 'production',
      phase: 'promote',
      releaseId: 'release-1',
      sourceSha: 'not-a-sha',
      canaryPercent: 1,
    });

    assert.ok(errors.some((error) => error.includes('source-sha')));
  });

  it('records held canary traffic instead of falsely claiming promotion', () => {
    const directory = mkdtempSync(join(tmpdir(), 'courtlistener-release-probes-'));
    try {
      for (const name of [
        'health',
        'readiness',
        'oauth',
        'mcp_initialize',
        'direct_mcp_denial',
        'version_override',
      ]) {
        writeFileSync(join(directory, `${name}.json`), '{}');
      }
      const receipt = buildReceipt(
        {
          release_id: 'release-1',
          environment: 'staging',
          source_sha: 'a'.repeat(40),
          status: 'canary',
          canary_percent: 1,
          uploaded_version_ids: {
            auth_limiter: 'auth-version',
            edge: 'edge-version',
            mcp: 'mcp-version',
          },
          prior_version_ids: {
            auth_limiter: 'auth-prior',
            edge: 'edge-prior',
            mcp: 'mcp-prior',
          },
          kill_switches: ['MCP_ASYNC_QUEUE_ENABLED=false', 'CODEMODE_ENABLED=false'],
        },
        {
          decision: 'hold',
          approvedBy: 'operator',
          probeDirectory: directory,
        },
      );

      assert.equal(receipt.workers.mcp.traffic_percent, 1);
      assert.equal(receipt.decision, 'hold');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('records the prior versions as active after rollback', () => {
    const state = {
      release_id: 'release-1',
      environment: 'production',
      source_sha: 'a'.repeat(40),
      status: 'rolled-back',
      canary_percent: 1,
      uploaded_version_ids: {
        auth_limiter: 'auth-version',
        edge: 'edge-version',
        mcp: 'mcp-version',
      },
      prior_version_ids: {
        auth_limiter: 'auth-prior',
        edge: 'edge-prior',
        mcp: 'mcp-prior',
      },
      kill_switches: ['MCP_ASYNC_QUEUE_ENABLED=false', 'CODEMODE_ENABLED=false'],
    };

    const directory = mkdtempSync(join(tmpdir(), 'courtlistener-release-rollback-'));
    try {
      for (const name of [
        'health',
        'readiness',
        'oauth',
        'mcp_initialize',
        'direct_mcp_denial',
        'version_override',
      ]) {
        writeFileSync(join(directory, `${name}.json`), '{}');
      }

      const receipt = buildReceipt(state, {
        decision: 'rollback',
        approvedBy: 'operator',
        probeDirectory: directory,
      });

      assert.equal(receipt.workers.mcp.version_id, 'mcp-prior');
      assert.equal(receipt.workers.mcp.traffic_percent, 100);
      assert.equal(receipt.decision, 'rollback');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
