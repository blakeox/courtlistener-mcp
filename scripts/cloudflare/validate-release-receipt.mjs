#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REQUIRED_WORKERS = ['auth_limiter', 'edge', 'mcp'];
const REQUIRED_PROBES = [
  'health',
  'readiness',
  'oauth',
  'mcp_discover',
  'direct_mcp_denial',
  'version_override',
];
const REQUIRED_KILL_SWITCHES = ['MCP_ASYNC_QUEUE_ENABLED=false', 'CODEMODE_ENABLED=false'];
const SECRET_KEY_PATTERN = /(secret|token|password|api[_-]?key|authorization|cookie)/iu;

function parseArgs(argv) {
  const fileIndex = argv.indexOf('--file');
  return { file: fileIndex >= 0 ? argv[fileIndex + 1] : undefined };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function addRequiredString(errors, object, key, path) {
  if (!isNonEmptyString(object?.[key])) errors.push(`${path}.${key} must be a non-empty string.`);
}

function validateReleaseReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return ['Receipt must be a JSON object.'];
  }

  if (receipt.schema_version !== 'v1') errors.push('schema_version must be v1.');
  if (!['staging', 'production'].includes(receipt.environment)) {
    errors.push('environment must be staging or production.');
  }
  if (!/^[a-f0-9]{40}$/iu.test(String(receipt.source_sha ?? ''))) {
    errors.push('source_sha must be a 40-character hexadecimal commit SHA.');
  }
  addRequiredString(errors, receipt, 'release_id', 'receipt');
  addRequiredString(errors, receipt, 'workflow_run', 'receipt');
  if (receipt.deployment_authority !== 'github-actions') {
    errors.push('deployment_authority must be github-actions.');
  }

  const toolchain = receipt.toolchain;
  for (const key of ['node', 'pnpm', 'wrangler', 'compatibility_date']) {
    addRequiredString(errors, toolchain, key, 'toolchain');
  }
  if (
    isNonEmptyString(toolchain?.compatibility_date) &&
    !/^\d{4}-\d{2}-\d{2}$/.test(toolchain.compatibility_date)
  ) {
    errors.push('toolchain.compatibility_date must use YYYY-MM-DD.');
  }

  for (const worker of REQUIRED_WORKERS) {
    const entry = receipt.workers?.[worker];
    if (!entry || typeof entry !== 'object') {
      errors.push(`workers.${worker} must be an object.`);
      continue;
    }
    addRequiredString(errors, entry, 'version_id', `workers.${worker}`);
    if (String(entry.version_id ?? '').includes('<')) {
      errors.push(`workers.${worker}.version_id must not contain a placeholder.`);
    }
    if (
      !Number.isInteger(entry.traffic_percent) ||
      entry.traffic_percent < 0 ||
      entry.traffic_percent > 100
    ) {
      errors.push(`workers.${worker}.traffic_percent must be an integer from 0 through 100.`);
    }
  }

  for (const key of ['routes_hash', 'bindings_hash', 'resource_manifest']) {
    addRequiredString(errors, receipt.topology, key, 'topology');
  }
  for (const probe of REQUIRED_PROBES) addRequiredString(errors, receipt.probes, probe, 'probes');

  addRequiredString(errors, receipt.queue, 'consumer_owner', 'queue');
  if (!Number.isInteger(receipt.queue?.max_retries) || receipt.queue.max_retries < 1) {
    errors.push('queue.max_retries must be a positive integer.');
  }
  addRequiredString(errors, receipt.queue, 'dead_letter_queue', 'queue');
  if (
    typeof receipt.queue?.oldest_message_age_seconds !== 'number' ||
    !Number.isFinite(receipt.queue.oldest_message_age_seconds) ||
    receipt.queue.oldest_message_age_seconds < 0
  ) {
    errors.push('queue.oldest_message_age_seconds must be a non-negative number.');
  }

  const rollback = receipt.rollback;
  if (!Array.isArray(rollback?.target_version_ids) || rollback.target_version_ids.length !== 3) {
    errors.push('rollback.target_version_ids must contain auth-limiter, edge, and MCP targets.');
  } else if (rollback.target_version_ids.some((value) => !isNonEmptyString(value))) {
    errors.push('rollback.target_version_ids must contain only non-empty strings.');
  }
  if (rollback?.migration_reversal_allowed !== false) {
    errors.push('rollback.migration_reversal_allowed must be false.');
  }
  for (const killSwitch of REQUIRED_KILL_SWITCHES) {
    if (!Array.isArray(rollback?.kill_switches) || !rollback.kill_switches.includes(killSwitch)) {
      errors.push(`rollback.kill_switches must include ${killSwitch}.`);
    }
  }

  if (!['promote', 'hold', 'rollback'].includes(receipt.decision)) {
    errors.push('decision must be promote, hold, or rollback.');
  }
  addRequiredString(errors, receipt, 'approved_by', 'receipt');
  addRequiredString(errors, receipt, 'recorded_at', 'receipt');
  if (isNonEmptyString(receipt.recorded_at) && Number.isNaN(Date.parse(receipt.recorded_at))) {
    errors.push('recorded_at must be an ISO-8601 timestamp.');
  }

  const serialized = JSON.stringify(receipt);
  if (SECRET_KEY_PATTERN.test(serialized)) {
    errors.push('Receipt must not contain secret-bearing field names or credentials.');
  }
  return errors;
}

function readReceipt(file) {
  if (!file || !existsSync(file))
    throw new Error(`Receipt file does not exist: ${file ?? '<missing>'}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function main() {
  const { file } = parseArgs(process.argv.slice(2));
  try {
    const errors = validateReleaseReceipt(readReceipt(file));
    if (errors.length > 0) {
      console.error(JSON.stringify({ schema_version: 'v1', status: 'error', errors }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ schema_version: 'v1', status: 'ok', file }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();

export { validateReleaseReceipt };
