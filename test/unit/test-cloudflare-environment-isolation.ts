import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  findProvisioningPlaceholders,
  findResourceIdentifierOverlaps,
  validateEnvironmentMatrix,
} from '../../scripts/cloudflare/lib/environment-isolation.mjs';

describe('Cloudflare environment isolation', () => {
  it('validates the checked-in local/staging/production matrix', async () => {
    const matrix = (await import('../../infra/cloudflare/environment-matrix.json', {
      with: { type: 'json' },
    })) as { default: Record<string, unknown> };
    assert.deepEqual(validateEnvironmentMatrix(matrix.default), []);
  });

  it('detects exact resource identifier reuse', () => {
    const overlaps = findResourceIdentifierOverlaps(
      { kv: { id: 'production-kv' }, queue: 'production-queue' },
      [{ file: 'wrangler.mcp.staging.jsonc', value: { kv: { id: 'production-kv' } } }],
    );
    assert.deepEqual(overlaps, [
      { config: 'wrangler.mcp.staging.jsonc', path: 'kv.id', value: 'production-kv' },
    ]);
  });

  it('finds placeholders anywhere in a staging resource manifest', () => {
    assert.deepEqual(
      findProvisioningPlaceholders({ resources: [{ id: '__PROVISION_STAGING_QUEUE__' }] }),
      [{ path: 'resources[0].id', value: '__PROVISION_STAGING_QUEUE__' }],
    );
  });

  it('reports the current provisioned staging topology', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/cloudflare/check-environment-isolation.mjs', '--environment', 'staging', '--json'],
      { cwd: new URL('../..', import.meta.url), encoding: 'utf8' },
    );
    const receipt = JSON.parse(output) as { status: string; provisioning_status: string };
    assert.equal(receipt.status, 'ok');
    assert.equal(receipt.provisioning_status, 'provisioned');
  });
});
