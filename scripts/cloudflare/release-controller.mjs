#!/usr/bin/env node

/**
 * Versioned Cloudflare release controller.
 *
 * The controller deliberately separates upload, canary, promotion, rollback,
 * and receipt finalization. It never performs an implicit production deploy.
 * Wrangler remains the deployment primitive; this script owns the release
 * state and validates the version/traffic invariants around it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORKERS = ['auth_limiter', 'edge', 'mcp'];
const CONFIGS = {
  staging: {
    auth_limiter: 'wrangler.auth-limiter.staging.jsonc',
    edge: 'wrangler.edge.staging.jsonc',
    mcp: 'wrangler.mcp.staging.jsonc',
  },
  production: {
    auth_limiter: 'wrangler.auth-limiter.jsonc',
    edge: 'wrangler.edge.jsonc',
    mcp: 'wrangler.mcp.jsonc',
  },
};

function parseArgs(argv) {
  const options = {
    environment: process.env.CLOUDFLARE_RELEASE_ENVIRONMENT || '',
    phase: process.env.CLOUDFLARE_RELEASE_PHASE || '',
    releaseId: process.env.CLOUDFLARE_RELEASE_ID || '',
    sourceSha: process.env.GITHUB_SHA || '',
    canaryPercent: Number.parseInt(process.env.CLOUDFLARE_CANARY_PERCENT || '1', 10),
    stateFile: process.env.CLOUDFLARE_RELEASE_STATE || 'release-state.json',
    receiptFile: process.env.CLOUDFLARE_RELEASE_RECEIPT || 'release-receipt.json',
    decision: process.env.CLOUDFLARE_RELEASE_DECISION || 'hold',
    approvedBy: process.env.CLOUDFLARE_RELEASE_APPROVED_BY || process.env.GITHUB_ACTOR || '',
    probeDirectory: process.env.CLOUDFLARE_PROBE_DIRECTORY || 'release-probes',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === '--environment') options.environment = next() || options.environment;
    else if (arg.startsWith('--environment=')) options.environment = arg.split('=')[1];
    else if (arg === '--phase') options.phase = next() || options.phase;
    else if (arg.startsWith('--phase=')) options.phase = arg.split('=')[1];
    else if (arg === '--release-id') options.releaseId = next() || options.releaseId;
    else if (arg.startsWith('--release-id=')) options.releaseId = arg.split('=')[1];
    else if (arg === '--source-sha') options.sourceSha = next() || options.sourceSha;
    else if (arg.startsWith('--source-sha=')) options.sourceSha = arg.split('=')[1];
    else if (arg === '--canary-percent') options.canaryPercent = Number.parseInt(next(), 10);
    else if (arg.startsWith('--canary-percent=')) {
      options.canaryPercent = Number.parseInt(arg.split('=')[1], 10);
    } else if (arg === '--state-file') options.stateFile = next() || options.stateFile;
    else if (arg.startsWith('--state-file=')) options.stateFile = arg.split('=')[1];
    else if (arg === '--receipt-file') options.receiptFile = next() || options.receiptFile;
    else if (arg.startsWith('--receipt-file=')) options.receiptFile = arg.split('=')[1];
    else if (arg === '--decision') options.decision = next() || options.decision;
    else if (arg.startsWith('--decision=')) options.decision = arg.split('=')[1];
    else if (arg === '--approved-by') options.approvedBy = next() || options.approvedBy;
    else if (arg.startsWith('--approved-by=')) options.approvedBy = arg.split('=')[1];
    else if (arg === '--probe-directory') options.probeDirectory = next() || options.probeDirectory;
    else if (arg.startsWith('--probe-directory=')) options.probeDirectory = arg.split('=')[1];
  }
  return options;
}

function requireValidOptions(options, phase = options.phase) {
  const errors = [];
  if (!Object.hasOwn(CONFIGS, options.environment)) {
    errors.push('environment must be staging or production.');
  }
  if (!['upload', 'canary', 'promote', 'rollback', 'finalize'].includes(phase)) {
    errors.push('phase must be upload, canary, promote, rollback, or finalize.');
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/iu.test(options.releaseId)) {
    errors.push(
      'release-id must be 3-128 characters and contain only letters, numbers, dots, underscores, or hyphens.',
    );
  }
  if (!/^[a-f0-9]{40}$/iu.test(options.sourceSha)) {
    errors.push('source-sha must be a 40-character hexadecimal commit SHA.');
  }
  if (
    !Number.isInteger(options.canaryPercent) ||
    options.canaryPercent < 1 ||
    options.canaryPercent > 99
  ) {
    errors.push('canary-percent must be an integer from 1 through 99.');
  }
  if (phase === 'finalize' && !['promote', 'hold', 'rollback'].includes(options.decision)) {
    errors.push('decision must be promote, hold, or rollback for finalize.');
  }
  return errors;
}

function runWrangler(args, { allowFailure = false } = {}) {
  const command = ['exec', 'wrangler', ...args];
  const result = spawnSync('pnpm', command, {
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`Wrangler command failed (${command.join(' ')}):\n${output.slice(-4000)}`);
  }
  return { status: result.status ?? 1, output };
}

export function parseVersionId(output) {
  const match = output.match(/Worker Version ID:\s*([0-9a-f-]{36})/iu);
  if (!match) throw new Error('Wrangler upload output did not contain a Worker Version ID.');
  return match[1];
}

export function parseDeploymentVersions(output) {
  const jsonMatches = [...output.matchAll(/\[\s*\{/g)];
  const jsonStart = jsonMatches[0]?.index ?? -1;
  if (jsonStart < 0) throw new Error('Wrangler deployment output did not contain JSON.');
  const deployments = JSON.parse(output.slice(jsonStart));
  const latest = [...deployments]
    .reverse()
    .find((deployment) => Array.isArray(deployment?.versions));
  const versions = latest?.versions ?? [];
  return versions
    .filter(
      (entry) =>
        typeof entry?.version_id === 'string' &&
        Number.isInteger(entry?.percentage) &&
        entry.percentage >= 0 &&
        entry.percentage <= 100,
    )
    .map((entry) => ({ version_id: entry.version_id, percentage: entry.percentage }));
}

function getActiveVersions(configFile) {
  const result = runWrangler(['deployments', 'list', '-c', configFile, '--json']);
  return parseDeploymentVersions(result.output);
}

function activeVersionId(configFile) {
  const active = getActiveVersions(configFile);
  if (active.length !== 1 || active[0].percentage !== 100) {
    throw new Error(
      `${configFile} must have exactly one active 100% version before a release operation.`,
    );
  }
  return active[0].version_id;
}

export function buildTrafficArgs(newVersionId, priorVersionId, canaryPercent) {
  if (!newVersionId || !priorVersionId)
    throw new Error('Both new and prior version IDs are required.');
  if (newVersionId === priorVersionId) throw new Error('New and prior version IDs must differ.');
  return [`${newVersionId}@${canaryPercent}`, `${priorVersionId}@${100 - canaryPercent}`];
}

function writeJson(file, value) {
  const parent = dirname(file);
  if (parent && parent !== '.') {
    mkdirSync(parent, { recursive: true });
  }
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file) {
  if (!existsSync(file)) throw new Error(`Release state file does not exist: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function uploadWorker(role, configFile, options) {
  const tag = `${options.releaseId}-${role}`;
  const result = runWrangler([
    'versions',
    'upload',
    '-c',
    configFile,
    '--tag',
    tag,
    '--message',
    `release ${options.releaseId} ${role} ${options.sourceSha}`,
    '--strict',
  ]);
  return parseVersionId(result.output);
}

function upload(options) {
  const configs = CONFIGS[options.environment];
  const prior = Object.fromEntries(WORKERS.map((role) => [role, activeVersionId(configs[role])]));
  const uploaded = Object.fromEntries(
    WORKERS.map((role) => [role, uploadWorker(role, configs[role], options)]),
  );
  const state = {
    schema_version: 'v1',
    status: 'uploaded',
    release_id: options.releaseId,
    environment: options.environment,
    source_sha: options.sourceSha,
    deployment_authority: 'github-actions',
    configs,
    prior_version_ids: prior,
    uploaded_version_ids: uploaded,
    canary_percent: options.canaryPercent,
    kill_switches: ['MCP_ASYNC_QUEUE_ENABLED=false', 'CODEMODE_ENABLED=false'],
    recorded_at: new Date().toISOString(),
  };
  writeJson(options.stateFile, state);
  return state;
}

function deployState(state, phase) {
  const percentage = phase === 'canary' ? state.canary_percent : 100;
  for (const role of WORKERS) {
    const configFile = state.configs[role];
    const uploaded = state.uploaded_version_ids[role];
    const prior = state.prior_version_ids[role];
    const args =
      phase === 'canary'
        ? buildTrafficArgs(uploaded, prior, state.canary_percent)
        : [`${uploaded}@${percentage}`];
    runWrangler([
      'versions',
      'deploy',
      ...args,
      '-c',
      configFile,
      '--message',
      `${phase} ${state.release_id} ${state.source_sha}`,
      '-y',
    ]);
  }
  state.status = phase === 'canary' ? 'canary' : 'promoted';
  state.last_deployed_at = new Date().toISOString();
  return state;
}

function rollback(state) {
  for (const role of WORKERS) {
    runWrangler([
      'versions',
      'deploy',
      `${state.prior_version_ids[role]}@100`,
      '-c',
      state.configs[role],
      '--message',
      `rollback ${state.release_id} ${state.source_sha}`,
      '-y',
    ]);
  }
  state.status = 'rolled-back';
  state.last_deployed_at = new Date().toISOString();
  return state;
}

function probePath(directory, name) {
  const path = join(directory, `${name}.json`);
  if (!existsSync(path)) throw new Error(`Missing required probe artifact: ${path}`);
  return path;
}

function buildReceipt(state, options) {
  const isRollback = state.status === 'rolled-back';
  const activeTrafficPercent = isRollback
    ? 100
    : state.status === 'promoted'
      ? 100
      : state.status === 'canary'
        ? state.canary_percent
        : 0;
  const toolchain = {
    node: process.version,
    pnpm: process.env.PNPM_VERSION || 'workflow-pinned',
    wrangler: process.env.WRANGLER_VERSION || 'workflow-pinned',
    compatibility_date: '2026-03-02',
  };
  return {
    schema_version: 'v1',
    release_id: state.release_id,
    environment: state.environment,
    source_sha: state.source_sha,
    workflow_run: process.env.GITHUB_RUN_ID || 'local',
    deployment_authority: 'github-actions',
    toolchain,
    workers: Object.fromEntries(
      WORKERS.map((role) => [
        role,
        {
          version_id: isRollback ? state.prior_version_ids[role] : state.uploaded_version_ids[role],
          traffic_percent: activeTrafficPercent,
        },
      ]),
    ),
    topology: {
      routes_hash: process.env.CLOUDFLARE_ROUTES_HASH || 'artifact/topology-manifest.json',
      bindings_hash: process.env.CLOUDFLARE_BINDINGS_HASH || 'artifact/topology-manifest.json',
      resource_manifest:
        process.env.CLOUDFLARE_RESOURCE_MANIFEST || 'artifact/topology-manifest.json',
    },
    probes: Object.fromEntries(
      [
        'health',
        'readiness',
        'oauth',
        'mcp_initialize',
        'direct_mcp_denial',
        'version_override',
      ].map((name) => [name, probePath(options.probeDirectory, name)]),
    ),
    queue: {
      consumer_owner: process.env.CLOUDFLARE_QUEUE_CONSUMER_OWNER || 'artifact/queue-receipt.json',
      max_retries: 3,
      dead_letter_queue: process.env.CLOUDFLARE_DEAD_LETTER_QUEUE || 'artifact/queue-receipt.json',
      oldest_message_age_seconds: 0,
    },
    rollback: {
      target_version_ids: WORKERS.map((role) => state.prior_version_ids[role]),
      migration_reversal_allowed: false,
      kill_switches: state.kill_switches,
    },
    decision: options.decision,
    approved_by: options.approvedBy,
    recorded_at: new Date().toISOString(),
  };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const errors = requireValidOptions(options);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  if (options.phase === 'upload') {
    console.log(JSON.stringify(upload(options), null, 2));
    return;
  }

  const state = readJson(options.stateFile);
  if (state.release_id !== options.releaseId || state.source_sha !== options.sourceSha) {
    throw new Error('Release state release_id/source_sha does not match the requested operation.');
  }
  if (state.environment !== options.environment) {
    throw new Error('Release state environment does not match the requested operation.');
  }

  if (options.phase === 'canary' || options.phase === 'promote') {
    writeJson(options.stateFile, deployState(state, options.phase));
    return;
  }
  if (options.phase === 'rollback') {
    writeJson(options.stateFile, rollback(state));
    return;
  }

  const receipt = buildReceipt(state, options);
  writeJson(options.receiptFile, receipt);
  console.log(JSON.stringify(receipt, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { CONFIGS, WORKERS, buildReceipt, parseArgs, requireValidOptions };
