import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const APPROVED_VERSIONS = {
  '@cloudflare/workers-oauth-provider': '0.10.3',
  '@modelcontextprotocol/server': '2.0.0',
  agents: '0.21.0',
} as const;

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >;
}

function resolvedVersion(packageName: string): string {
  const packageJsonPath = new URL(
    `../../node_modules/${packageName}/package.json`,
    import.meta.url,
  );
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: string };
  assert.ok(packageJson.version, `${packageName} must expose a package version`);
  return packageJson.version;
}

describe('MCP SDK compatibility lane', () => {
  it('pins the approved production compatibility packages', () => {
    const packageJson = readJson('../../package.json');
    const dependencies = packageJson.dependencies as Record<string, string>;
    const devDependencies = packageJson.devDependencies as Record<string, string>;
    const workerSource = fs.readFileSync(
      new URL('../../src/worker/courtlistener-mcp-v2.ts', import.meta.url),
      'utf8',
    );

    assert.equal(dependencies['@cloudflare/workers-oauth-provider'], '0.10.3');
    assert.equal('@modelcontextprotocol/client' in dependencies, false);
    assert.equal(dependencies['@modelcontextprotocol/server'], '2.0.0');
    assert.equal(dependencies.agents, '0.21.0');
    assert.equal('@modelcontextprotocol/inspector' in devDependencies, false);
    for (const nodeTelemetryPackage of [
      '@opentelemetry/api',
      '@opentelemetry/auto-instrumentations-node',
      '@opentelemetry/exporter-trace-otlp-http',
      '@opentelemetry/sdk-node',
      '@opentelemetry/sdk-trace-node',
    ]) {
      assert.equal(
        nodeTelemetryPackage in dependencies,
        false,
        `${nodeTelemetryPackage} must not be a Worker package dependency`,
      );
    }
    assert.match(workerSource, /from ['"]agents\/mcp\/server['"]/);
    assert.match(workerSource, /route:\s*['"]\/mcp['"]/);
    assert.match(workerSource, /legacy:\s*['"]reject['"]/);
    assert.match(workerSource, /CloudflareAsyncQueueWorkflow/);
    assert.doesNotMatch(workerSource, /AsyncToolWorkflowOrchestrator/);

    for (const [packageName, expectedVersion] of Object.entries(APPROVED_VERSIONS)) {
      assert.equal(resolvedVersion(packageName), expectedVersion, `${packageName} drifted`);
    }
  });

  it('keeps CI validation on the direct MCP v2 contract runner', () => {
    const packageJson = readJson('../../package.json');
    const scripts = packageJson.scripts as Record<string, string>;
    const source = fs.readFileSync(
      new URL('../../test/runners/ci-test-mcp-v2.ts', import.meta.url),
      'utf8',
    );

    assert.match(source, /server\/discover/);
    assert.match(source, /2026-07-28/);
    assert.match(scripts['ci:test:mcp-v2'], /ci-test-mcp-v2\.ts/);
    assert.match(scripts['ci:test:mcp-v2:extended'], /ci-test-mcp-v2\.ts --extended/);
    assert.equal(
      Object.keys(scripts).some((name) => name.includes('inspector')),
      false,
    );
  });

  it('keeps Cloudflare preflight and secret operations on the project-local Wrangler', () => {
    const setupSource = fs.readFileSync(
      new URL('../../scripts/cloudflare/check-setup.js', import.meta.url),
      'utf8',
    );
    const secretHelperSource = fs.readFileSync(
      new URL('../../scripts/cloudflare/lib/wrangler-secrets.mjs', import.meta.url),
      'utf8',
    );

    assert.match(setupSource, /runWrangler\(projectRoot, \['--version'\]\)/);
    assert.match(
      secretHelperSource,
      /process\.platform === 'win32' \? 'wrangler\.cmd' : 'wrangler'/,
    );
    assert.doesNotMatch(setupSource, /run\('pnpm', \['exec', 'wrangler'/);
    assert.doesNotMatch(secretHelperSource, /spawnSync\('pnpm', \['exec', 'wrangler'/);
    assert.doesNotMatch(secretHelperSource, /runWrangler\(projectRoot, \['secret', 'put'/);
    assert.doesNotMatch(setupSource, /`wrangler login`/);
    assert.doesNotMatch(setupSource, /console\.log\('  wrangler /);
    assert.match(
      setupSource,
      /kv:key put --binding OAUTH_KV oauth_contract_check ok -c wrangler\.edge\.jsonc/,
    );
  });

  it('uses the repository-pinned Wrangler through package scripts', () => {
    const packageJson = readJson('../../package.json');
    const scripts = packageJson.scripts as Record<string, string>;
    const cloudflareScripts = Object.entries(scripts).filter(
      ([name, command]) => /cloudflare|deploy|workers/.test(name) || /wrangler/.test(command),
    );

    for (const [name, command] of cloudflareScripts) {
      assert.doesNotMatch(command, /pnpm exec wrangler/);
      if (/^(dev:mcp|cloudflare:tail:(edge|mcp)|build:workers:test)$/.test(name)) {
        assert.match(command, /^wrangler\s/);
      }
    }
  });
});
