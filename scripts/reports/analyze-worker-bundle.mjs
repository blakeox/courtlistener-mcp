#!/usr/bin/env node
/**
 * Analyze the Cloudflare Worker bundle produced by wrangler.
 *
 * Usage:
 *   node scripts/reports/analyze-worker-bundle.mjs
 *   node scripts/reports/analyze-worker-bundle.mjs --json
 *   WORKER_BUNDLE_MAX_KIB=3500 node scripts/reports/analyze-worker-bundle.mjs --check
 *
 * Requires: wrangler on PATH; analyzes wrangler.edge.jsonc by default.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const jsonOut = args.has('--json');
const check = args.has('--check');
const keepTmp = args.has('--keep-tmp');

function readSpaPayloadBytes(repoRoot) {
  const jsPath = join(repoRoot, '.spa-dist/app/spa.js');
  const cssPath = join(repoRoot, '.spa-dist/app/spa.css');
  let jsBytes = 0;
  let cssBytes = 0;
  try {
    jsBytes = statSync(jsPath).size;
  } catch {
    // SPA not built yet.
  }
  try {
    cssBytes = statSync(cssPath).size;
  } catch {
    // CSS optional until first Vite build.
  }
  return {
    jsBytes,
    cssBytes,
    totalBytes: jsBytes + cssBytes,
    fileBytes: jsBytes + cssBytes,
  };
}

function bucketSource(path) {
  if (path.includes('spa-assets')) {
    return { id: 'spa-inline', label: 'Inlined SPA (spa-assets.ts)' };
  }
  const pnpm = path.match(/\.pnpm\/([^/]+)@/);
  if (pnpm) {
    const pkg = pnpm[1];
    if (pkg === 'zod') return { id: 'zod', label: 'zod' };
    if (pkg.startsWith('zod-to-json-schema'))
      return { id: 'zod-to-json-schema', label: 'zod-to-json-schema' };
    if (pkg.startsWith('agents')) return { id: 'agents', label: 'agents (McpAgent + partyserver)' };
    if (pkg === 'ajv' || pkg.startsWith('ajv-')) return { id: 'ajv', label: 'ajv (+ formats)' };
    if (pkg === 'mime-db') return { id: 'mime-db', label: 'mime-db (via agents → mimetext)' };
    if (pkg === 'mimetext') return { id: 'mimetext', label: 'mimetext' };
    if (pkg.startsWith('@cloudflare+workers-oauth-provider')) {
      return { id: 'oauth-provider', label: '@cloudflare/workers-oauth-provider' };
    }
    if (pkg === 'jose') return { id: 'jose', label: 'jose' };
    return { id: `pkg:${pkg}`, label: pkg };
  }
  if (path.includes('/src/server/')) {
    const file = path.split('/src/server/')[1] ?? path;
    if (file.startsWith('worker-auth-handoff-routes')) {
      return { id: 'src:auth-handoff', label: 'src/server/worker-auth-handoff-routes.ts' };
    }
    return { id: 'src:server', label: 'src/server/*' };
  }
  if (path.includes('/src/')) {
    const segment = path.split('/src/')[1]?.split('/')[0] ?? 'src';
    return { id: `src:${segment}`, label: `src/${segment}/*` };
  }
  return { id: 'other', label: 'other' };
}

function analyzeSourceMap(mapPath) {
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  const buckets = new Map();
  const topFiles = [];

  if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) {
    throw new Error(
      'Source map missing sourcesContent; re-run with a full wrangler dry-run bundle.',
    );
  }

  map.sources.forEach((source, index) => {
    const content = map.sourcesContent[index];
    if (!content) return;
    const bytes = Buffer.byteLength(content);
    const { id, label } = bucketSource(source);
    const existing = buckets.get(id) ?? { id, label, bytes: 0, files: 0 };
    existing.bytes += bytes;
    existing.files += 1;
    buckets.set(id, existing);
    topFiles.push({
      bytes,
      source: source
        .replace(/^webpack:\/\/courtlistener-mcp\//, '')
        .replace(/.*\/\.pnpm\//, '.pnpm/'),
    });
  });

  topFiles.sort((a, b) => b.bytes - a.bytes);
  const totalSourceBytes = [...buckets.values()].reduce((sum, row) => sum + row.bytes, 0);
  return {
    buckets: [...buckets.values()].sort((a, b) => b.bytes - a.bytes),
    topFiles: topFiles.slice(0, 25),
    totalSourceBytes,
  };
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function main() {
  const repoRoot = process.cwd();
  const spa = readSpaPayloadBytes(repoRoot);
  const outDir = mkdtempSync(join(tmpdir(), 'clmcp-worker-bundle-'));

  try {
    execFileSync(
      'wrangler',
      ['deploy', '--dry-run', '--outdir', outDir, '-c', 'wrangler.edge.jsonc'],
      {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );
  } catch (error) {
    if (!keepTmp) rmSync(outDir, { recursive: true, force: true });
    throw error;
  }

  const workerPath = join(outDir, 'worker.js');
  const mapPath = join(outDir, 'worker.js.map');
  const workerBytes = statSync(workerPath).size;
  const analysis = analyzeSourceMap(mapPath);

  const report = {
    deploy: {
      workerJsBytes: workerBytes,
      workerJsKiB: workerBytes / 1024,
    },
    spa: {
      jsBytes: spa.jsBytes,
      cssBytes: spa.cssBytes,
      inlinedPayloadBytes: spa.totalBytes,
      generatedFileBytes: spa.fileBytes,
    },
    composition: analysis.buckets.map((row) => ({
      id: row.id,
      label: row.label,
      bytes: row.bytes,
      kiB: row.bytes / 1024,
      percent: analysis.totalSourceBytes > 0 ? (100 * row.bytes) / analysis.totalSourceBytes : 0,
      files: row.files,
    })),
    topSourceFiles: analysis.topFiles.map((row) => ({
      bytes: row.bytes,
      kiB: row.bytes / 1024,
      source: row.source,
    })),
    notes: [
      'AuthFailureLimiterDO and CourtListenerMCP share this single worker.js upload.',
      'DO free-tier duration errors often correlate with cold-starting this full bundle.',
      'mime-db is pulled by agents → mimetext, not by Express in the Worker graph.',
    ],
  };

  if (!keepTmp) {
    rmSync(outDir, { recursive: true, force: true });
  } else {
    report.tmpOutDir = outDir;
  }

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Worker bundle audit\n');
    console.log(`  worker.js (minified):     ${formatKiB(report.deploy.workerJsBytes)}`);
    console.log(
      `  SPA assets (.spa-dist):   ${formatKiB(report.spa.inlinedPayloadBytes)} (JS ${formatKiB(report.spa.jsBytes)} + CSS ${formatKiB(report.spa.cssBytes)})`,
    );
    console.log('  (served via Workers Assets binding, not in worker.js)\n');
    console.log('Composition (source map, pre-minify):\n');
    for (const row of report.composition.slice(0, 20)) {
      console.log(
        `  ${formatKiB(row.bytes).padStart(10)}  ${row.percent.toFixed(1).padStart(5)}%  ${row.label}`,
      );
    }
    console.log('\nLargest individual sources:\n');
    for (const row of report.topSourceFiles.slice(0, 15)) {
      console.log(`  ${formatKiB(row.bytes).padStart(10)}  ${row.source.slice(0, 100)}`);
    }
    console.log('\nNotes:');
    for (const note of report.notes) {
      console.log(`  - ${note}`);
    }
    if (report.tmpOutDir) {
      console.log(`\nKept bundle at ${report.tmpOutDir}`);
    }
  }

  if (check) {
    const maxKiB = Number.parseInt(process.env.WORKER_BUNDLE_MAX_KIB ?? '3600', 10);
    const maxBytes = maxKiB * 1024;
    if (workerBytes > maxBytes) {
      console.error(
        `\nWorker bundle ${formatKiB(workerBytes)} exceeds WORKER_BUNDLE_MAX_KIB=${maxKiB} (${formatKiB(maxBytes)}).`,
      );
      process.exit(1);
    }
  }
}

main();
