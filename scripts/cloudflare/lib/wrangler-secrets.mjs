#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const WRANGLER_EDGE_CONFIG = 'wrangler.edge.jsonc';
export const WRANGLER_MCP_CONFIG = 'wrangler.mcp.jsonc';

export function runWrangler(projectRoot, args) {
  const result = spawnSync('wrangler', args, {
    encoding: 'utf-8',
    cwd: projectRoot,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

export function parseWranglerSecretList(stdout) {
  const trimmed = (stdout || '').trim();
  if (!trimmed) {
    return [];
  }

  const jsonStart = trimmed.indexOf('[');
  if (jsonStart === -1) {
    throw new Error('No JSON array found in wrangler secret list output');
  }

  const parsed = JSON.parse(trimmed.slice(jsonStart));
  return Array.isArray(parsed) ? parsed.map((entry) => entry.name).filter(Boolean) : [];
}

export function listWranglerSecrets(projectRoot, configFile) {
  const secretList = runWrangler(projectRoot, ['secret', 'list', '-c', configFile]);
  if (secretList.status !== 0) {
    return {
      ok: false,
      names: [],
      error:
        secretList.stderr || secretList.stdout || `wrangler secret list failed for ${configFile}`,
    };
  }

  try {
    return { ok: true, names: parseWranglerSecretList(secretList.stdout), error: null };
  } catch {
    return {
      ok: false,
      names: [],
      error: `Could not parse wrangler secret list output for ${configFile}`,
    };
  }
}

export function formatSecretPutCommand(secret, configFile) {
  return `wrangler secret put ${secret} -c ${configFile}`;
}

export function putWranglerSecret(projectRoot, { secret, configFile, value }) {
  const child = spawnSync('wrangler', ['secret', 'put', secret, '-c', configFile], {
    cwd: projectRoot,
    input: value,
    encoding: 'utf-8',
  });

  return {
    ok: (child.status ?? 1) === 0,
    stdout: (child.stdout || '').trim(),
    stderr: (child.stderr || '').trim(),
    status: child.status ?? 1,
  };
}

export function readDevVarsValue(projectRoot, key) {
  const devVarsPath = join(projectRoot, '.dev.vars');
  if (!existsSync(devVarsPath)) {
    return null;
  }

  const lines = readFileSync(devVarsPath, 'utf-8').split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const name = trimmed.slice(0, separator).trim();
    if (name !== key) {
      continue;
    }
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value || null;
  }

  return null;
}

export function resolveSecretValue(key, { projectRoot, env = process.env } = {}) {
  const fromEnv = env[key]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return readDevVarsValue(projectRoot, key);
}
