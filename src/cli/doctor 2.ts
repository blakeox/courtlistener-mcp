#!/usr/bin/env node

/**
 * Diagnostic command for the CourtListener MCP Server.
 * Checks environment, connectivity, and dependencies.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = 'https://www.courtlistener.com/api/rest/v4/';
const FETCH_TIMEOUT_MS = 10_000;
const MIN_NODE_MAJOR = 18;

// Required production dependencies from package.json
const REQUIRED_DEPS = ['@modelcontextprotocol/sdk', 'zod', 'express'];

interface CheckResult {
  label: string;
  ok: boolean;
}

// ── individual checks ──────────────────────────────────────────────

function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1), 10);
  const ok = major >= MIN_NODE_MAJOR;
  return {
    label: ok
      ? `Node.js version: ${version} (requires >= ${MIN_NODE_MAJOR})`
      : `Node.js version: ${version} — requires >= ${MIN_NODE_MAJOR}`,
    ok,
  };
}

function checkApiKey(): CheckResult {
  const key = process.env.COURTLISTENER_API_KEY;
  const ok = typeof key === 'string' && key.length > 0;
  return {
    label: ok ? 'API key configured' : 'COURTLISTENER_API_KEY is not set',
    ok,
  };
}

async function checkApiReachable(): Promise<CheckResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(BASE_URL, { signal: controller.signal });
    clearTimeout(timer);
    return {
      label: `CourtListener API reachable (HTTP ${res.status})`,
      ok: res.status < 500,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { label: `CourtListener API unreachable — ${msg}`, ok: false };
  }
}

async function checkApiAuth(): Promise<CheckResult> {
  const key = process.env.COURTLISTENER_API_KEY;
  if (!key) {
    return { label: 'API key validation skipped (no key)', ok: false };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(BASE_URL, {
      headers: { Authorization: `Token ${key}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ok = res.status >= 200 && res.status < 400;
    return {
      label: ok
        ? 'API key valid (authenticated successfully)'
        : `API key rejected (HTTP ${res.status})`,
      ok,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { label: `API auth check failed — ${msg}`, ok: false };
  }
}

function checkDependencies(): CheckResult[] {
  const results: CheckResult[] = [];
  const nodeModules = join(process.cwd(), 'node_modules');
  for (const dep of REQUIRED_DEPS) {
    const depPath = join(nodeModules, dep);
    const ok = existsSync(depPath);
    results.push({
      label: ok ? `Dependency present: ${dep}` : `Missing dependency: ${dep}`,
      ok,
    });
  }
  return results;
}

// ── runner ──────────────────────────────────────────────────────────

export async function runDoctor(): Promise<void> {
  console.log('\n🔍 CourtListener MCP Server — Diagnostics\n');

  const results: CheckResult[] = [];

  // Synchronous checks
  results.push(checkNodeVersion());
  results.push(checkApiKey());

  // Network checks
  results.push(await checkApiReachable());
  results.push(await checkApiAuth());

  // Dependency checks
  results.push(...checkDependencies());

  // Print results
  const passed = results.filter((r) => r.ok).length;
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`  ${icon} ${r.label}`);
  }

  console.log(`\n  ${passed}/${results.length} checks passed\n`);

  process.exit(passed === results.length ? 0 : 1);
}
