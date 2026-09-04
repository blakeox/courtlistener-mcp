#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_CONTROL_IDS = [
  'edge_mcp_binding_failures',
  'deployment_version_mismatch',
  'worker_5xx_rate',
  'auth_limiter_unavailable',
  'async_queue_oldest_message',
  'async_dlq_messages',
  'readiness_or_configuration_drift',
];

const REQUIRED_DENIED_CAPABILITIES = [
  'deploy',
  'rollback',
  'create',
  'update',
  'delete',
  'purge',
  'rotate_secret',
];

export function validateObservabilityControls(manifest, { requireProviderActive = false } = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return ['Manifest must be a JSON object.'];
  if (manifest.schema_version !== 'v1') errors.push('schema_version must be v1.');
  if (manifest.source_of_truth !== 'cloudflare_native_observability') {
    errors.push('source_of_truth must be cloudflare_native_observability.');
  }
  if (manifest.operator_surface?.mode !== 'read_only') {
    errors.push('operator_surface.mode must be read_only.');
  }

  const denied = new Set(manifest.operator_surface?.denied_capabilities ?? []);
  for (const capability of REQUIRED_DENIED_CAPABILITIES) {
    if (!denied.has(capability)) errors.push(`Missing denied operator capability: ${capability}`);
  }

  const forbiddenFields = manifest.redaction?.forbidden_fields;
  if (!Array.isArray(forbiddenFields) || forbiddenFields.length === 0) {
    errors.push('redaction.forbidden_fields must be a non-empty array.');
  }
  if (manifest.retention?.payload_retention !== 'prohibited') {
    errors.push('retention.payload_retention must be prohibited.');
  }

  const controls = Array.isArray(manifest.controls) ? manifest.controls : [];
  const ids = new Set();
  for (const control of controls) {
    if (!control || typeof control !== 'object') {
      errors.push('Every control must be an object.');
      continue;
    }
    if (typeof control.id !== 'string' || control.id.length === 0) {
      errors.push('Every control must have a non-empty id.');
      continue;
    }
    if (ids.has(control.id)) errors.push(`Duplicate control id: ${control.id}`);
    ids.add(control.id);
    if (!Array.isArray(control.worker_roles) || control.worker_roles.length === 0) {
      errors.push(`${control.id}: worker_roles must be non-empty.`);
    }
    if (typeof control.signal !== 'string' || control.signal.length === 0) {
      errors.push(`${control.id}: signal is required.`);
    }
    if (!Number.isInteger(control.window_seconds) || control.window_seconds <= 0) {
      errors.push(`${control.id}: window_seconds must be a positive integer.`);
    }
    if (
      !control.threshold ||
      typeof control.threshold.operator !== 'string' ||
      !Number.isFinite(control.threshold.value) ||
      typeof control.threshold.unit !== 'string' ||
      !Number.isInteger(control.threshold.minimum_events) ||
      control.threshold.minimum_events <= 0
    ) {
      errors.push(
        `${control.id}: threshold must define operator, value, unit, and minimum_events.`,
      );
    }
    if (typeof control.runbook !== 'string' || control.runbook.length === 0) {
      errors.push(`${control.id}: runbook is required.`);
    }
    if (typeof control.kill_switch !== 'string' || control.kill_switch.length === 0) {
      errors.push(`${control.id}: kill_switch is required.`);
    }
    if (!['pending', 'active'].includes(control.provider_state)) {
      errors.push(`${control.id}: provider_state must be pending or active.`);
    } else if (requireProviderActive && control.provider_state !== 'active') {
      errors.push(`${control.id}: provider control is not active.`);
    }
  }

  for (const id of REQUIRED_CONTROL_IDS) {
    if (!ids.has(id)) errors.push(`Missing required observability control: ${id}`);
  }
  return errors;
}

function parseArgs(argv) {
  const args = { manifestPath: 'infra/cloudflare/observability-controls.json', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--json') args.json = true;
    else if (arg === '--require-provider-active') args.requireProviderActive = true;
    else if (arg === '--manifest') args.manifestPath = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.manifestPath) throw new Error('--manifest requires a path.');
  return args;
}

export function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifestPath = resolve(args.manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const errors = validateObservabilityControls(manifest, {
    requireProviderActive: args.requireProviderActive,
  });
  if (errors.length > 0) {
    for (const error of errors) console.error(`✖ ${error}`);
    process.exitCode = 1;
    return;
  }
  const controls = manifest.controls;
  const activeControls = controls.filter((control) => control.provider_state === 'active').length;
  const receipt = {
    schema_version: manifest.schema_version,
    status: 'ok',
    repository_contract: 'verified',
    provider_activation: activeControls === controls.length ? 'active' : 'pending',
    control_count: controls.length,
    active_control_count: activeControls,
    operator_mode: manifest.operator_surface.mode,
    payload_retention: manifest.retention.payload_retention,
  };
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log('✔ Cloudflare observability control contract is valid.');
    console.log(`  Controls: ${receipt.control_count}`);
    console.log(`  Provider activation: ${receipt.provider_activation}`);
    console.log(`  Operator mode: ${receipt.operator_mode}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
