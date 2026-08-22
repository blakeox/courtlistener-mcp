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
    assert.match(releaseWorkflow, /github-release:/);
    assert.match(releaseWorkflow, /needs: validate-release/);
    assert.match(releaseWorkflow, /workflow_dispatch:/);
    assert.match(releaseWorkflow, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
    assert.match(releaseWorkflow, /Configure npm publish auth/);
    assert.match(
      releaseWorkflow,
      /No NPM_TOKEN secret configured; attempting npm trusted publishing via GitHub OIDC/,
    );
  });

  it('keeps Cloudflare promotion behind the dedicated release controller', () => {
    const workflow = read('../../.github/workflows/cloudflare-release.yml');

    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /environment:/);
    assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
    assert.match(workflow, /CLOUDFLARE_READONLY_API_TOKEN/);
    assert.match(workflow, /pnpm run cloudflare:check:types/);
    assert.match(workflow, /pnpm run cloudflare:check:live/);
    assert.match(workflow, /--phase upload/);
    assert.match(workflow, /--phase canary/);
    assert.match(workflow, /--phase promote/);
    assert.match(workflow, /inputs\.promote == true/);
    assert.match(workflow, /hashFiles\('release-state\.json'\) != ''/);
    assert.match(workflow, /probe_directory=release-probes-promoted/);
    assert.match(workflow, /decision=rollback/);
    assert.match(
      workflow,
      /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7/,
    );
  });

  it('does not eval secret-derived remote endpoint output in CI', () => {
    const workflows = [
      read('../../.github/workflows/ci.yml'),
      read('../../.github/workflows/performance.yml'),
    ];
    for (const workflow of workflows) {
      assert.doesNotMatch(workflow, /eval\s+"\$\(node scripts\/resolve-remote-endpoints\.js/);
      assert.match(workflow, /resolve-remote-endpoints\.js .*--field (?:mcpUrl|healthUrl)/);
    }
  });

  it('uses the repository health probe for local Worker readiness', () => {
    const workflows = [
      read('../../.github/workflows/ci.yml'),
      read('../../.github/workflows/release.yml'),
    ];
    for (const workflow of workflows) {
      assert.doesNotMatch(workflow, /curl -fsS http:\/\/127\.0\.0\.1:8787\/health/);
      assert.match(
        workflow,
        /LOCAL_HEALTH_URL=http:\/\/127\.0\.0\.1:8787 .*check-local-health\.mjs/,
      );
    }
  });

  it('uses the immutable Node 24 Gitleaks action instead of an ad-hoc download', () => {
    const workflow = read('../../.github/workflows/ci.yml');

    assert.match(
      workflow,
      /gitleaks\/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e # v3\.0\.0/,
    );
    assert.match(
      workflow,
      /security-check:[\s\S]*?fetch-depth:\s*0[\s\S]*?gitleaks\/gitleaks-action/,
    );
    assert.doesNotMatch(workflow, /Install Gitleaks/);
    assert.doesNotMatch(workflow, /gitleaks_8\.24\.3_linux_x64\.tar\.gz/);
  });

  it('keeps all workflow actions pinned to immutable commits', () => {
    const mutableActionRef = /uses:\s*[\w.-]+\/[\w.-]+@(?:v\d+|main|master|latest)(?:\s|$)/iu;

    for (const workflowFile of listWorkflowFiles()) {
      const workflow = read(`../../.github/workflows/${workflowFile}`);
      assert.doesNotMatch(workflow, mutableActionRef, `${workflowFile} has a mutable action ref`);
    }
  });

  it('removes direct production deployment shortcuts', () => {
    const packageJson = JSON.parse(read('../../package.json')) as {
      scripts?: Record<string, string>;
    };
    assert.equal(packageJson.scripts?.deploy, undefined);
    assert.equal(packageJson.scripts?.['deploy:workers'], undefined);
    assert.equal(packageJson.scripts?.['deploy:edge'], undefined);
    assert.equal(packageJson.scripts?.['deploy:mcp'], undefined);
    assert.equal(packageJson.scripts?.['deploy:auth-limiter'], undefined);
    assert.equal(packageJson.scripts?.['cloudflare:deploy'], undefined);
  });

  it('keeps numbered duplicate files visible to repository hygiene checks', () => {
    const gitignore = read('../../.gitignore');

    assert.doesNotMatch(gitignore, /^\* 2\.[^\n]*$/m);
  });

  it('makes the default test script include the SPA auth suites', () => {
    const packageJson = JSON.parse(read('../../package.json')) as {
      scripts?: Record<string, string>;
      ['lint-staged']?: Record<string, string[]>;
    };

    assert.equal(
      packageJson.scripts?.test,
      'pnpm run test:unit && pnpm run test:integration && pnpm run test:spa:auth && pnpm run test:spa:e2e:auth',
    );
    assert.equal(
      packageJson.scripts?.['test:all'],
      'pnpm run test:unit && pnpm run test:integration && pnpm run test:spa:auth && pnpm run test:spa:e2e:auth',
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

  it('runs real Worker load profiles instead of a placeholder performance command', () => {
    const packageJson = JSON.parse(read('../../package.json')) as {
      scripts?: Record<string, string>;
    };
    const performanceWorkflow = read('../../.github/workflows/performance.yml');
    const ciWorkflow = read('../../.github/workflows/ci.yml');

    assert.equal(
      packageJson.scripts?.['test:performance'],
      'node scripts/performance/load-profile-suite.js --light',
    );
    assert.match(performanceWorkflow, /pnpm run ci:load-profile-suite/);
    assert.match(performanceWorkflow, /check-local-health\.mjs/);
    assert.doesNotMatch(performanceWorkflow, /echo ['"]Performance tests available/);
    assert.doesNotMatch(ciWorkflow, /pnpm run test:performance/);
  });

  it('uses the direct MCP v2 contract runner from the release workflow', () => {
    const releaseWorkflow = read('../../.github/workflows/release.yml');

    assert.match(releaseWorkflow, /pnpm run ci:test:mcp-v2:extended/);
    assert.doesNotMatch(releaseWorkflow, /Inspector|mcp-inspector|ci-test-inspector/);
    assert.doesNotMatch(releaseWorkflow, /pnpm add -g @modelcontextprotocol\/inspector/);
    assert.equal(
      fs.existsSync(new URL('../../.github/workflows/inspector-integration.yml', import.meta.url)),
      false,
    );
  });

  it('does not advertise an unpublished npm install path in the README', () => {
    const readme = read('../../README.md');

    assert.doesNotMatch(readme, /npx courtlistener-mcp/);
    assert.match(readme, /Run locally from a checkout/);
    assert.match(readme, /node dist\/index\.js --setup/);
    assert.match(readme, /pnpm run dev:workers/);
    assert.doesNotMatch(readme, /node dist\/http\.js/);
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

    assert.match(ciWorkflow, /name: Smoke Tests/);
    assert.match(ciWorkflow, /node-version-file: '\.nvmrc'/);
    assert.match(ciWorkflow, /full-validation:/);
    assert.match(ciWorkflow, /concurrency:/);
    assert.match(ciWorkflow, /cancel-in-progress: true/);
    assert.match(ciWorkflow, /pnpm run format:check/);
    assert.doesNotMatch(ciWorkflow, /pnpm install --frozen-lockfile --dry-run/);
    assert.match(ciWorkflow, /pnpm run test:unit/);
    assert.match(ciWorkflow, /pnpm run ci:local-gate/);
    assert.match(ciWorkflow, /run: pnpm audit --audit-level=moderate/);
    assert.doesNotMatch(ciWorkflow, /pnpm audit --audit-level=moderate \|\|/);
    assert.match(releaseWorkflow, /concurrency:/);
    assert.match(releaseWorkflow, /pnpm run format:check/);
    assert.doesNotMatch(releaseWorkflow, /pnpm install --frozen-lockfile --dry-run/);
    assert.match(releaseWorkflow, /Run shared local gate/);
    assert.match(releaseWorkflow, /pnpm run ci:local-gate/);
    assert.match(
      releaseWorkflow,
      /pnpm run cloudflare:check:environments -- --require-provisioned/,
    );
    assert.match(releaseWorkflow, /pnpm run cloudflare:check:types/);
    assert.match(releaseWorkflow, /pnpm run cloudflare:check:live/);
    assert.match(releaseWorkflow, /CLOUDFLARE_READONLY_API_TOKEN/);
    assert.doesNotMatch(ciWorkflow, /pnpm run cloudflare:check:live/);
    assert.match(releaseWorkflow, /pnpm run test:spa:e2e:auth/);
    assert.doesNotMatch(releaseWorkflow, /All 25 tools tested successfully/);
    assert.match(releaseWorkflow, /manifest\.capabilities\?\.tools\?\.tools/);
    assert.doesNotMatch(releaseWorkflow, /Array\.isArray\(manifest\.tools\)/);
    assert.match(releaseWorkflow, /resolve-remote-endpoints\.js .*--field mcpUrl/);
    assert.doesNotMatch(releaseWorkflow, /SERVER_URL="\$REMOTE_SERVER_URL"/);
  });

  it('runs the Workers-runtime harness in CI and release validation', () => {
    const ciWorkflow = read('../../.github/workflows/ci.yml');
    const releaseWorkflow = read('../../.github/workflows/release.yml');

    for (const workflow of [ciWorkflow, releaseWorkflow]) {
      assert.match(workflow, /test\/tsconfig\.workers\.json/);
      assert.match(workflow, /wrangler types test\/worker-configuration\.d\.ts/);
      assert.match(workflow, /pnpm run test:workers/);
    }
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
