#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findProvisioningPlaceholders,
  findResourceIdentifierOverlaps,
  validateEnvironmentMatrix,
} from './lib/environment-isolation.mjs';

const projectRoot = process.cwd();
const matrixPath = join(projectRoot, 'infra/cloudflare/environment-matrix.json');
const productionConfigs = [
  'wrangler.edge.jsonc',
  'wrangler.mcp.jsonc',
  'wrangler.auth-limiter.jsonc',
];

function parseArgs() {
  const environmentIndex = process.argv.indexOf('--environment');
  return {
    environment:
      environmentIndex >= 0 ? (process.argv[environmentIndex + 1] ?? 'staging') : 'staging',
    json: process.argv.includes('--json'),
    requireProvisioned: process.argv.includes('--require-provisioned'),
  };
}

function parseJsonc(file) {
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(source);
}

function emit(receipt, json) {
  if (json) {
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }
  const symbol = receipt.status === 'ok' ? '✔' : '⚠';
  console.log(`${symbol} Cloudflare environment isolation: ${receipt.status}.`);
  for (const warning of receipt.warnings ?? []) console.log(`  ${warning}`);
  for (const error of receipt.errors ?? []) console.error(`  ✖ ${error}`);
}

function main() {
  const args = parseArgs();
  const matrix = parseJsonc(matrixPath);
  const errors = validateEnvironmentMatrix(matrix);
  const warnings = [];
  const entry = matrix.environments?.[args.environment];

  if (!entry) errors.push(`Unknown environment: ${args.environment}`);

  if (args.environment === 'staging' && entry) {
    if (args.requireProvisioned && entry.provisioning_status !== 'provisioned') {
      errors.push(
        `Staging provisioning_status must be provisioned before release validation (found ${String(entry.provisioning_status ?? 'missing')}).`,
      );
    }
    if (args.requireProvisioned) {
      for (const placeholder of findProvisioningPlaceholders(entry.resource_ids ?? {})) {
        errors.push(
          `Staging resource identifier is still a provisioning placeholder at ${placeholder.path}: ${placeholder.value}`,
        );
      }
    }
    const missing = (entry.configs ?? []).filter((file) => !existsSync(join(projectRoot, file)));
    if (missing.length > 0) {
      const message = `Staging configuration is not provisioned: ${missing.join(', ')}`;
      if (args.requireProvisioned) errors.push(message);
      else warnings.push(`${message}; no Cloudflare deployment is permitted.`);
    } else {
      const productionConfig = productionConfigs.reduce((all, file) => {
        all[file] = parseJsonc(join(projectRoot, file));
        return all;
      }, {});
      const stagingConfigs = entry.configs.map((file) => ({
        file,
        value: parseJsonc(join(projectRoot, file)),
      }));
      const overlaps = findResourceIdentifierOverlaps(productionConfig, stagingConfigs);
      for (const overlap of overlaps) {
        errors.push(
          `Staging identifier overlaps production at ${overlap.config}:${overlap.path}: ${overlap.value}`,
        );
      }
    }
  }

  const receipt = {
    schema_version: 'v1',
    status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'template' : 'ok',
    environment: args.environment,
    matrix: matrixPath,
    provisioning_status: entry?.provisioning_status ?? 'unknown',
    warnings,
    errors,
    production_configs: productionConfigs,
  };
  emit(receipt, args.json);
  if (errors.length > 0) process.exitCode = 1;
}

main();
