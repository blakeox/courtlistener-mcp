import { PACKAGE_VERSION } from './package-version.js';

export const RUNTIME_HEALTH_SERVICE = 'courtlistener-mcp' as const;

export type RuntimeHealthStatus = 'ok' | 'degraded' | 'unhealthy';
export type RuntimeHealthRuntime = 'local-stdio' | 'cloudflare-worker';
export type RuntimeHealthTransport = 'local-stdio' | 'cloudflare-mcp-v2-streamable-http';

type EnvLike = Record<string, string | undefined>;

export interface RuntimeHealthCore {
  status: RuntimeHealthStatus;
  service: typeof RUNTIME_HEALTH_SERVICE;
  timestamp: string;
  version: string;
  runtime: RuntimeHealthRuntime;
}

export interface RuntimeHealthCloudflareSnapshot {
  analytics_enabled: boolean;
  async_queue_configured: boolean;
  async_jobs_kv_configured: boolean;
  turnstile_enforced_routes: string[];
}

export interface RuntimeHealthDiagnostics {
  cloudflare: RuntimeHealthCloudflareSnapshot;
  metrics: {
    latency_ms: unknown;
  };
  metrics_health?: {
    status: 'healthy' | 'warning' | 'critical';
    checks: Record<string, { status: 'pass' | 'fail'; message: string; value?: unknown }>;
    metrics: unknown;
  };
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

export function resolveCloudflareBindingsSnapshot(
  env: EnvLike = {},
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
  env: EnvLike = {},
  options: {
    cloudflare?: Partial<RuntimeHealthCloudflareSnapshot>;
    latencyMs?: unknown;
  } = {},
): Pick<RuntimeHealthDiagnostics, 'cloudflare' | 'metrics'> {
  return {
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

export function buildLocalStdioHealthPayload(
  diagnostics: RuntimeHealthDiagnostics,
  status: RuntimeHealthStatus = 'ok',
): RuntimeHealthExtendedPayload {
  return buildRuntimeHealthPayload({
    runtime: 'local-stdio',
    transport: 'local-stdio',
    status,
    diagnostics,
  });
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
    (runtime !== 'local-stdio' && runtime !== 'cloudflare-worker')
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
  const cloudflare = diagnosticsRecord.cloudflare;
  const metrics = diagnosticsRecord.metrics;

  if (!cloudflare || typeof cloudflare !== 'object') {
    return { ok: false, reason: 'diagnostics.cloudflare is missing' };
  }
  if (!metrics || typeof metrics !== 'object') {
    return { ok: false, reason: 'diagnostics.metrics is missing' };
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
