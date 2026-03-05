#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const outputPath =
  process.env.RELEASE_READINESS_GATE_OUTPUT || 'test-output/release-readiness/release-readiness-gate.json';
const policyMode = (process.env.RELEASE_READINESS_GATE_POLICY_MODE || 'fail').trim().toLowerCase();

function parseArgs(argv) {
  const options = {
    baselinePath: process.env.PERF_BASELINE_FILE || 'performance-data/load-profile-baseline.json',
    currentPath: process.env.PERF_CURRENT_FILE || 'performance-data/load-profile-current.json',
    baseUrl: process.env.RELEASE_READINESS_BASE_URL || process.env.MCP_REMOTE_URL || 'http://127.0.0.1:3002',
    light: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--light') options.light = true;
    else if (arg === '--baseline') options.baselinePath = argv[++i] || options.baselinePath;
    else if (arg.startsWith('--baseline=')) options.baselinePath = arg.split('=')[1] || options.baselinePath;
    else if (arg === '--current') options.currentPath = argv[++i] || options.currentPath;
    else if (arg.startsWith('--current=')) options.currentPath = arg.split('=')[1] || options.currentPath;
    else if (arg === '--base-url') options.baseUrl = argv[++i] || options.baseUrl;
    else if (arg.startsWith('--base-url=')) options.baseUrl = arg.split('=')[1] || options.baseUrl;
  }

  return options;
}

function runCheck(id, command, env = {}) {
  const [bin, ...args] = command;
  const startedAt = Date.now();
  const result = spawnSync(bin, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
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
  const options = parseArgs(process.argv.slice(2));
  const loadProfileArgs = ['--base-url', options.baseUrl];
  if (options.light) loadProfileArgs.push('--light');

  const results = [
    runCheck(
      'runtime-safety-gate',
      ['pnpm', 'run', 'ci:runtime-safety-gate'],
      { RUNTIME_SAFETY_GATE_POLICY_MODE: policyMode },
    ),
    runCheck('performance-load-profile-baseline', [
      'pnpm',
      'run',
      'ci:load-profile-suite',
      '--',
      ...loadProfileArgs,
      '--output',
      options.baselinePath,
    ]),
    runCheck('performance-load-profile-current', [
      'pnpm',
      'run',
      'ci:load-profile-suite',
      '--',
      ...loadProfileArgs,
      '--output',
      options.currentPath,
    ]),
    runCheck(
      'performance-regression-gate',
      ['pnpm', 'run', 'ci:perf-gate', '--', options.baselinePath, options.currentPath],
      {
        PERF_GATE_POLICY_MODE: policyMode,
        PERF_GATE_REQUIRE_FILES: 'true',
        PERF_BASELINE_FILE: options.baselinePath,
        PERF_CURRENT_FILE: options.currentPath,
      },
    ),
  ];

  const failed = results.filter((entry) => entry.status === 'failed');
  const report = {
    generatedAt: new Date().toISOString(),
    policyMode,
    artifacts: {
      runtimeSafety: process.env.RUNTIME_SAFETY_GATE_OUTPUT || 'test-output/runtime-parity/runtime-safety-gate.json',
      runtimeParityCertification:
        process.env.RUNTIME_PARITY_ARTIFACT || 'test-output/runtime-parity/certification-report.json',
      perfBaseline: options.baselinePath,
      perfCurrent: options.currentPath,
    },
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
      console.warn(`⚠️ Release readiness gate warning: ${failureList}. Artifact: ${outputPath}`);
      process.exit(0);
    }
    console.error(`❌ Release readiness gate failed: ${failureList}. Artifact: ${outputPath}`);
    process.exit(1);
  }

  console.log(`✅ Release readiness gate passed (${results.length} checks). Artifact: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
