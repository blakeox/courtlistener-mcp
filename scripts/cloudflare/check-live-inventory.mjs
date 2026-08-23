#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloudflareRequest } from './lib/cloudflare-api.mjs';
import { runWrangler } from './lib/wrangler-secrets.mjs';

const projectRoot = process.cwd();

function parseJsonc(file) {
  return JSON.parse(
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
      .replace(/,\s*([}\]])/g, '$1'),
  );
}

function check(id, expected, observed, options = {}) {
  const ok = options.ok ?? expected === observed;
  return {
    id,
    severity: ok ? 'info' : 'error',
    promotion_blocker: !ok,
    expected,
    observed,
  };
}

function names(items) {
  return items
    .map(
      (item) => item?.name ?? item?.queue_name ?? item?.script_name ?? item?.id ?? item?.queue_id,
    )
    .filter((value) => typeof value === 'string')
    .sort();
}

function resourceName(item) {
  return item?.name ?? item?.queue_name ?? null;
}

function resolveAuthenticatedAccountId() {
  const configured = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (configured) return configured;

  const result = runWrangler(projectRoot, ['whoami', '--json']);
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID is not set and Wrangler could not resolve an authenticated account. ' +
        'Set CLOUDFLARE_ACCOUNT_ID or run `pnpm exec wrangler login`.',
    );
  }

  let identity;
  try {
    const output = `${result.stdout || ''}`.trim();
    identity = JSON.parse(output.slice(output.indexOf('{')));
  } catch {
    throw new Error('Wrangler whoami did not return machine-readable account information.');
  }

  const accounts = Array.isArray(identity?.accounts)
    ? identity.accounts.filter((account) => typeof account?.id === 'string' && account.id.trim())
    : [];
  if (accounts.length !== 1) {
    throw new Error(
      `Wrangler authenticated ${accounts.length} Cloudflare accounts; set CLOUDFLARE_ACCOUNT_ID explicitly to disambiguate.`,
    );
  }
  return accounts[0].id.trim();
}

export function evaluateLiveInventory({ account, workers, queues, expected }) {
  const workerNames = names(workers);
  const queueNames = names(queues);
  const checks = [
    check('account.identity', expected.accountId, account?.id ?? null),
    ...Object.entries(expected.workerNames).map(([role, name]) =>
      check(`worker.${role}`, name, workerNames.includes(name) ? name : null),
    ),
  ];

  const queue = queues.find((entry) => resourceName(entry) === expected.queueName);
  checks.push(check('queue.primary', expected.queueName, resourceName(queue)));
  checks.push(
    check(
      'queue.dlq_exists',
      expected.deadLetterQueue,
      queueNames.includes(expected.deadLetterQueue) ? expected.deadLetterQueue : null,
    ),
  );

  const consumers = Array.isArray(queue?.consumers) ? queue.consumers : [];
  checks.push(check('queue.consumer_count', 1, consumers.length));
  const consumer = consumers.length === 1 ? consumers[0] : null;
  checks.push(
    check(
      'queue.consumer_owner',
      expected.consumerWorker,
      consumer?.script_name ?? consumer?.script ?? null,
    ),
  );
  checks.push(
    check('queue.dead_letter_queue', expected.deadLetterQueue, consumer?.dead_letter_queue ?? null),
  );
  checks.push(
    check('queue.max_retries', expected.maxRetries, consumer?.settings?.max_retries ?? null),
  );

  return {
    schema_version: 'v1',
    status: checks.some((entry) => entry.severity === 'error') ? 'error' : 'ok',
    account_id: expected.accountId,
    expected,
    checks,
  };
}

function readExpectedTopology() {
  const configs = ['wrangler.edge.jsonc', 'wrangler.mcp.jsonc', 'wrangler.auth-limiter.jsonc'].map(
    (file) => parseJsonc(join(projectRoot, file)),
  );
  const [edge, mcp, authLimiter] = configs;
  const consumer = mcp.queues?.consumers?.find(
    (entry) => entry?.queue === mcp.queues?.producers?.[0]?.queue,
  );
  if (!consumer?.queue || !consumer.dead_letter_queue || !consumer.max_retries) {
    throw new Error(
      'MCP Wrangler config must declare a queue, max_retries, and dead_letter_queue.',
    );
  }
  return {
    accountId: resolveAuthenticatedAccountId(),
    workerNames: {
      edge: edge.name,
      mcp: mcp.name,
      auth_limiter: authLimiter.name,
    },
    queueName: consumer.queue,
    deadLetterQueue: consumer.dead_letter_queue,
    consumerWorker: mcp.name,
    maxRetries: consumer.max_retries,
  };
}

async function fetchQueuesWithConsumers(accountId) {
  const queues = (await cloudflareRequest(`/accounts/${accountId}/queues`)) ?? [];
  return Promise.all(
    queues.map(async (queue) => {
      if (Array.isArray(queue.consumers)) return queue;
      const queueId = queue.id ?? queue.queue_id;
      if (!queueId) return queue;
      return {
        ...queue,
        consumers: await cloudflareRequest(`/accounts/${accountId}/queues/${queueId}/consumers`),
      };
    }),
  );
}

export async function collectLiveInventory() {
  const expected = readExpectedTopology();
  const [account, workers, queues] = await Promise.all([
    cloudflareRequest(`/accounts/${expected.accountId}`),
    cloudflareRequest(`/accounts/${expected.accountId}/workers/scripts`),
    fetchQueuesWithConsumers(expected.accountId),
  ]);
  return evaluateLiveInventory({ account, workers, queues, expected });
}

async function main() {
  const receipt = await collectLiveInventory();
  console.log(
    JSON.stringify(
      {
        schema_version: receipt.schema_version,
        status: receipt.status,
        checks: receipt.checks.map(({ id, severity, promotion_blocker }) => ({
          id,
          severity,
          promotion_blocker,
        })),
      },
      null,
      2,
    ),
  );
  if (receipt.status !== 'ok') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (!existsSync(join(projectRoot, 'wrangler.mcp.jsonc'))) {
    console.error('Run this preflight from the repository root.');
    process.exit(1);
  }
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
