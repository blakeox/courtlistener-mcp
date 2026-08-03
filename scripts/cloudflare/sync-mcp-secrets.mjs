#!/usr/bin/env node

/**
 * Ensure required secrets exist on the MCP worker script.
 *
 * Reads values from COURTLISTENER_API_KEY env var or `.dev.vars` when copying
 * from a local source. Skips secrets that are already present on the MCP worker.
 */

import {
  WRANGLER_MCP_CONFIG,
  formatSecretPutCommand,
  listWranglerSecrets,
  putWranglerSecret,
  resolveSecretValue,
} from './lib/wrangler-secrets.mjs';

const projectRoot = process.cwd();
const MCP_REQUIRED_SECRETS = ['COURTLISTENER_API_KEY'];

function logOk(message) {
  console.log(`✔ ${message}`);
}

function logFail(message) {
  console.error(`✖ ${message}`);
}

function main() {
  const mcpSecrets = listWranglerSecrets(projectRoot, WRANGLER_MCP_CONFIG);
  if (!mcpSecrets.ok) {
    logFail(`Could not list MCP worker secrets: ${mcpSecrets.error}`);
    process.exit(1);
  }

  let changed = false;

  for (const secret of MCP_REQUIRED_SECRETS) {
    if (mcpSecrets.names.includes(secret)) {
      logOk(`MCP worker already has ${secret}.`);
      continue;
    }

    const value = resolveSecretValue(secret, { projectRoot });
    if (!value) {
      logFail(
        `No local ${secret} available to copy. MCP worker direct secret ownership is required; Edge fallback is not supported.`,
      );
      process.exit(1);
    }

    const result = putWranglerSecret(projectRoot, {
      secret,
      configFile: WRANGLER_MCP_CONFIG,
      value,
    });
    if (!result.ok) {
      logFail(
        `Failed to set ${secret} on MCP worker via ${formatSecretPutCommand(secret, WRANGLER_MCP_CONFIG)}`,
      );
      if (result.stderr) {
        console.error(result.stderr);
      }
      if (result.stdout) {
        console.error(result.stdout);
      }
      process.exit(1);
    }

    changed = true;
    logOk(`Copied ${secret} to MCP worker (${WRANGLER_MCP_CONFIG}).`);
  }

  if (!changed) {
    logOk('No MCP worker secret changes were required.');
  }
}

try {
  main();
} catch (error) {
  logFail(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
