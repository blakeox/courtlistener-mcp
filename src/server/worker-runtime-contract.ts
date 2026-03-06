import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { WorkerMcpSessionTopologyV2 } from './worker-mcp-session-topology.js';

export interface Env {
  COURTLISTENER_API_KEY?: string;
  MCP_AUTH_TOKEN?: string;
  MCP_AUTH_PRIMARY?: string;
  MCP_ALLOW_STATIC_FALLBACK?: string;
  MCP_SERVICE_TOKEN_HEADER?: string;
  MCP_ALLOWED_ORIGINS?: string;
  MCP_REQUIRE_PROTOCOL_VERSION?: string;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  OIDC_JWKS_URL?: string;
  OIDC_REQUIRED_SCOPE?: string;
  MCP_UI_PUBLIC_ORIGIN?: string;
  MCP_AUTH_UI_ORIGIN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
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
  MCP_OBJECT: DurableObjectNamespace;
  AUTH_FAILURE_LIMITER: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER?: OAuthHelpers;
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  CLOUDFLARE_AI_MODEL?: string;
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
}

export type DurableObjectLatencyDimension = 'auth_limiter' | 'session_revocation' | 'ai_chat_quota';
export type LatencySnapshot = { count: number; avg_ms: number; max_ms: number; last_ms: number };
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

export interface SessionRevocationResponseBody {
  revoked: boolean;
}

export interface UsageCounterRequestBody {
  action: 'usage_increment' | 'usage_get';
  nowMs: number;
  route?: string;
  method?: string;
}

export interface UsageCounterResponseBody {
  userId: string;
  totalRequests: number;
  todayRequests: number;
  todayDate: string;
  lastSeenAtMs: number | null;
  byRoute: Record<string, number>;
}

export type McpSessionLifecycleAction = 'mcp_session_register' | 'mcp_session_touch' | 'mcp_session_close';

export interface McpSessionLifecycleRequestBody {
  action: McpSessionLifecycleAction;
  nowMs: number;
  sessionId: string;
  idleTtlMs: number;
  absoluteTtlMs: number;
  evictionSweepLimit: number;
  shardHint?: string;
}

export type McpSessionEvictionReason = 'active' | 'missing' | 'idle_evicted' | 'absolute_evicted' | 'closed';

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
