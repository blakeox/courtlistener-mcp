#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { buildSpaAuthPlaywrightCommand } from './spa-auth-suites.mjs';

const [bin, ...args] = buildSpaAuthPlaywrightCommand();
const result = spawnSync(bin, args, { stdio: 'inherit', env: process.env });

process.exit(result.status ?? 1);
