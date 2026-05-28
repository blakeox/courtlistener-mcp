import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { WorkerMcpSessionTopologyV2 } from './worker-mcp-session-topology.js';

/** Shared secrets and feature flags for both edge and MCP workers. */
export interface WorkerPlatformEnv {
  COURTLISTENER_API_KEY?: string;
  MCP_AUTH_TOKEN?: string;
  MCP_SERVICE_TOKEN_HEADER?: string;
  MCP_ALLOWED_ORIGINS?: string;
  MCP_REQUIRE_PROTOCOL_VERSION?: string;
  MCP_TRUST_CLOUDFLARE_ACCESS_JWT_ASSERTION?: string;
  MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS?: string;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  OIDC_JWKS_URL?: string;
  OIDC_REQUIRED_SCOPE?: string;
  MCP_UI_PUBLIC_ORIGIN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  MCP_TURNSTILE_ENFORCED_ROUTES?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_MAX?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_BOUNDARY_GUARDS_ENABLED?: string;
  MCP_BOUNDARY_RATE_LIMIT_MAX?: string;
  MCP_BOUNDARY_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_BOUNDARY_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_BOUNDARY_HEAVY_PAYLOAD_BYTES?: string;
  MCP_BOUNDARY_MAX_PAYLOAD_BYTES?: string;
  MCP_BOUNDARY_REPLAY_WINDOW_SECONDS?: string;
  MCP_UI_RATE_LIMIT_ENABLED?: string;
  MCP_UI_SIGNUP_RATE_LIMIT_MAX?: string;
  MCP_UI_SIGNUP_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_UI_SIGNUP_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_UI_KEYS_RATE_LIMIT_MAX?: string;
  MCP_UI_KEYS_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_UI_KEYS_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_UI_AI_CHAT_RATE_LIMIT_MAX?: string;
  MCP_API_KEY_MAX_TTL_DAYS?: string;
  MCP_UI_SESSION_SECRET?: string;
  MCP_UI_INSECURE_COOKIES?: string;
  MCP_UI_SESSION_REVOCATION_ENABLED?: string;
  MCP_OAUTH_REGISTRATION_TOKEN_SECRET?: string;
  MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS?: string;
  MCP_AUTH_OIDC_CLIENT_ID?: string;
  MCP_AUTH_OIDC_CLIENT_SECRET?: string;
  MCP_AUTH_OIDC_SCOPES?: string;
  MCP_SESSION_SHARD_COUNT?: string;
  MCP_SESSION_IDLE_TTL_SECONDS?: string;
  MCP_SESSION_ABSOLUTE_TTL_SECONDS?: string;
  MCP_SESSION_EVICTION_SWEEP_LIMIT?: string;
  MCP_OAUTH_BACKEND?: string;
  MCP_OAUTH_DEV_USER_ID?: string;
  MCP_ALLOW_DEV_FALLBACK?: string;
  MCP_OAUTH_DIAGNOSTICS?: string;
  MCP_SESSION_BOOTSTRAP_RATE_LIMIT_MAX?: string;
  MCP_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_CF_ANALYTICS_ENABLED?: string;
  AUTH_FAILURE_LIMITER: DurableObjectNamespace;
}

/** Portal worker: OAuth, hosted auth, SPA assets, UI API (no tool registry in bundle). */
export interface WorkerEdgeEnv extends WorkerPlatformEnv {
  SPA_ASSETS: Fetcher;
  /** Service binding to the MCP worker (`courtlistener-mcp-mcp`). */
  MCP_SERVICE?: Fetcher;
  /** Local dev fallback when `MCP_SERVICE` is unset (wrangler edge + mcp on two ports). */
  MCP_DEV_UPSTREAM_URL?: string;
  OAUTH_KV: KVNamespace;
  ANALYTICS?: AnalyticsEngineDataset;
  OAUTH_PROVIDER?: OAuthHelpers;
}

/** MCP worker: `/mcp`, `/sse`, CourtListenerMCP DO, async tool queue. */
export interface WorkerMcpEnv extends WorkerPlatformEnv {
  MCP_OBJECT: DurableObjectNamespace;
  ASYNC_JOBS_KV?: KVNamespace;
  ASYNC_TOOL_QUEUE?: Queue<import('./worker-async-queue-runtime.js').AsyncJobMessage>;
  ANALYTICS?: AnalyticsEngineDataset;
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  CLOUDFLARE_AI_MODEL?: string;
}

/** @deprecated Prefer WorkerEdgeEnv or WorkerMcpEnv for new code. */
export interface Env extends WorkerEdgeEnv, WorkerMcpEnv {
  MCP_OBJECT: DurableObjectNamespace;
  SPA_ASSETS: Fetcher;
  MCP_SERVICE: Fetcher;
}

export const DEFAULT_AUTH_FAILURE_LIMIT_MAX = 20;
export const DEFAULT_AUTH_FAILURE_WINDOW_SECONDS = 300;
export const DEFAULT_AUTH_FAILURE_BLOCK_SECONDS = 600;
export const DEFAULT_UI_AI_CHAT_RATE_LIMIT_MAX = 50;
export const WORKER_EXPORT_TOP_SLOW_OPERATION_LIMIT = 5;
export const WORKER_DO_OUTLIER_SCORE_THRESHOLD = 2.5;
export const WORKER_DO_OUTLIER_MIN_SAMPLES = 3;
export const WORKER_ROUTE_LATENCY_MAX_ROUTES = 64;
export const WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE = 'OTHER';
export const DEFAULT_CF_AI_MODEL_CHEAP = '@cf/meta/llama-3.1-8b-instruct-fast';
export const DEFAULT_CF_AI_MODEL_BALANCED = '@cf/meta/llama-3.1-8b-instruct-fast';
export const CHEAP_MODE_MAX_TOKENS = 800;
export const BALANCED_MODE_MAX_TOKENS = 2000;

export interface LatencyStats {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  unavailableCount: number;
}

export type DurableObjectLatencyDimension =
  | 'auth_limiter'
  | 'session_revocation'
  | 'mcp_session_lifecycle'
  | 'ai_chat_quota';
export type LatencySnapshot = {
  count: number;
  avg_ms: number;
  max_ms: number;
  last_ms: number;
  unavailable_count: number;
};
export type SlowOperationSnapshot = LatencySnapshot & { operation: string; slow_score: number };
export type DurableObjectOutlierSignal = LatencySnapshot & {
  dimension: DurableObjectLatencyDimension;
  outlier_score: number;
  is_outlier: boolean;
};

export interface AuthFailureState {
  count: number;
  windowStartedAtMs: number;
  blockedUntilMs: number;
}

export interface AuthFailureLimiterRequestBody {
  action: 'check' | 'record' | 'clear';
  nowMs: number;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
}

export interface SessionRevocationRequestBody {
  action: 'session_check' | 'session_revoke';
  nowMs: number;
  revokeUntilMs?: number;
}

export interface AuthFailureLimiterResponseBody {
  blocked: boolean;
  retryAfterSeconds: number;
  state: AuthFailureState;
}

export interface McpBoundaryEvaluateRequestBody {
  action: 'mcp_boundary_evaluate';
  nowMs: number;
  boundary: {
    maxAttempts: number;
    windowMs: number;
    blockMs: number;
  };
  replay?: {
    fingerprint: string;
    maxAttempts: number;
    windowMs: number;
    blockMs: number;
  };
}

export type McpBoundaryEvaluateBlockReason = 'boundary_rate_limit' | 'replay_detected';

export interface McpBoundaryEvaluateResponseBody {
  blocked: boolean;
  retryAfterSeconds: number;
  reason: McpBoundaryEvaluateBlockReason | null;
}

export type AuthRateLimitProbeResult =
  | { kind: 'allowed'; hasFailureState: boolean }
  | { kind: 'blocked'; response: Response }
  | { kind: 'unavailable'; response: Response };

export interface SessionRevocationResponseBody {
  revoked: boolean;
}

export interface BrowserBootstrapConsumeRequestBody {
  action: 'browser_bootstrap_consume';
  nowMs: number;
  expiresAtMs: number;
}

export interface BrowserBootstrapConsumeResponseBody {
  accepted: boolean;
}

export interface UsageCounterRequestBody {
  action: 'usage_increment' | 'usage_get' | 'usage_record_ui_event';
  nowMs: number;
  route?: string;
  method?: string;
  eventName?: string;
  outcome?: string;
}

export interface BrowserBootstrapUsageSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  turnstileRefreshed: number;
  lastOutcome: string | null;
  lastEventAt: string | null;
}

export interface UsageCounterResponseBody {
  userId: string;
  totalRequests: number;
  dailyRequests: number;
  currentDay: string;
  lastSeenAt: string | null;
  byRoute: Record<string, number>;
  browserBootstrap: BrowserBootstrapUsageSummary;
}

export type McpSessionLifecycleAction =
  | 'mcp_session_register'
  | 'mcp_session_touch'
  | 'mcp_session_close';

export interface McpSessionLifecycleRequestBody {
  action: McpSessionLifecycleAction;
  nowMs: number;
  sessionId: string;
  idleTtlMs: number;
  absoluteTtlMs: number;
  evictionSweepLimit: number;
  shardHint?: string;
}

export type McpSessionEvictionReason =
  | 'active'
  | 'missing'
  | 'idle_evicted'
  | 'absolute_evicted'
  | 'closed';

export interface McpSessionLifecycleResponseBody {
  active: boolean;
  reason: McpSessionEvictionReason;
  sessionId: string;
  shard: string;
}

export interface McpSessionLifecycleState {
  sessionId: string;
  createdAtMs: number;
  lastSeenAtMs: number;
  idleExpiresAtMs: number;
  absoluteExpiresAtMs: number;
}

export interface LifetimeQuotaRequestBody {
  action: 'quota_increment_check';
  maxAllowed: number;
}

export interface LifetimeQuotaResponseBody {
  blocked: boolean;
  used: number;
  limit: number;
  remaining: number;
}

export const DEFAULT_AUTH_FAILURE_STATE: AuthFailureState = {
  count: 0,
  windowStartedAtMs: 0,
  blockedUntilMs: 0,
};

export type SessionTopologyCache = Map<string, WorkerMcpSessionTopologyV2>;
