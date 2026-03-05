#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const outputPath =
  process.env.RUNTIME_SAFETY_GATE_OUTPUT || 'test-output/runtime-parity/runtime-safety-gate.json';
const policyMode = (process.env.RUNTIME_SAFETY_GATE_POLICY_MODE || 'fail').trim().toLowerCase();

const checks = [
  {
    id: 'runtime-parity-certification',
    command: ['pnpm', 'run', 'test:runtime-parity:certify'],
  },
  {
    id: 'session-runtime-contract',
    command: ['npx', 'tsx', '--test', 'test/unit/test-session-runtime-compatibility.ts'],
  },
  {
    id: 'security-auth-contract',
    command: ['npx', 'tsx', '--test', 'test/unit/test-worker-security.ts'],
  },
  {
    id: 'gateway-auth-contract',
    command: ['npx', 'tsx', '--test', 'test/unit/test-mcp-gateway-auth.ts'],
  },
  {
    id: 'async-workflow-contract',
    command: ['npx', 'tsx', '--test', 'test/unit/test-async-tool-execution-service.ts'],
  },
  {
    id: 'breaking-change-gates',
    command: ['npx', 'tsx', '--test', 'test/unit/test-breaking-change-governance.ts'],
  },
];

function runCheck(entry) {
  const [bin, ...args] = entry.command;
  const startedAt = Date.now();
  const result = spawnSync(bin, args, {
    stdio: 'inherit',
    env: process.env,
  });
  return {
    id: entry.id,
    command: entry.command.join(' '),
    durationMs: Date.now() - startedAt,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
  };
}

async function main() {
  const results = checks.map(runCheck);
  const failed = results.filter((entry) => entry.status === 'failed');

  const report = {
    generatedAt: new Date().toISOString(),
    policyMode,
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
    if (policyMode === 'warn') {
      console.warn(`⚠️ Runtime safety gate warning: ${failureList}. Artifact: ${outputPath}`);
      process.exit(0);
    }
    console.error(`❌ Runtime safety gate failed: ${failureList}. Artifact: ${outputPath}`);
    process.exit(1);
  }

  console.log(`✅ Runtime safety gate passed (${results.length} checks). Artifact: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
