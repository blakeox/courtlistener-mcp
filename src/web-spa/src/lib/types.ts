export interface AuthSessionResponse {
  authenticated: boolean;
  user: { id: string; email?: string; displayName?: string } | null;
  turnstile_site_key?: string | null;
}

export interface SessionBootstrapResponse {
  ok: boolean;
  userId: string;
  expiresInSeconds: number;
}

export interface ApiError {
  status: number;
  error?: string;
  message?: string;
  error_code?: string;
  retry_after_seconds?: number;
}

export interface TelemetryEvent {
  name: string;
  at: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface UiTelemetryIngestRequest {
  name: string;
  route: string;
  outcome: string;
}

export interface UsageSnapshotResponse {
  userId: string;
  totalRequests: number;
  dailyRequests: number;
  currentDay: string;
  lastSeenAt: string | null;
  byRoute: Record<string, number>;
  browserBootstrap: {
    attempted: number;
    succeeded: number;
    failed: number;
    turnstileRefreshed: number;
    lastOutcome: string | null;
    lastEventAt: string | null;
  };
}

export interface WorkerHealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  service: 'courtlistener-mcp';
  timestamp: string;
  version: string;
  runtime: 'node' | 'cloudflare-worker';
  transport: string;
  diagnostics: {
    session_topology: {
      version: string;
      shard_count: number;
      idle_ttl_ms: number;
      absolute_ttl_ms: number;
      eviction_sweep_limit: number;
    };
    cloudflare: {
      analytics_enabled: boolean;
      async_queue_configured: boolean;
      async_jobs_kv_configured: boolean;
      turnstile_enforced_routes: string[];
    };
    metrics: {
      latency_ms: unknown;
    };
    metrics_health?: unknown;
    cache_stats?: unknown;
  };
}
