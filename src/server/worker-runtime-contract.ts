import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

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
  MCP_UI_AI_CHAT_RATE_LIMIT_MAX?: string;
  MCP_UI_SESSION_SECRET?: string;
  MCP_UI_INSECURE_COOKIES?: string;
  MCP_UI_SESSION_REVOCATION_ENABLED?: string;
  MCP_OAUTH_REGISTRATION_TOKEN_SECRET?: string;
  MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS?: string;
  MCP_AUTH_OIDC_CLIENT_ID?: string;
  MCP_AUTH_OIDC_CLIENT_SECRET?: string;
  MCP_AUTH_OIDC_SCOPES?: string;
  MCP_OAUTH_DIAGNOSTICS?: string;
  LOGGING_ENABLED?: string;
  SAMPLING_ENABLED?: string;
  MCP_ASYNC_QUEUE_ENABLED?: string;
  /** Code Mode is an isolated future capability and must remain disabled by default. */
  CODEMODE_ENABLED?: string;
  MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_MAX?: string;
  MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_BOUNDARY_FAIL_OPEN?: string;
  MCP_CF_ANALYTICS_ENABLED?: string;
  /** Wrangler-generated binding type from the deployed Worker configuration. */
  AUTH_FAILURE_LIMITER: GeneratedMcpEnv['AUTH_FAILURE_LIMITER'];
}

/** Portal worker: OAuth, hosted auth, SPA assets, UI API (no tool registry in bundle). */
export interface WorkerEdgeEnv extends WorkerPlatformEnv {
  SPA_ASSETS: GeneratedEdgeEnv['SPA_ASSETS'];
  /** Service binding to the MCP worker (`courtlistener-mcp-mcp`). */
  MCP_SERVICE: GeneratedEdgeEnv['MCP_SERVICE'];
  OAUTH_KV: GeneratedEdgeEnv['OAUTH_KV'];
  ANALYTICS: GeneratedEdgeEnv['ANALYTICS'];
  OAUTH_PROVIDER?: OAuthHelpers;
}

/** MCP worker: stateless `/mcp`, async tool queue. */
export interface WorkerMcpEnv extends WorkerPlatformEnv {
  ASYNC_JOBS_KV: GeneratedMcpEnv['ASYNC_JOBS_KV'];
  ASYNC_TOOL_QUEUE: GeneratedMcpEnv['ASYNC_TOOL_QUEUE'];
  ANALYTICS: GeneratedMcpEnv['ANALYTICS'];
  AI: GeneratedMcpEnv['AI'];
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
  unavailableCount: number;
}

export type DurableObjectLatencyDimension = 'auth_limiter' | 'session_revocation' | 'ai_chat_quota';
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
