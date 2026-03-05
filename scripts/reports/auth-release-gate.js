#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const outputPath =
  process.env.AUTH_RELEASE_GATE_OUTPUT || 'test-output/auth-release-gate/auth-release-gate.json';

function runCheck(id, command) {
  const [bin, ...args] = command;
  const startedAt = Date.now();
  const result = spawnSync(bin, args, {
    stdio: 'inherit',
    env: { ...process.env },
  });
  return {
    id,
    command: command.join(' '),
    durationMs: Date.now() - startedAt,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
  };
}

async function main() {
  const results = [
    runCheck('worker-oauth-contract', ['npx', 'tsx', '--test', 'test/unit/test-worker-oauth-routes.ts']),
    runCheck('worker-oauth-smoke', ['npx', 'tsx', '--test', 'test/unit/test-worker-oauth-smoke.ts']),
  ];

  const failed = results.filter((entry) => entry.status === 'failed');
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalChecks: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
    },
    results,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    const failureList = failed.map((entry) => entry.id).join(', ');
    console.error(`❌ Auth release gate failed: ${failureList}. Artifact: ${outputPath}`);
    process.exit(1);
  }

  console.log(`✅ Auth release gate passed (${results.length} checks). Artifact: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
