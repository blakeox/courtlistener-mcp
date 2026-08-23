#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const ownershipPath = join(projectRoot, 'infra/cloudflare/resource-ownership.json');
const terraformMainPath = join(projectRoot, 'infra/cloudflare/terraform/main.tf');

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main() {
  if (!existsSync(ownershipPath)) {
    fail(`Missing ownership manifest: ${ownershipPath}`);
    return;
  }
  if (!existsSync(terraformMainPath)) {
    fail(`Missing Terraform configuration: ${terraformMainPath}`);
    return;
  }

  const manifest = readJson(ownershipPath);
  const resources = Array.isArray(manifest.resources) ? manifest.resources : [];
  const errors = [];
  const ids = new Set();
  const allowedOwners = new Set(['wrangler', 'terraform', 'cloudflare_read_only_api']);

  for (const resource of resources) {
    if (!resource || typeof resource !== 'object') {
      errors.push('Every ownership resource must be an object.');
      continue;
    }
    if (typeof resource.id !== 'string' || resource.id.trim().length === 0) {
      errors.push('Every ownership resource must have a non-empty id.');
    } else if (ids.has(resource.id)) {
      errors.push(`Duplicate ownership resource id: ${resource.id}`);
    } else {
      ids.add(resource.id);
    }
    if (!allowedOwners.has(resource.owner)) {
      errors.push(`Unsupported owner for ${resource.id ?? '<unknown>'}: ${resource.owner}`);
    }
  }

  const requiredWranglerConfigs = [
    'wrangler.edge.jsonc',
    'wrangler.mcp.jsonc',
    'wrangler.auth-limiter.jsonc',
  ];
  for (const config of requiredWranglerConfigs) {
    if (
      !resources.some((resource) => resource.owner === 'wrangler' && resource.config === config)
    ) {
      errors.push(`Wrangler config is missing an ownership entry: ${config}`);
    }
  }

  const terraform = readFileSync(terraformMainPath, 'utf8');
  const terraformResources = [...terraform.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"/g)].map(
    ([, kind, name]) => ({ kind, address: `terraform.${name}` }),
  );
  const prohibitedKinds = new Set(
    Array.isArray(manifest.prohibited_terraform_kinds) ? manifest.prohibited_terraform_kinds : [],
  );
  for (const resource of terraformResources) {
    if (prohibitedKinds.has(resource.kind)) {
      errors.push(
        `Terraform resource ${resource.kind} is prohibited; Wrangler owns Worker/runtime resources.`,
      );
    }
    if (!resources.some((entry) => entry.id === resource.address && entry.owner === 'terraform')) {
      errors.push(`Terraform resource lacks an explicit ownership entry: ${resource.address}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) fail(error);
    return;
  }

  const result = {
    schema_version: manifest.schema_version,
    status: 'ok',
    terraform_resources: terraformResources,
    wrangler_configs: requiredWranglerConfigs,
    apply_policy: 'import_first_no_destructive_plan',
  };
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('✔ Cloudflare IaC ownership boundary is valid.');
    console.log(`  Wrangler configs: ${requiredWranglerConfigs.length}`);
    console.log(`  Terraform resources: ${terraformResources.length}`);
    console.log('  Terraform policy: import first, review for a non-destructive plan.');
  }
}

main();
