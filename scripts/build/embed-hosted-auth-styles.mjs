#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cssPath = resolve(repoRoot, 'src/server/hosted-auth-page-styles.css');
const outputPath = resolve(repoRoot, 'src/server/hosted-auth-page-styles.generated.ts');

const css = readFileSync(cssPath, 'utf8');
const generated =
  `// Auto-generated from hosted-auth-page-styles.css — do not edit.\n` +
  `export const AUTH_PAGE_STYLES = ${JSON.stringify(css)};\n`;

writeFileSync(outputPath, generated, 'utf8');
console.log(`Wrote ${outputPath} (${css.length} chars)`);
