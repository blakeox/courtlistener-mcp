#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { buildSpaVitestCommand } from './spa-auth-suites.mjs';

const extraArgs = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
const [bin, ...args] = buildSpaVitestCommand(extraArgs);
const result = spawnSync(bin, args, { stdio: 'inherit', env: process.env });

process.exit(result.status ?? 1);
