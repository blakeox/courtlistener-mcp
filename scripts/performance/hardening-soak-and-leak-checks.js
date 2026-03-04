#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const MB = 1024 * 1024;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const defaults = {
    baseUrl: process.env.SOAK_BASE_URL || process.env.LOAD_PROFILE_BASE_URL || process.env.MCP_REMOTE_URL || 'http://127.0.0.1:8787',
    durationMs: parsePositiveInt(process.env.SOAK_DURATION_MS, 5 * 60 * 1000),
    intervalMs: parsePositiveInt(process.env.SOAK_INTERVAL_MS, 20 * 1000),
    burstRequests: parsePositiveInt(process.env.SOAK_BURST_REQUESTS, 24),
    burstConcurrency: parsePositiveInt(process.env.SOAK_BURST_CONCURRENCY, 4),
    timeoutMs: parsePositiveInt(process.env.SOAK_TIMEOUT_MS, 8000),
    routeVariantsPerRound: parsePositiveInt(process.env.SOAK_ROUTE_VARIANTS_PER_ROUND, 8),
    queueBacklogMax: parsePositiveInt(process.env.SOAK_QUEUE_BACKLOG_MAX, 32),
    routeGrowthMax: parsePositiveInt(process.env.SOAK_ROUTE_CARDINALITY_GROWTH_MAX, 8),
    routeAbsoluteMax: parsePositiveInt(process.env.SOAK_ROUTE_CARDINALITY_ABS_MAX, 64),
    memoryGrowthMaxMb: parsePositiveFloat(process.env.SOAK_MEMORY_GROWTH_MAX_MB, 64),
    memoryGrowthMaxPct: parsePositiveFloat(process.env.SOAK_MEMORY_GROWTH_MAX_PCT, 35),
    outputPath: '',
    dryRun: false,
    warnOnly: false,
    light: false,
  };

  const options = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--warn-only') options.warnOnly = true;
    else if (arg === '--light') options.light = true;
    else if (arg === '--base-url') options.baseUrl = argv[++i] || options.baseUrl;
    else if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice('--base-url='.length) || options.baseUrl;
    else if (arg === '--duration-ms') options.durationMs = parsePositiveInt(argv[++i], options.durationMs);
    else if (arg.startsWith('--duration-ms=')) options.durationMs = parsePositiveInt(arg.slice('--duration-ms='.length), options.durationMs);
    else if (arg === '--interval-ms') options.intervalMs = parsePositiveInt(argv[++i], options.intervalMs);
    else if (arg.startsWith('--interval-ms=')) options.intervalMs = parsePositiveInt(arg.slice('--interval-ms='.length), options.intervalMs);
    else if (arg === '--burst-requests') options.burstRequests = parsePositiveInt(argv[++i], options.burstRequests);
    else if (arg.startsWith('--burst-requests=')) options.burstRequests = parsePositiveInt(arg.slice('--burst-requests='.length), options.burstRequests);
    else if (arg === '--burst-concurrency') options.burstConcurrency = parsePositiveInt(argv[++i], options.burstConcurrency);
    else if (arg.startsWith('--burst-concurrency=')) options.burstConcurrency = parsePositiveInt(arg.slice('--burst-concurrency='.length), options.burstConcurrency);
    else if (arg === '--timeout-ms') options.timeoutMs = parsePositiveInt(argv[++i], options.timeoutMs);
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = parsePositiveInt(arg.slice('--timeout-ms='.length), options.timeoutMs);
    else if (arg === '--route-variants-per-round') options.routeVariantsPerRound = parsePositiveInt(argv[++i], options.routeVariantsPerRound);
    else if (arg.startsWith('--route-variants-per-round=')) options.routeVariantsPerRound = parsePositiveInt(arg.slice('--route-variants-per-round='.length), options.routeVariantsPerRound);
    else if (arg === '--queue-backlog-max') options.queueBacklogMax = parsePositiveInt(argv[++i], options.queueBacklogMax);
    else if (arg.startsWith('--queue-backlog-max=')) options.queueBacklogMax = parsePositiveInt(arg.slice('--queue-backlog-max='.length), options.queueBacklogMax);
    else if (arg === '--route-growth-max') options.routeGrowthMax = parsePositiveInt(argv[++i], options.routeGrowthMax);
    else if (arg.startsWith('--route-growth-max=')) options.routeGrowthMax = parsePositiveInt(arg.slice('--route-growth-max='.length), options.routeGrowthMax);
    else if (arg === '--route-absolute-max') options.routeAbsoluteMax = parsePositiveInt(argv[++i], options.routeAbsoluteMax);
    else if (arg.startsWith('--route-absolute-max=')) options.routeAbsoluteMax = parsePositiveInt(arg.slice('--route-absolute-max='.length), options.routeAbsoluteMax);
    else if (arg === '--memory-growth-max-mb') options.memoryGrowthMaxMb = parsePositiveFloat(argv[++i], options.memoryGrowthMaxMb);
    else if (arg.startsWith('--memory-growth-max-mb=')) options.memoryGrowthMaxMb = parsePositiveFloat(arg.slice('--memory-growth-max-mb='.length), options.memoryGrowthMaxMb);
    else if (arg === '--memory-growth-max-pct') options.memoryGrowthMaxPct = parsePositiveFloat(argv[++i], options.memoryGrowthMaxPct);
    else if (arg.startsWith('--memory-growth-max-pct=')) options.memoryGrowthMaxPct = parsePositiveFloat(arg.slice('--memory-growth-max-pct='.length), options.memoryGrowthMaxPct);
    else if (arg === '--output') options.outputPath = argv[++i] || '';
    else if (arg.startsWith('--output=')) options.outputPath = arg.slice('--output='.length) || '';
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  if (options.light) {
    options.durationMs = Math.min(options.durationMs, 45 * 1000);
    options.intervalMs = Math.min(options.intervalMs, 10 * 1000);
    options.burstRequests = Math.min(options.burstRequests, 12);
    options.burstConcurrency = Math.min(options.burstConcurrency, 2);
    options.routeVariantsPerRound = Math.min(options.routeVariantsPerRound, 4);
  }

  options.burstConcurrency = Math.min(options.burstConcurrency, options.burstRequests);
  return options;
}

function printUsage() {
  console.log('Usage: node scripts/performance/hardening-soak-and-leak-checks.js [options]');
  console.log('Options:');
  console.log('  --base-url <url>                  Target base URL');
  console.log('  --duration-ms <n>                 Soak duration (default 300000)');
  console.log('  --interval-ms <n>                 Sample interval (default 20000)');
  console.log('  --burst-requests <n>              Requests sent each interval (default 24)');
  console.log('  --burst-concurrency <n>           Concurrency per burst (default 4)');
  console.log('  --route-variants-per-round <n>    Unique 404 paths per interval (default 8)');
  console.log('  --queue-backlog-max <n>           Max tolerated in-flight backlog (default 32)');
  console.log('  --route-growth-max <n>            Max route metric growth over run (default 8)');
  console.log('  --route-absolute-max <n>          Max route metric count (default 64)');
  console.log('  --memory-growth-max-mb <n>        Max memory growth in MB (default 64)');
  console.log('  --memory-growth-max-pct <n>       Max memory growth percent (default 35)');
  console.log('  --dry-run                         Print config and exit');
  console.log('  --light                           Fast local/CI smoke profile');
  console.log('  --warn-only                       Print failures without non-zero exit');
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const bodyText = await response.text();
    return { ok: response.ok, status: response.status, bodyText };
  } catch (error) {
    return { ok: false, status: 0, bodyText: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function parseMemoryBytes(healthPayload) {
  if (!healthPayload || typeof healthPayload !== 'object') return null;
  const metrics = healthPayload.metrics;
  if (!metrics || typeof metrics !== 'object') return null;
  if (metrics.memoryUsage?.heapUsed && Number.isFinite(metrics.memoryUsage.heapUsed)) return metrics.memoryUsage.heapUsed;
  if (metrics.memory?.heapUsed && Number.isFinite(metrics.memory.heapUsed)) return metrics.memory.heapUsed;
  return null;
}

function parseRouteCardinality(healthPayload) {
  const routes = healthPayload?.metrics?.latency_ms?.routes;
  if (!routes || typeof routes !== 'object') return { count: null, overflow: false };
  const keys = Object.keys(routes);
  return { count: keys.length, overflow: keys.includes('OTHER') };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBurst(baseUrl, options, round) {
  let submitted = 0;
  let completed = 0;
  let failed = 0;
  let maxBacklog = 0;
  const startedAt = Date.now();
  const total = options.burstRequests;
  const routeVariants = Math.max(1, options.routeVariantsPerRound);
  const routeList = Array.from({ length: routeVariants }, (_, i) => `/soak-route-${round}-${i}`);

  async function worker() {
    while (submitted < total) {
      const current = submitted;
      submitted += 1;
      const route = current % 2 === 0 ? '/health' : routeList[current % routeList.length];
      const result = await fetchText(`${baseUrl}${route}`, options.timeoutMs);
      if (!result.ok) failed += 1;
      completed += 1;
      const backlog = submitted - completed;
      if (backlog > maxBacklog) maxBacklog = backlog;
    }
  }

  await Promise.all(Array.from({ length: options.burstConcurrency }, () => worker()));
  return {
    durationMs: Date.now() - startedAt,
    submitted,
    completed,
    failed,
    maxBacklog,
    finalBacklog: submitted - completed,
  };
}

async function ensureOutputPath(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function evaluateChecks(options, samples) {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const checks = [];

  if (first && last) {
    const memoryDeltaBytes = last.memoryBytes - first.memoryBytes;
    const memoryDeltaMb = memoryDeltaBytes / MB;
    const memoryDeltaPct = first.memoryBytes > 0 ? (memoryDeltaBytes / first.memoryBytes) * 100 : 0;
    checks.push({
      name: 'memory-growth',
      pass: memoryDeltaMb <= options.memoryGrowthMaxMb && memoryDeltaPct <= options.memoryGrowthMaxPct,
      details: {
        firstBytes: first.memoryBytes,
        lastBytes: last.memoryBytes,
        growthMb: Number(memoryDeltaMb.toFixed(2)),
        growthPct: Number(memoryDeltaPct.toFixed(2)),
        thresholdMb: options.memoryGrowthMaxMb,
        thresholdPct: options.memoryGrowthMaxPct,
      },
    });
  }

  const routeSamples = samples.filter((sample) => Number.isFinite(sample.routeCount));
  if (routeSamples.length >= 2) {
    const routeGrowth = routeSamples[routeSamples.length - 1].routeCount - routeSamples[0].routeCount;
    const routePeak = Math.max(...routeSamples.map((sample) => sample.routeCount));
    checks.push({
      name: 'route-cardinality-growth',
      pass: routeGrowth <= options.routeGrowthMax && routePeak <= options.routeAbsoluteMax,
      details: {
        firstCount: routeSamples[0].routeCount,
        lastCount: routeSamples[routeSamples.length - 1].routeCount,
        growth: routeGrowth,
        peak: routePeak,
        thresholdGrowth: options.routeGrowthMax,
        thresholdAbsolute: options.routeAbsoluteMax,
        overflowSeen: routeSamples.some((sample) => sample.routeOverflow === true),
      },
    });
  }

  const maxBacklog = Math.max(...samples.map((sample) => sample.maxBacklog), 0);
  const backlogNotDrained = samples.some((sample) => sample.finalBacklog !== 0);
  checks.push({
    name: 'queue-backlog-behavior',
    pass: maxBacklog <= options.queueBacklogMax && !backlogNotDrained,
    details: {
      maxBacklog,
      threshold: options.queueBacklogMax,
      backlogNotDrained,
    },
  });

  return checks;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rounds = Math.max(1, Math.ceil(options.durationMs / options.intervalMs));
  const startedAt = new Date().toISOString();

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          startedAt,
          rounds,
          options,
        },
        null,
        2,
      ),
    );
    return;
  }

  const samples = [];
  for (let round = 0; round < rounds; round += 1) {
    const burst = await runBurst(options.baseUrl, options, round + 1);
    const health = await fetchText(`${options.baseUrl}/health`, options.timeoutMs);
    let healthJson = null;
    if (health.ok) {
      try {
        healthJson = JSON.parse(health.bodyText);
      } catch {
        healthJson = null;
      }
    }
    const route = parseRouteCardinality(healthJson);
    const serverMemoryBytes = parseMemoryBytes(healthJson);
    const memoryBytes = Number.isFinite(serverMemoryBytes) ? serverMemoryBytes : process.memoryUsage().heapUsed;
    samples.push({
      round: round + 1,
      timestamp: new Date().toISOString(),
      memoryBytes,
      memorySource: Number.isFinite(serverMemoryBytes) ? 'server-health' : 'runner-process',
      routeCount: route.count,
      routeOverflow: route.overflow,
      ...burst,
    });
    console.log(
      `[round ${round + 1}/${rounds}] mem=${(memoryBytes / MB).toFixed(2)}MB routes=${route.count ?? 'n/a'} backlog_max=${burst.maxBacklog} failed=${burst.failed}`,
    );
    if (round < rounds - 1) await sleep(options.intervalMs);
  }

  const checks = evaluateChecks(options, samples);
  const failedChecks = checks.filter((check) => !check.pass);
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    options,
    rounds,
    checks,
    samples,
  };

  const outputPath =
    options.outputPath || path.join('performance-data', `hardening-soak-leak-checks-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await ensureOutputPath(outputPath);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  console.log(`Saved soak/leak report to ${outputPath}`);
  if (failedChecks.length === 0) {
    console.log('✅ All hardening soak checks passed');
    return;
  }
  console.log(`❌ Failed checks: ${failedChecks.map((check) => check.name).join(', ')}`);
  if (!options.warnOnly) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
