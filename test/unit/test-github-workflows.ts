import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

function read(relativePath: string): string {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function listWorkflowFiles(): string[] {
  return fs.readdirSync(new URL('../../.github/workflows/', import.meta.url));
}

describe('GitHub workflow hardening', () => {
  it('treats src/auth changes as auth-related CI changes', () => {
    const workflow = read('../../.github/workflows/ci.yml');
    const authBlock = workflow.match(/auth_related:\n((?:\s+- .*\n)+)/);

    assert.ok(authBlock, 'auth_related block should exist');
    assert.match(authBlock[1], /'src\/auth\/\*\*'/);
  });

  it('publishes only from the validated release workflow', () => {
    const releaseWorkflow = read('../../.github/workflows/release.yml');
    const workflowFiles = listWorkflowFiles();
    const strayPublishWorkflows = workflowFiles.filter((file) =>
      /^publish(?:\s.*)?\.ya?ml$/iu.test(file),
    );

    assert.deepEqual(
      strayPublishWorkflows,
      [],
      `unexpected publish workflow files: ${strayPublishWorkflows.join(', ')}`,
    );
    assert.match(releaseWorkflow, /publish-npm:/);
    assert.match(releaseWorkflow, /publish-docker:/);
    assert.match(releaseWorkflow, /github-release:/);
    assert.match(releaseWorkflow, /needs: \[validate-release, docker-test\]/);
    assert.match(releaseWorkflow, /workflow_dispatch:/);
    assert.match(releaseWorkflow, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
    assert.match(releaseWorkflow, /Configure npm publish auth/);
    assert.match(
      releaseWorkflow,
      /No NPM_TOKEN secret configured; attempting npm trusted publishing via GitHub OIDC/,
    );
  });

  it('makes the default test script include the SPA auth suites', () => {
    const packageJson = JSON.parse(read('../../package.json')) as {
      scripts?: Record<string, string>;
      ['lint-staged']?: Record<string, string[]>;
    };

    assert.equal(
      packageJson.scripts?.test,
      'npm run test:unit && npm run test:integration && npm run test:spa:auth && npm run test:spa:e2e:auth',
    );
    assert.equal(
      packageJson.scripts?.['test:all'],
      'npm run test:unit && npm run test:integration && npm run test:spa:auth && npm run test:spa:e2e:auth',
    );
    assert.deepEqual(packageJson['lint-staged']?.['**/*.{ts,tsx,js,mjs,cjs}'], [
      'pnpm exec eslint --fix --max-warnings=0 --no-warn-ignored',
      'pnpm exec prettier --write',
    ]);
    assert.deepEqual(packageJson['lint-staged']?.['**/*.{json,md,yml,yaml}'], [
      'pnpm exec prettier --write',
    ]);
    assert.equal(fs.existsSync(new URL('../../.lintstagedrc.json', import.meta.url)), false);
  });

  it('uses the TypeScript inspector runners from CI and release workflows', () => {
    const releaseWorkflow = read('../../.github/workflows/release.yml');
    const inspectorWorkflow = read('../../.github/workflows/inspector-integration.yml');

    assert.match(releaseWorkflow, /pnpm run ci:test-inspector:extended/);
    assert.doesNotMatch(releaseWorkflow, /ci-test-mcp-inspector\.js/);
    assert.match(inspectorWorkflow, /pnpm run ci:test-inspector/);
    assert.doesNotMatch(inspectorWorkflow, /ci-test-mcp-inspector\.js/);
  });

  it('does not advertise an unpublished npm install path in the README', () => {
    const readme = read('../../README.md');

    assert.doesNotMatch(readme, /npx courtlistener-mcp/);
    assert.match(readme, /Run locally from a checkout/);
    assert.match(readme, /node dist\/index\.js --setup/);
    assert.match(readme, /node dist\/http\.js/);
  });

  it('runs browser auth coverage in CI on the dedicated browser-auth job', () => {
    const workflow = read('../../.github/workflows/ci.yml');

    assert.match(workflow, /browser-auth:/);
    assert.match(workflow, /Install Chromium/);
    assert.match(workflow, /pnpm run test:spa:e2e:auth/);
  });

  it('keeps the pre-push hook aligned with local deterministic auth confidence', () => {
    const lefthook = read('../../lefthook.yml');

    assert.match(lefthook, /pre-push:/);
    assert.match(lefthook, /pre-commit:/);
    assert.match(lefthook, /run: pnpm run ci:check:repo-hygiene:staged/);
    assert.match(lefthook, /run: pnpm lint-staged/);
    assert.match(lefthook, /run: pnpm run ci:local-gate/);
  });

  it('keeps CI and release workflows aligned on the shared local gate', () => {
    const ciWorkflow = read('../../.github/workflows/ci.yml');
    const releaseWorkflow = read('../../.github/workflows/release.yml');

    assert.match(ciWorkflow, /concurrency:/);
    assert.match(ciWorkflow, /cancel-in-progress: true/);
    assert.match(ciWorkflow, /pnpm run format:check/);
    assert.doesNotMatch(ciWorkflow, /pnpm install --frozen-lockfile --dry-run/);
    assert.match(ciWorkflow, /pnpm run ci:local-gate/);
    assert.match(releaseWorkflow, /concurrency:/);
    assert.match(releaseWorkflow, /pnpm run format:check/);
    assert.doesNotMatch(releaseWorkflow, /pnpm install --frozen-lockfile --dry-run/);
    assert.match(releaseWorkflow, /Run shared local gate/);
    assert.match(releaseWorkflow, /pnpm run ci:local-gate/);
    assert.match(releaseWorkflow, /pnpm run test:spa:e2e:auth/);
  });

  it('skips auto-assign reviewer requests when the only reviewer is the PR author', () => {
    const workflow = read('../../.github/workflows/auto-assign.yml');

    assert.match(workflow, /filter\(\(reviewer\) => reviewer !== pr\.user\?\.login\)/);
    assert.match(workflow, /All configured reviewers are the PR author/);
  });

  it('uses the v5 labeler configuration shape', () => {
    const config = read('../../.github/labeler.yml');

    assert.match(config, /changed-files:/);
    assert.match(config, /any-glob-to-any-file:/);
    assert.doesNotMatch(config, /^area\/docs:\n\s+- 'docs\/\*\*'/m);
  });
});
