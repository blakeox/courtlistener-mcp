import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

function readJsonc(path: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1'),
  ) as Record<string, unknown>;
}

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

  it('keeps Durable Object lifecycle on the declarative exports path', () => {
    const authLimiter = readJsonc('wrangler.auth-limiter.jsonc');
    const edge = readJsonc('wrangler.edge.jsonc');
    const mcp = readJsonc('wrangler.mcp.jsonc');
    const exportsConfig = authLimiter.exports as Record<string, Record<string, string>>;
    const authCompatibilityFlags = (authLimiter.compatibility_flags ?? []) as string[];
    const edgeCompatibilityFlags = edge.compatibility_flags as string[];
    const mcpCompatibilityFlags = mcp.compatibility_flags as string[];

    assert.equal(authLimiter.migrations, undefined);
    assert.deepEqual(authCompatibilityFlags, []);
    assert.deepEqual(edgeCompatibilityFlags, ['nodejs_als', 'global_fetch_strictly_public']);
    assert.deepEqual(mcpCompatibilityFlags, ['nodejs_als']);
    for (const config of [
      'wrangler.edge.staging.jsonc',
      'wrangler.edge.test.jsonc',
      'wrangler.mcp.staging.jsonc',
      'wrangler.mcp.test.jsonc',
    ]) {
      const compatibilityFlags = readJsonc(config).compatibility_flags as string[];
      if (config.startsWith('wrangler.edge.')) {
        assert.deepEqual(compatibilityFlags, ['nodejs_als', 'global_fetch_strictly_public']);
      } else {
        assert.deepEqual(compatibilityFlags, ['nodejs_als']);
      }
    }
    assert.deepEqual(exportsConfig.AuthFailureLimiterDO, {
      type: 'durable-object',
      storage: 'sqlite',
    });
    assert.equal(edge.migrations, undefined);
  });
});
