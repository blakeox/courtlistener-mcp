#!/usr/bin/env node

import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const distDir = path.join(repoRoot, 'dist');

rmSync(distDir, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100,
});
