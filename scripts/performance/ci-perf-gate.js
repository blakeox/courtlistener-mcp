#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fromEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function envFlag(name) {
  const value = process.env[name];
  return typeof value === 'string' && /^(1|true|yes|on)$/i.test(value.trim());
}

function resolveInputs(args) {
  const positionals = [];
  const passthrough = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--baseline=')) {
      positionals[0] = arg.slice('--baseline='.length);
      continue;
    }
    if (arg === '--baseline') {
      positionals[0] = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--current=')) {
      positionals[1] = arg.slice('--current='.length);
      continue;
    }
    if (arg === '--current') {
      positionals[1] = args[i + 1];
      i += 1;
      continue;
    }
    if (positionals.length < 2 && !arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }
    passthrough.push(arg);
  }

  const baselinePath =
    positionals[0] ||
    fromEnv('PERF_BASELINE_FILE', 'PERF_BASELINE_PATH', 'BASELINE_FILE', 'BASELINE_PATH');
  const currentPath =
    positionals[1] ||
    fromEnv('PERF_CURRENT_FILE', 'PERF_CURRENT_PATH', 'CURRENT_FILE', 'CURRENT_PATH');

  return { baselinePath, currentPath, passthrough };
}

function main() {
  const { baselinePath, currentPath, passthrough } = resolveInputs(process.argv.slice(2));
  const requireFiles = envFlag('PERF_GATE_REQUIRE_FILES');

  if (!baselinePath || !currentPath) {
    if (requireFiles) {
      console.error(
        `❌ Performance gate requires baseline/current path (baseline="${baselinePath || 'unset'}", current="${currentPath || 'unset'}").`
      );
      process.exit(1);
    }
    console.log(
      `⏭️  Skipping performance gate: missing baseline/current path (baseline="${baselinePath || 'unset'}", current="${currentPath || 'unset'}").`
    );
    process.exit(0);
  }

  if (!fs.existsSync(baselinePath) || !fs.existsSync(currentPath)) {
    if (requireFiles) {
      console.error(
        `❌ Performance gate files required but missing (baseline exists=${fs.existsSync(baselinePath)}, current exists=${fs.existsSync(currentPath)}).`
      );
      process.exit(1);
    }
    console.log(
      `⏭️  Skipping performance gate: file missing (baseline exists=${fs.existsSync(baselinePath)}, current exists=${fs.existsSync(currentPath)}).`
    );
    process.exit(0);
  }

  const compareScript = path.join(__dirname, 'compare-performance.js');
  const result = spawnSync(process.execPath, [compareScript, baselinePath, currentPath, ...passthrough], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`❌ Failed to run compare-performance.js: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main();
