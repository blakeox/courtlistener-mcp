import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';

describe('Cloudflare IaC ownership boundary', () => {
  it('emits a valid import-first ownership receipt', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/cloudflare/check-iac-boundary.mjs', '--json'],
      { cwd: new URL('../..', import.meta.url), encoding: 'utf8' },
    );
    const receipt = JSON.parse(output) as {
      status: string;
      apply_policy: string;
      wrangler_configs: string[];
      terraform_resources: Array<{ kind: string; address: string }>;
    };

    assert.equal(receipt.status, 'ok');
    assert.equal(receipt.apply_policy, 'import_first_no_destructive_plan');
    assert.deepEqual(receipt.wrangler_configs, [
      'wrangler.edge.jsonc',
      'wrangler.mcp.jsonc',
      'wrangler.auth-limiter.jsonc',
    ]);
    assert.deepEqual(receipt.terraform_resources, [
      { kind: 'cloudflare_ruleset', address: 'terraform.oauth_probe_skip' },
    ]);
  });
});
