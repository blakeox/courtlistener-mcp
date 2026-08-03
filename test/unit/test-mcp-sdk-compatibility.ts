import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const APPROVED_VERSIONS = {
  '@cloudflare/workers-oauth-provider': '0.7.0',
  '@modelcontextprotocol/sdk': '1.29.0',
  agents: '0.13.2',
  '@modelcontextprotocol/inspector': '0.21.2',
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

    assert.equal(dependencies['@cloudflare/workers-oauth-provider'], '0.7.0');
    assert.equal(dependencies['@modelcontextprotocol/sdk'], '1.29.0');
    assert.equal(dependencies.agents, '0.13.2');
    assert.equal(devDependencies['@modelcontextprotocol/inspector'], '0.21.2');

    for (const [packageName, expectedVersion] of Object.entries(APPROVED_VERSIONS)) {
      assert.equal(resolvedVersion(packageName), expectedVersion, `${packageName} drifted`);
    }
  });

  it('keeps Inspector execution on the project-local binary', () => {
    const packageJson = readJson('../../package.json');
    const scripts = packageJson.scripts as Record<string, string>;
    const source = fs.readFileSync(
      new URL('../../scripts/dev/inspect.js', import.meta.url),
      'utf8',
    );

    assert.match(source, /pnpm.*exec.*mcp-inspector/);
    assert.match(scripts.inspect, /scripts\/dev\/inspect\.js/);
    assert.match(scripts['inspect:local'], /scripts\/dev\/inspect\.js local/);
  });
});
