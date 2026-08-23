#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'node:path';

const DEFAULT_BASE_URL =
  process.env.LOAD_PROFILE_BASE_URL ||
  process.env.MCP_REMOTE_URL ||
  process.env.SERVER_URL ||
  'http://127.0.0.1:8787';
const DEFAULT_AUTH_TOKEN =
  process.env.LOAD_PROFILE_BEARER_TOKEN ||
  process.env.MCP_REMOTE_BEARER_TOKEN ||
  process.env.MCP_AUTH_TOKEN ||
  '';
const DEFAULT_REQUESTS = Number.parseInt(process.env.LOAD_PROFILE_REQUESTS || '40', 10);
const DEFAULT_CONCURRENCY = Number.parseInt(process.env.LOAD_PROFILE_CONCURRENCY || '4', 10);

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    requests: Number.isFinite(DEFAULT_REQUESTS) && DEFAULT_REQUESTS > 0 ? DEFAULT_REQUESTS : 40,
    concurrency:
      Number.isFinite(DEFAULT_CONCURRENCY) && DEFAULT_CONCURRENCY > 0 ? DEFAULT_CONCURRENCY : 4,
    timeoutMs: Number.parseInt(process.env.LOAD_PROFILE_TIMEOUT_MS || '8000', 10),
    authToken: DEFAULT_AUTH_TOKEN,
    outputPath: '',
    dryRun: false,
    light: false,
    classes: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--light') options.light = true;
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--base-url') options.baseUrl = argv[++i] || options.baseUrl;
    else if (arg.startsWith('--base-url=')) options.baseUrl = arg.split('=')[1] || options.baseUrl;
    else if (arg === '--requests') options.requests = Number.parseInt(argv[++i] || '', 10);
    else if (arg.startsWith('--requests='))
      options.requests = Number.parseInt(arg.split('=')[1] || '', 10);
    else if (arg === '--concurrency') options.concurrency = Number.parseInt(argv[++i] || '', 10);
    else if (arg.startsWith('--concurrency=')) {
      options.concurrency = Number.parseInt(arg.split('=')[1] || '', 10);
    } else if (arg === '--timeout-ms') options.timeoutMs = Number.parseInt(argv[++i] || '', 10);
    else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Number.parseInt(arg.split('=')[1] || '', 10);
    } else if (arg === '--auth-token') options.authToken = (argv[++i] || '').trim();
    else if (arg.startsWith('--auth-token=')) options.authToken = (arg.split('=')[1] || '').trim();
    else if (arg === '--output') options.outputPath = argv[++i] || '';
    else if (arg.startsWith('--output=')) options.outputPath = arg.split('=')[1] || '';
    else if (arg === '--classes') {
      options.classes = (argv[++i] || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg.startsWith('--classes=')) {
      options.classes = arg
        .split('=')[1]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  if (options.light) {
    options.requests = Math.min(options.requests, 12);
    options.concurrency = Math.min(options.concurrency, 2);
  }

  if (!Number.isFinite(options.requests) || options.requests <= 0) options.requests = 40;
  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) options.concurrency = 4;
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) options.timeoutMs = 8000;

  return options;
}

function printUsage() {
  console.log('Usage: node scripts/performance/load-profile-suite.js [options]');
  console.log('Options:');
  console.log(
    '  --base-url <url>       Base URL (default: LOAD_PROFILE_BASE_URL | MCP_REMOTE_URL | SERVER_URL | http://127.0.0.1:8787)',
  );
  console.log('  --requests <n>         Requests per scenario (default: 40, --light caps at 12)');
  console.log('  --concurrency <n>      Concurrency per scenario (default: 4, --light caps at 2)');
  console.log('  --timeout-ms <n>       Per-request timeout in ms (default: 8000)');
  console.log('  --auth-token <token>   Optional bearer token for MCP/API requests');
  console.log('  --output <file>        Optional output JSON path');
  console.log('  --light                Small local validation run');
  console.log('  --classes <mcp,api>    Limit scenarios (default: auto-detect Worker API routes)');
  console.log('  --dry-run              Print planned scenarios only, no HTTP requests');
}

function scenarioClass(name) {
  if (name.startsWith('mcp_')) return 'mcp';
  if (name.startsWith('api_')) return 'api';
  if (name.startsWith('auth_')) return 'auth';
  return '';
}

async function probeWorkerApiRoutes(baseUrl, timeoutMs) {
  const session = await fetchWithTiming(`${baseUrl}/api/session`, { method: 'GET' }, timeoutMs);
  return session.status === 200;
}

async function resolveEnabledClasses(baseUrl, timeoutMs, explicitClasses) {
  if (explicitClasses.length > 0) return explicitClasses;
  const hasWorkerApi = await probeWorkerApiRoutes(baseUrl, timeoutMs);
  if (hasWorkerApi) return ['mcp', 'api'];
  console.log(
    'Worker UI API routes unavailable at this base URL; running MCP load scenarios only.',
  );
  return ['mcp'];
}

function filterScenariosByClass(scenarios, enabledClasses) {
  const allowed = new Set(enabledClasses);
  return scenarios.filter((scenario) => allowed.has(scenarioClass(scenario.name)));
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function summarizeLatencies(latencies) {
  const count = latencies.length;
  if (!count) {
    return {
      count: 0,
      min_ms: 0,
      max_ms: 0,
      avg_ms: 0,
      p50_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
    };
  }

  const sum = latencies.reduce((acc, value) => acc + value, 0);
  return {
    count,
    min_ms: Number(Math.min(...latencies).toFixed(2)),
    max_ms: Number(Math.max(...latencies).toFixed(2)),
    avg_ms: Number((sum / count).toFixed(2)),
    p50_ms: percentile(latencies, 50),
    p95_ms: percentile(latencies, 95),
    p99_ms: percentile(latencies, 99),
  };
}

function parseMcpPayload(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  const dataLine = trimmed
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('data:'));
  if (!dataLine) return null;

  try {
    return JSON.parse(dataLine.slice(5).trim());
  } catch {
    return null;
  }
}

async function fetchWithTiming(url, init, timeoutMs) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    const bodyText = await response.text();
    return { ok: true, status: response.status, latencyMs, bodyText, response };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      bodyText: error instanceof Error ? error.message : String(error),
      response: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildMcpHeaders(authToken, method) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': method,
  };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  return headers;
}

async function createScenarioRunners(options) {
  const expectedMcpStatuses = options.authToken ? [200] : [401];

  return [
    {
      name: 'mcp_discover',
      description: 'MCP server/discover call (POST /mcp)',
      expectedStatus: expectedMcpStatuses,
      run: async () => {
        const response = await fetchWithTiming(
          `${options.baseUrl}/mcp`,
          {
            method: 'POST',
            headers: buildMcpHeaders(options.authToken, 'server/discover'),
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'server/discover',
              params: {
                _meta: {
                  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                  'io.modelcontextprotocol/clientCapabilities': {},
                },
              },
            }),
          },
          options.timeoutMs,
        );
        return {
          ...response,
          ok: expectedMcpStatuses.includes(response.status) && (!options.authToken || response.ok),
        };
      },
    },
    {
      name: 'mcp_tools_list',
      description: 'MCP tools/list call over stateless v2 transport',
      expectedStatus: expectedMcpStatuses,
      run: async () => {
        const startedAt = Date.now();
        const listResponse = await fetchWithTiming(
          `${options.baseUrl}/mcp`,
          {
            method: 'POST',
            headers: buildMcpHeaders(options.authToken, 'tools/list'),
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/list',
              params: {
                _meta: {
                  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                  'io.modelcontextprotocol/clientCapabilities': {},
                },
              },
            }),
          },
          options.timeoutMs,
        );
        const parsed = parseMcpPayload(listResponse.bodyText);
        const hasResult = Boolean(
          parsed && typeof parsed === 'object' && Object.hasOwn(parsed, 'result'),
        );
        return {
          ...listResponse,
          ok:
            expectedMcpStatuses.includes(listResponse.status) &&
            (!options.authToken || (listResponse.ok && hasResult)),
          latencyMs: Date.now() - startedAt,
        };
      },
    },
    {
      name: 'api_session_get',
      description: 'UI session endpoint (GET /api/session)',
      expectedStatus: [200],
      run: async () =>
        fetchWithTiming(`${options.baseUrl}/api/session`, { method: 'GET' }, options.timeoutMs),
    },
  ];
}

async function runScenario(scenario, options) {
  const latencies = [];
  const statusCounts = {};
  let successCount = 0;
  let failedCount = 0;

  let completed = 0;
  const startedAt = Date.now();

  async function workerLoop() {
    while (completed < options.requests) {
      completed += 1;
      const result = await scenario.run();
      const statusKey = String(result.status || 0);
      statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;
      latencies.push(result.latencyMs);

      const expected = scenario.expectedStatus.includes(result.status);
      if (result.ok && expected) successCount += 1;
      else failedCount += 1;
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => workerLoop()));

  const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
  const throughputRps = Number((options.requests / elapsedSeconds).toFixed(2));
  const errorRatePct = Number(((failedCount / Math.max(options.requests, 1)) * 100).toFixed(2));

  return {
    name: scenario.name,
    description: scenario.description,
    requests: options.requests,
    concurrency: options.concurrency,
    throughput_rps: throughputRps,
    success_count: successCount,
    error_count: failedCount,
    error_rate_pct: errorRatePct,
    status_counts: statusCounts,
    latency_ms: summarizeLatencies(latencies),
  };
}

async function fetchHealthMetrics(baseUrl, timeoutMs) {
  const result = await fetchWithTiming(`${baseUrl}/health`, { method: 'GET' }, timeoutMs);
  if (!result.ok || result.status !== 200) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.bodyText);
    return parsed?.metrics?.latency_ms ?? null;
  } catch {
    return null;
  }
}

function diffDurableObjects(before, after) {
  if (!before || !after) return null;
  const beforeDo = before?.durable_objects;
  const afterDo = after?.durable_objects;
  if (!beforeDo || !afterDo) return null;

  const keys = Object.keys(afterDo);
  const delta = {};
  for (const key of keys) {
    const afterStat = afterDo[key] || {};
    const beforeStat = beforeDo[key] || {};
    delta[key] = {
      count_delta: (afterStat.count || 0) - (beforeStat.count || 0),
      avg_ms_after: afterStat.avg_ms || 0,
      max_ms_after: afterStat.max_ms || 0,
      last_ms_after: afterStat.last_ms || 0,
    };
  }
  return delta;
}

function buildSummary(results) {
  const allLatencies = [];
  let totalRequests = 0;
  let totalErrors = 0;
  let totalSuccess = 0;

  for (const result of results) {
    totalRequests += result.requests;
    totalErrors += result.error_count;
    totalSuccess += result.success_count;
    const avgLatency = result.latency_ms.avg_ms;
    for (let i = 0; i < result.requests; i += 1) allLatencies.push(avgLatency);
  }

  const totalTimeWeighted = results.reduce(
    (acc, item) => acc + item.requests / Math.max(item.throughput_rps, 0.001),
    0,
  );
  const throughput = Number((totalRequests / Math.max(totalTimeWeighted, 0.001)).toFixed(2));

  return {
    total_scenarios: results.length,
    total_requests: totalRequests,
    total_success: totalSuccess,
    total_errors: totalErrors,
    total_error_rate_pct: Number(((totalErrors / Math.max(totalRequests, 1)) * 100).toFixed(2)),
    weighted_throughput_rps: throughput,
    latency_ms: summarizeLatencies(allLatencies),
  };
}

async function ensureOutputPath(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const nowIso = new Date().toISOString();

  const scenarioPreview = ['mcp_discover', 'mcp_tools_list', 'api_session_get'];

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          timestamp: nowIso,
          mode: 'dry-run',
          base_url: options.baseUrl,
          requests_per_scenario: options.requests,
          concurrency: options.concurrency,
          scenarios: scenarioPreview,
        },
        null,
        2,
      ),
    );
    return;
  }

  const healthBefore = await fetchHealthMetrics(options.baseUrl, options.timeoutMs);
  const enabledClasses = await resolveEnabledClasses(
    options.baseUrl,
    options.timeoutMs,
    options.classes,
  );
  const scenarios = filterScenariosByClass(await createScenarioRunners(options), enabledClasses);
  if (scenarios.length === 0) {
    throw new Error(`No load scenarios enabled for classes: ${enabledClasses.join(', ')}`);
  }
  console.log(`Enabled scenario classes: ${enabledClasses.join(', ')}`);

  const results = [];
  for (const scenario of scenarios) {
    const scenarioResult = await runScenario(scenario, options);
    results.push(scenarioResult);
    console.log(
      `[${scenarioResult.name}] p95=${scenarioResult.latency_ms.p95_ms}ms throughput=${scenarioResult.throughput_rps}rps errors=${scenarioResult.error_rate_pct}%`,
    );
  }

  const healthAfter = await fetchHealthMetrics(options.baseUrl, options.timeoutMs);
  const output = {
    timestamp: nowIso,
    base_url: options.baseUrl,
    requests_per_scenario: options.requests,
    concurrency: options.concurrency,
    timeout_ms: options.timeoutMs,
    scenario_count: scenarios.length,
    enabled_classes: enabledClasses,
    summary: buildSummary(results),
    results,
    worker_latency_health: {
      before: healthBefore,
      after: healthAfter,
      durable_object_delta: diffDurableObjects(healthBefore, healthAfter),
    },
  };

  const defaultOutput = path.join(
    'performance-data',
    `load-profile-suite-${nowIso.replace(/[:.]/g, '-')}.json`,
  );
  const outputPath = options.outputPath || defaultOutput;
  await ensureOutputPath(outputPath);
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

  console.log(`Saved load profile report to ${outputPath}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
