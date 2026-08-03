import { PACKAGE_VERSION } from './package-version.js';
import { resolveWorkerMcpSessionTopologyV2 } from '../server/worker-mcp-session-topology.js';

export const RUNTIME_HEALTH_SERVICE = 'courtlistener-mcp' as const;

export type RuntimeHealthStatus = 'ok' | 'degraded' | 'unhealthy';
export type RuntimeHealthRuntime = 'node' | 'cloudflare-worker';
export type RuntimeHealthTransport =
  | 'streamable-http'
  | 'diagnostics-http'
  | 'cloudflare-agents-streamable-http';

type EnvLike = Record<string, string | undefined>;

export interface RuntimeHealthCore {
  status: RuntimeHealthStatus;
  service: typeof RUNTIME_HEALTH_SERVICE;
  timestamp: string;
  version: string;
  runtime: RuntimeHealthRuntime;
}

export interface RuntimeHealthSessionTopologySnapshot {
  version: string;
  shard_count: number;
  idle_ttl_ms: number;
  absolute_ttl_ms: number;
  eviction_sweep_limit: number;
}

export interface RuntimeHealthCloudflareSnapshot {
  analytics_enabled: boolean;
  async_queue_configured: boolean;
  async_jobs_kv_configured: boolean;
  turnstile_enforced_routes: string[];
}

export type DiagnosticsMetricsHealthStatus = 'healthy' | 'warning' | 'critical';

export interface DiagnosticsMetricsHealth {
  status: DiagnosticsMetricsHealthStatus;
  checks: Record<string, { status: 'pass' | 'fail'; message: string; value?: unknown }>;
  metrics: unknown;
}

export interface RuntimeHealthDiagnostics {
  session_topology: RuntimeHealthSessionTopologySnapshot;
  cloudflare: RuntimeHealthCloudflareSnapshot;
  metrics: {
    latency_ms: unknown;
  };
  metrics_health?: DiagnosticsMetricsHealth;
  cache_stats?: unknown;
  shutting_down?: boolean;
  limits?: Record<string, unknown>;
  backpressure?: Record<string, unknown>;
  performance?: Record<string, unknown>;
  slo?: Record<string, unknown>;
}

export interface RuntimeHealthExtendedPayload extends RuntimeHealthCore {
  transport: RuntimeHealthTransport;
  diagnostics: RuntimeHealthDiagnostics;
}

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function parseCsvList(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildRuntimeHealthCore(
  runtime: RuntimeHealthRuntime,
  status: RuntimeHealthStatus = 'ok',
  version: string = PACKAGE_VERSION,
): RuntimeHealthCore {
  return {
    status,
    service: RUNTIME_HEALTH_SERVICE,
    timestamp: new Date().toISOString(),
    version,
    runtime,
  };
}

export function toSessionTopologySnapshot(topology: {
  version: string;
  shardCount: number;
  idleTtlMs: number;
  absoluteTtlMs: number;
  evictionSweepLimit: number;
}): RuntimeHealthSessionTopologySnapshot {
  return {
    version: topology.version,
    shard_count: topology.shardCount,
    idle_ttl_ms: topology.idleTtlMs,
    absolute_ttl_ms: topology.absoluteTtlMs,
    eviction_sweep_limit: topology.evictionSweepLimit,
  };
}

export function resolveSessionTopologyFromEnv(
  env: EnvLike = typeof process !== 'undefined' ? process.env : {},
): RuntimeHealthSessionTopologySnapshot {
  return toSessionTopologySnapshot(resolveWorkerMcpSessionTopologyV2(env));
}

export function resolveCloudflareBindingsSnapshot(
  env: EnvLike = typeof process !== 'undefined' ? process.env : {},
  overrides: Partial<RuntimeHealthCloudflareSnapshot> = {},
): RuntimeHealthCloudflareSnapshot {
  return {
    analytics_enabled: parseBooleanFlag(env.MCP_CF_ANALYTICS_ENABLED, false),
    async_queue_configured: false,
    async_jobs_kv_configured: false,
    turnstile_enforced_routes: parseCsvList(env.MCP_TURNSTILE_ENFORCED_ROUTES),
    ...overrides,
  };
}

export function buildSharedRuntimeDiagnostics(
  env: EnvLike = typeof process !== 'undefined' ? process.env : {},
  options: {
    cloudflare?: Partial<RuntimeHealthCloudflareSnapshot>;
    latencyMs?: unknown;
  } = {},
): Pick<RuntimeHealthDiagnostics, 'session_topology' | 'cloudflare' | 'metrics'> {
  return {
    session_topology: resolveSessionTopologyFromEnv(env),
    cloudflare: resolveCloudflareBindingsSnapshot(env, options.cloudflare),
    metrics: {
      latency_ms: options.latencyMs ?? { routes: {} },
    },
  };
}

export function buildRuntimeHealthPayload(options: {
  runtime: RuntimeHealthRuntime;
  transport: RuntimeHealthTransport;
  status?: RuntimeHealthStatus;
  version?: string;
  diagnostics: RuntimeHealthDiagnostics;
}): RuntimeHealthExtendedPayload {
  const core = buildRuntimeHealthCore(options.runtime, options.status ?? 'ok', options.version);
  return {
    status: core.status,
    service: core.service,
    timestamp: core.timestamp,
    version: core.version,
    runtime: core.runtime,
    transport: options.transport,
    diagnostics: options.diagnostics,
  };
}

export function buildNodeStreamableHttpHealthPayload(
  diagnostics: RuntimeHealthDiagnostics,
  status: RuntimeHealthStatus = 'ok',
): RuntimeHealthExtendedPayload {
  return buildRuntimeHealthPayload({
    runtime: 'node',
    transport: 'streamable-http',
    status,
    diagnostics,
  });
}

export function buildNodeDiagnosticsHealthPayload(
  metricsHealth: DiagnosticsMetricsHealth,
  cacheStats: unknown,
  env: EnvLike = typeof process !== 'undefined' ? process.env : {},
): RuntimeHealthExtendedPayload {
  const shared = buildSharedRuntimeDiagnostics(env, {
    latencyMs: {
      route_latency_ms:
        metricsHealth.metrics &&
        typeof metricsHealth.metrics === 'object' &&
        metricsHealth.metrics !== null &&
        'runtime_latency_ms' in metricsHealth.metrics
          ? ((metricsHealth.metrics as { runtime_latency_ms?: unknown }).runtime_latency_ms ?? {})
          : {},
    },
  });

  return buildRuntimeHealthPayload({
    runtime: 'node',
    transport: 'diagnostics-http',
    status: mapDiagnosticsMetricsHealthStatus(metricsHealth.status),
    diagnostics: {
      ...shared,
      metrics_health: metricsHealth,
      cache_stats: cacheStats,
    },
  });
}

export function mapDiagnosticsMetricsHealthStatus(
  status: DiagnosticsMetricsHealthStatus,
): RuntimeHealthStatus {
  switch (status) {
    case 'healthy':
      return 'ok';
    case 'warning':
      return 'degraded';
    case 'critical':
      return 'unhealthy';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function diagnosticsHealthStatusCode(status: RuntimeHealthStatus): number {
  switch (status) {
    case 'ok':
    case 'degraded':
      return 200;
    case 'unhealthy':
      return 503;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function extractRuntimeHealthCore(
  payload: Record<string, unknown>,
): RuntimeHealthCore | null {
  const { status, service, timestamp, version, runtime } = payload;
  if (
    (status !== 'ok' && status !== 'degraded' && status !== 'unhealthy') ||
    service !== RUNTIME_HEALTH_SERVICE ||
    typeof timestamp !== 'string' ||
    typeof version !== 'string' ||
    (runtime !== 'node' && runtime !== 'cloudflare-worker')
  ) {
    return null;
  }

  return {
    status,
    service,
    timestamp,
    version,
    runtime,
  };
}

export function validateRuntimeHealthExtendedPayload(payload: unknown): {
  ok: boolean;
  reason?: string;
} {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'health payload is not a JSON object' };
  }

  const record = payload as Record<string, unknown>;
  const core = extractRuntimeHealthCore(record);
  if (!core) {
    return { ok: false, reason: 'health payload missing valid runtime health core fields' };
  }

  if (typeof record.transport !== 'string' || record.transport.trim().length === 0) {
    return { ok: false, reason: 'health payload missing transport' };
  }

  const diagnostics = record.diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') {
    return { ok: false, reason: 'health payload missing diagnostics object' };
  }

  const diagnosticsRecord = diagnostics as Record<string, unknown>;
  const sessionTopology = diagnosticsRecord.session_topology;
  const cloudflare = diagnosticsRecord.cloudflare;
  const metrics = diagnosticsRecord.metrics;

  if (!sessionTopology || typeof sessionTopology !== 'object') {
    return { ok: false, reason: 'diagnostics.session_topology is missing' };
  }
  if (!cloudflare || typeof cloudflare !== 'object') {
    return { ok: false, reason: 'diagnostics.cloudflare is missing' };
  }
  if (!metrics || typeof metrics !== 'object') {
    return { ok: false, reason: 'diagnostics.metrics is missing' };
  }

  const topology = sessionTopology as Record<string, unknown>;
  for (const key of [
    'version',
    'shard_count',
    'idle_ttl_ms',
    'absolute_ttl_ms',
    'eviction_sweep_limit',
  ] as const) {
    if (!(key in topology)) {
      return { ok: false, reason: `diagnostics.session_topology.${key} is missing` };
    }
  }

  return { ok: true };
}

export function extractRuntimeHealthDiagnostics(payload: unknown): RuntimeHealthDiagnostics | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const diagnostics = (payload as Record<string, unknown>).diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') {
    return null;
  }

  return diagnostics as RuntimeHealthDiagnostics;
}

/** @deprecated Use RuntimeHealthExtendedPayload */
export type NodeStreamableHttpHealthPayload = RuntimeHealthExtendedPayload;

/** @deprecated Use RuntimeHealthExtendedPayload */
export type NodeDiagnosticsHealthPayload = RuntimeHealthExtendedPayload;

/** @deprecated Use RuntimeHealthExtendedPayload */
export type WorkerHealthPayload = RuntimeHealthExtendedPayload;
