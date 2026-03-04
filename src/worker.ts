/// <reference types="@cloudflare/workers-types" />

/**
 * CourtListener MCP Server — Cloudflare Workers Entrypoint
 *
 * Deploys the full MCP server on Cloudflare's edge network using the
 * `agents` SDK with Durable Objects for per-session state management.
 *
 * End users connect by adding a single URL to their MCP client:
 *   { "url": "https://courtlistener-mcp.<subdomain>.workers.dev/mcp" }
 *
 * Secrets (set via `wrangler secret put`):
 *   COURTLISTENER_API_KEY  — CourtListener API token (required)
 *   MCP_AUTH_TOKEN          — Optional bearer token to restrict access
 *   OIDC_ISSUER             — Optional OIDC issuer URL for JWT validation
 *   OIDC_AUDIENCE           — Optional OIDC audience
 *   OIDC_JWKS_URL           — Optional explicit JWKS URL
 *   OIDC_REQUIRED_SCOPE     — Optional required scope
 *   SUPABASE_URL            — Optional Supabase project URL for API-key auth
 *   SUPABASE_SECRET_KEY     — Optional Supabase secret key for API-key auth and management
 *   SUPABASE_PUBLISHABLE_KEY — Optional Supabase publishable key for public email/password signup
 *   SUPABASE_API_KEYS_TABLE — Optional table override (default: mcp_api_keys)
 *   MCP_UI_PUBLIC_ORIGIN    — Optional canonical UI origin used for email confirmation redirects
 *   MCP_AUTH_PRIMARY        — Optional primary auth backend: supabase | oidc | static
 *   MCP_ALLOW_STATIC_FALLBACK — Optional migration flag; default false when stronger auth exists
 */

import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { generateId } from './common/utils.js';
import { bootstrapServices } from './infrastructure/bootstrap.js';
import { container } from './infrastructure/container.js';
import { runWithPrincipalContext } from './infrastructure/principal-context.js';
import {
  PREFERRED_MCP_PROTOCOL_VERSION,
  SERVER_CAPABILITIES,
  SUPPORTED_MCP_PROTOCOL_VERSIONS as SUPPORTED_MCP_PROTOCOL_VERSION_LIST,
} from './infrastructure/protocol-constants.js';
import type { Logger } from './infrastructure/logger.js';
import type { MetricsCollector } from './infrastructure/metrics.js';
import { ToolHandlerRegistry } from './server/tool-handler.js';
import { ResourceHandlerRegistry } from './server/resource-handler.js';
import { PromptHandlerRegistry } from './server/prompt-handler.js';
import { SubscriptionManager } from './server/subscription-manager.js';
import { buildToolDefinitions, buildEnhancedMetadata } from './server/tool-builder.js';
import { setupHandlers } from './server/handler-registry.js';
import { createDirectToolExecutionService } from './server/tool-execution-service.js';
import {
  handleDelegatedWorkerRoutes,
  type WorkerDelegatedRouteDeps,
} from './server/worker-route-composition.js';
import { authorizeMcpGatewayRequest } from './server/mcp-gateway-auth.js';
import { buildMcpCorsHeaders } from './server/transport-boundary-headers.js';
import {
  extractBearerToken,
  isAllowedOrigin,
  parseAllowedOrigins,
  parseBoolean,
} from './server/worker-security.js';
import {
  authenticateUserWithAnonKey,
  authenticateUserWithPassword,
  confirmUserEmail,
  createApiKeyForUser,
  exchangeRecoveryTokenHash,
  getSupabaseManagementConfig,
  getSupabaseSignupConfig,
  getSupabaseUserFromAccessToken,
  listApiKeysForUser,
  logAuditEvent,
  resetPasswordWithAccessToken,
  resolvePrincipalFromApiToken,
  revokeApiKeyForUser,
  sendPasswordResetEmail,
  signUpSupabaseUser,
  getOAuthAuthorizationDetails,
  submitOAuthAuthorizationConsent,
  type SupabaseOAuthAuthorizationDetails,
} from './server/supabase-management.js';
import { SPA_BUILD_ID, SPA_CSS, SPA_JS } from './web/spa-assets.js';
import { renderSpaShellHtml } from './web/spa-shell.js';

// ---------------------------------------------------------------------------
// Cloudflare Worker environment bindings
// ---------------------------------------------------------------------------

interface Env {
  /** CourtListener API token — set via `wrangler secret put COURTLISTENER_API_KEY` */
  COURTLISTENER_API_KEY?: string;
  /** Optional bearer token to gate access — set via `wrangler secret put MCP_AUTH_TOKEN` */
  MCP_AUTH_TOKEN?: string;
  /** Preferred auth backend: supabase | oidc | static (defaults to supabase when configured) */
  MCP_AUTH_PRIMARY?: string;
  /** Set to true only during migration windows to allow static fallback with primary auth */
  MCP_ALLOW_STATIC_FALLBACK?: string;
  /** Optional comma-separated CORS allow-list (e.g. https://app.example.com,https://chat.example.com) */
  MCP_ALLOWED_ORIGINS?: string;
  /** Set to "true" to require MCP-Protocol-Version on MCP POST requests */
  MCP_REQUIRE_PROTOCOL_VERSION?: string;
  /** OIDC issuer URL for JWT validation (also supports Cloudflare Access JWT assertion header) */
  OIDC_ISSUER?: string;
  /** Expected audience claim for OIDC token validation */
  OIDC_AUDIENCE?: string;
  /** Optional explicit JWKS URL override */
  OIDC_JWKS_URL?: string;
  /** Optional required scope for OIDC token validation */
  OIDC_REQUIRED_SCOPE?: string;
  /** Optional Supabase URL for API-key auth */
  SUPABASE_URL?: string;
  /** Optional Supabase secret key for API-key auth and management */
  SUPABASE_SECRET_KEY?: string;
  /** Optional Supabase publishable key for public email/password signup */
  SUPABASE_PUBLISHABLE_KEY?: string;
  /** Optional Supabase API keys table (default mcp_api_keys) */
  SUPABASE_API_KEYS_TABLE?: string;
  /** Optional canonical UI origin used for email confirmation redirects */
  MCP_UI_PUBLIC_ORIGIN?: string;
  /** Optional Turnstile site key for browser signup challenge */
  TURNSTILE_SITE_KEY?: string;
  /** Optional Turnstile secret key for server-side verification */
  TURNSTILE_SECRET_KEY?: string;
  /** Auth failure limiter toggle (default true) */
  MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED?: string;
  /** Max failed auth attempts per window per client (default 20) */
  MCP_AUTH_FAILURE_RATE_LIMIT_MAX?: string;
  /** Sliding window in seconds for failed auth tracking (default 300) */
  MCP_AUTH_FAILURE_RATE_LIMIT_WINDOW_SECONDS?: string;
  /** Temporary block duration in seconds once threshold hit (default 600) */
  MCP_AUTH_FAILURE_RATE_LIMIT_BLOCK_SECONDS?: string;
  /** Toggle for signup and keys UI API rate limits (default true) */
  MCP_UI_RATE_LIMIT_ENABLED?: string;
  /** Signup requests allowed per window (default 8) */
  MCP_UI_SIGNUP_RATE_LIMIT_MAX?: string;
  /** Signup window in seconds (default 300) */
  MCP_UI_SIGNUP_RATE_LIMIT_WINDOW_SECONDS?: string;
  /** Signup block duration in seconds after threshold (default 900) */
  MCP_UI_SIGNUP_RATE_LIMIT_BLOCK_SECONDS?: string;
  /** Key API requests allowed per window (default 120) */
  MCP_UI_KEYS_RATE_LIMIT_MAX?: string;
  /** Key API window in seconds (default 300) */
  MCP_UI_KEYS_RATE_LIMIT_WINDOW_SECONDS?: string;
  /** Key API block duration in seconds after threshold (default 300) */
  MCP_UI_KEYS_RATE_LIMIT_BLOCK_SECONDS?: string;
  /** Hosted AI chat lifetime request cap per user (default 10) */
  MCP_UI_AI_CHAT_RATE_LIMIT_MAX?: string;
  /** Maximum allowed API key TTL in days (default 90) */
  MCP_API_KEY_MAX_TTL_DAYS?: string;
  /** Secret used to sign UI session cookies */
  MCP_UI_SESSION_SECRET?: string;
  /** Temporary migration flag to allow using SUPABASE_SECRET_KEY for UI sessions when MCP_UI_SESSION_SECRET is unset */
  MCP_UI_ALLOW_SUPABASE_SECRET_FALLBACK?: string;
  /** Allow non-Secure UI cookies for local HTTP development (default false) */
  MCP_UI_INSECURE_COOKIES?: string;
  /** Enable server-side UI session revocation checks via Durable Objects (default true) */
  MCP_UI_SESSION_REVOCATION_ENABLED?: string;
  /** Durable Object binding (auto-wired by wrangler.jsonc) */
  MCP_OBJECT: DurableObjectNamespace;
  /** Durable Object binding for auth failure rate limiting */
  AUTH_FAILURE_LIMITER: DurableObjectNamespace;
  /** Cloudflare Workers AI binding for chat summarization */
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  /** Optional override for Cloudflare AI model */
  CLOUDFLARE_AI_MODEL?: string;
}

// ---------------------------------------------------------------------------
// MCP Agent — one Durable Object instance per client session
// ---------------------------------------------------------------------------

// SDK version bridge: agents@0.5 bundles SDK 1.26, our project uses 1.27.
// The APIs are compatible at runtime; casts bridge the type-level gap.

export class CourtListenerMCP extends (McpAgent as typeof McpAgent<Env>) {
  server = new McpServer(
    { name: 'courtlistener-mcp', version: '0.1.0' },
    { capabilities: SERVER_CAPABILITIES },
  ) as unknown as InstanceType<typeof McpAgent>['server'];

  async init(): Promise<void> {
    // Propagate Cloudflare secrets into process.env so our existing
    // config system (getConfig()) picks them up unchanged.
    const env = (this as unknown as { env: Env }).env;
    if (env.COURTLISTENER_API_KEY) {
      process.env.COURTLISTENER_API_KEY = env.COURTLISTENER_API_KEY;
    }

    // Bootstrap the full DI container (config, logger, cache, API client,
    // tool / resource / prompt registries, circuit breakers, etc.)
    bootstrapServices();

    const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    const resourceRegistry = container.get<ResourceHandlerRegistry>('resourceRegistry');
    const promptRegistry = container.get<PromptHandlerRegistry>('promptRegistry');
    const logger = container.get<Logger>('logger');
    const metrics = container.get<MetricsCollector>('metrics');
    const enhancedMetadata = buildEnhancedMetadata();
    const toolExecutionService = createDirectToolExecutionService({ toolRegistry, logger });

    // Wire all existing MCP protocol handlers onto the low-level Server
    // that lives inside McpServer.  Because we never call
    // this.server.tool() / .resource() / .prompt(), the high-level
    // McpServer won't register conflicting handlers.
    const lowLevelServer = (this.server as unknown as McpServer).server;

    setupHandlers({
      server: lowLevelServer,
      logger,
      metrics,
      subscriptionManager: new SubscriptionManager(),
      listTools: async () => ({
        tools: buildToolDefinitions(toolRegistry, enhancedMetadata),
        metadata: { categories: toolRegistry.getCategories() },
      }),
      listResources: async () => ({ resources: resourceRegistry.getAllResources() }),
      readResource: async (uri) => {
        const handler = resourceRegistry.findHandler(uri);
        if (!handler) {
          throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${uri}`);
        }
        return handler.read(uri, {
          logger,
          requestId: generateId(),
        });
      },
      listPrompts: async () => ({ prompts: promptRegistry.getAllPrompts() }),
      getPrompt: async (name, args = {}) => {
        const handler = promptRegistry.findHandler(name);
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
        }
        return handler.getMessages(args);
      },
      executeTool: async (req: CallToolRequest): Promise<CallToolResult> => {
        try {
          return await toolExecutionService.execute(req, generateId());
        } catch (error) {
          if (error instanceof McpError) {
            throw error;
          }
          throw new McpError(
            ErrorCode.InternalError,
            `Error executing ${req.params.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Workers fetch handler — thin wrapper around McpAgent.serve()
// ---------------------------------------------------------------------------

const mcpStreamableHandler = CourtListenerMCP.serve('/mcp');
const mcpSseCompatibilityHandler = CourtListenerMCP.serve('/sse');
const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set(SUPPORTED_MCP_PROTOCOL_VERSION_LIST);

const DEFAULT_AUTH_FAILURE_LIMIT_MAX = 20;
const DEFAULT_AUTH_FAILURE_WINDOW_SECONDS = 300;
const DEFAULT_AUTH_FAILURE_BLOCK_SECONDS = 600;
const DEFAULT_UI_SIGNUP_RATE_LIMIT_MAX = 8;
const DEFAULT_UI_SIGNUP_RATE_LIMIT_WINDOW_SECONDS = 300;
const DEFAULT_UI_SIGNUP_RATE_LIMIT_BLOCK_SECONDS = 900;
const DEFAULT_UI_KEYS_RATE_LIMIT_MAX = 120;
const DEFAULT_UI_KEYS_RATE_LIMIT_WINDOW_SECONDS = 300;
const DEFAULT_UI_KEYS_RATE_LIMIT_BLOCK_SECONDS = 300;
const DEFAULT_UI_AI_CHAT_RATE_LIMIT_MAX = 50;
const DEFAULT_API_KEY_MAX_TTL_DAYS = 90;

interface LatencyStats {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
}

type DurableObjectLatencyDimension = 'auth_limiter' | 'session_revocation' | 'ai_chat_quota';
type LatencySnapshot = { count: number; avg_ms: number; max_ms: number; last_ms: number };
type SlowOperationSnapshot = LatencySnapshot & { operation: string; slow_score: number };
type DurableObjectOutlierSignal = LatencySnapshot & {
  dimension: DurableObjectLatencyDimension;
  outlier_score: number;
  is_outlier: boolean;
};
const WORKER_EXPORT_TOP_SLOW_OPERATION_LIMIT = 5;
const WORKER_DO_OUTLIER_SCORE_THRESHOLD = 2.5;
const WORKER_DO_OUTLIER_MIN_SAMPLES = 3;

interface AuthFailureState {
  count: number;
  windowStartedAtMs: number;
  blockedUntilMs: number;
}

interface AuthFailureLimiterRequestBody {
  action: 'check' | 'record' | 'clear';
  nowMs: number;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
}

interface SessionRevocationRequestBody {
  action: 'session_check' | 'session_revoke';
  nowMs: number;
  revokeUntilMs?: number;
}

interface SessionTokenRequestBody {
  action: 'session_store_token' | 'session_get_token' | 'session_clear_token';
  nowMs: number;
  token?: string;
  tokenExpiresAtMs?: number;
}

interface AuthFailureLimiterResponseBody {
  blocked: boolean;
  retryAfterSeconds: number;
  state: AuthFailureState;
}

interface SessionRevocationResponseBody {
  revoked: boolean;
}

interface SessionTokenResponseBody {
  hasToken: boolean;
  token: string | null;
}

interface LifetimeQuotaRequestBody {
  action: 'quota_increment_check';
  maxAllowed: number;
}

interface LifetimeQuotaResponseBody {
  blocked: boolean;
  used: number;
  limit: number;
  remaining: number;
}

interface McpJsonRpcResponse<T> {
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const DEFAULT_AUTH_FAILURE_STATE: AuthFailureState = {
  count: 0,
  windowStartedAtMs: 0,
  blockedUntilMs: 0,
};
const workerRouteLatency = new Map<string, LatencyStats>();
const WORKER_ROUTE_LATENCY_MAX_ROUTES = 64;
const WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE = 'OTHER';
const allowedOriginsCache = new Map<string, string[]>();
const durableObjectLatency: Record<DurableObjectLatencyDimension, LatencyStats> = {
  auth_limiter: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 },
  session_revocation: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 },
  ai_chat_quota: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 },
};
const DEFAULT_CF_AI_MODEL_CHEAP = '@cf/meta/llama-3.1-8b-instruct-fast';
const DEFAULT_CF_AI_MODEL_BALANCED = '@cf/meta/llama-3.1-8b-instruct-fast';
const CHEAP_MODE_MAX_TOKENS = 800;
const BALANCED_MODE_MAX_TOKENS = 2000;

function recordLatency(stats: LatencyStats, elapsedMs: number): void {
  const durationMs = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0;
  stats.count += 1;
  stats.totalMs += durationMs;
  if (durationMs > stats.maxMs) {
    stats.maxMs = durationMs;
  }
  stats.lastMs = durationMs;
}

function normalizeRouteSegment(segment: string): string {
  if (!segment) return segment;
  if (/^\d+$/.test(segment)) return ':id';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)) {
    return ':uuid';
  }
  if (/^[A-Za-z0-9_-]{24,}$/.test(segment)) return ':token';
  return segment;
}

function buildWorkerRouteMetricKey(method: string, pathname: string): string {
  const normalizedPath = pathname
    .split('/')
    .map((segment) => normalizeRouteSegment(segment))
    .join('/');
  return `${method.toUpperCase()} ${normalizedPath || '/'}`;
}

function recordRouteLatency(route: string, elapsedMs: number): void {
  const overflowExists = workerRouteLatency.has(WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE);
  const routeCap = overflowExists ? WORKER_ROUTE_LATENCY_MAX_ROUTES : WORKER_ROUTE_LATENCY_MAX_ROUTES - 1;
  const routeKey =
    workerRouteLatency.has(route) || workerRouteLatency.size < routeCap
      ? route
      : WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE;
  const stats = workerRouteLatency.get(routeKey);
  if (stats) {
    recordLatency(stats, elapsedMs);
    return;
  }

  const durationMs = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0;
  workerRouteLatency.set(routeKey, {
    count: 1,
    totalMs: durationMs,
    maxMs: durationMs,
    lastMs: durationMs,
  });
}

function recordDurableObjectLatency(dimension: DurableObjectLatencyDimension, elapsedMs: number): void {
  recordLatency(durableObjectLatency[dimension], elapsedMs);
}

function getCachedAllowedOrigins(rawAllowedOrigins: string | undefined): string[] {
  const cacheKey = rawAllowedOrigins ?? '';
  const cached = allowedOriginsCache.get(cacheKey);
  if (cached) return cached;
  const parsed = parseAllowedOrigins(rawAllowedOrigins);
  allowedOriginsCache.set(cacheKey, parsed);
  return parsed;
}

function getLatencySnapshot(stats: LatencyStats): LatencySnapshot {
  return {
    count: stats.count,
    avg_ms: stats.count > 0 ? Number((stats.totalMs / stats.count).toFixed(2)) : 0,
    max_ms: Number(stats.maxMs.toFixed(2)),
    last_ms: Number(stats.lastMs.toFixed(2)),
  };
}

function getWorkerLatencySnapshot(): {
  routes: Record<string, LatencySnapshot>;
  durable_objects: Record<DurableObjectLatencyDimension, LatencySnapshot>;
  export_snapshot: {
    generated_at: string;
    top_slow_operations: SlowOperationSnapshot[];
    durable_object_latency_outliers: DurableObjectOutlierSignal[];
  };
} {
  const routes: Record<string, LatencySnapshot> = {};
  for (const [route, stats] of workerRouteLatency.entries()) {
    routes[route] = getLatencySnapshot(stats);
  }

  const durableObjects = {
    auth_limiter: getLatencySnapshot(durableObjectLatency.auth_limiter),
    session_revocation: getLatencySnapshot(durableObjectLatency.session_revocation),
    ai_chat_quota: getLatencySnapshot(durableObjectLatency.ai_chat_quota),
  };
  const topSlowOperations = Object.entries(routes)
    .map(([operation, snapshot]) => ({
      operation,
      ...snapshot,
      slow_score: Number((snapshot.avg_ms * 0.7 + snapshot.max_ms * 0.3).toFixed(2)),
    }))
    .sort((a, b) => b.slow_score - a.slow_score || b.count - a.count)
    .slice(0, WORKER_EXPORT_TOP_SLOW_OPERATION_LIMIT);
  const durableObjectSamples = Object.values(durableObjects).filter((snapshot) => snapshot.count > 0);
  const durableObjectGlobalAvg =
    durableObjectSamples.length > 0
      ? durableObjectSamples.reduce((sum, snapshot) => sum + snapshot.avg_ms, 0) / durableObjectSamples.length
      : 0;
  const durableObjectLatencyOutliers: DurableObjectOutlierSignal[] = (
    Object.entries(durableObjects) as Array<[DurableObjectLatencyDimension, LatencySnapshot]>
  )
    .map(([dimension, snapshot]) => {
      const selfRatioAvg = snapshot.avg_ms > 0 ? snapshot.max_ms / snapshot.avg_ms : 0;
      const selfRatioLast = snapshot.avg_ms > 0 ? snapshot.last_ms / snapshot.avg_ms : 0;
      const globalRatio = durableObjectGlobalAvg > 0 ? snapshot.avg_ms / durableObjectGlobalAvg : 0;
      const outlierScore = Number(Math.max(selfRatioAvg, selfRatioLast, globalRatio).toFixed(2));
      return {
        dimension,
        ...snapshot,
        outlier_score: outlierScore,
        is_outlier:
          snapshot.count >= WORKER_DO_OUTLIER_MIN_SAMPLES && outlierScore >= WORKER_DO_OUTLIER_SCORE_THRESHOLD,
      };
    })
    .sort((a, b) => b.outlier_score - a.outlier_score);

  return {
    routes,
    durable_objects: durableObjects,
    export_snapshot: {
      generated_at: new Date().toISOString(),
      top_slow_operations: topSlowOperations,
      durable_object_latency_outliers: durableObjectLatencyOutliers,
    },
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function extractMcpResponseBody(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }
  const dataLines = trimmed
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (dataLines.length === 0) return {};
  return JSON.parse(dataLines[dataLines.length - 1] ?? '{}');
}

function aiToolFromPrompt(message: string): { tool: string; reason: string } {
  const normalized = message.toLowerCase();
  if (/\d+\s+(u\.?s\.?|s\.?\s*ct\.?|f\.\s*\d|f\.?\s*supp)/i.test(message) || normalized.includes('v.')) {
    return { tool: 'lookup_citation', reason: 'Query contains a legal citation pattern (e.g., "v." or reporter reference).' };
  }
  if (normalized.includes('opinion') || normalized.includes('holding') || normalized.includes('ruling')) {
    return { tool: 'search_opinions', reason: 'Query mentions opinions, holdings, or rulings.' };
  }
  if (normalized.includes('judge') && (normalized.includes('profile') || normalized.includes('background') || normalized.includes('record'))) {
    return { tool: 'get_comprehensive_judge_profile', reason: 'Query asks for a judge profile or background.' };
  }
  if (normalized.includes('court') && (normalized.includes('list') || normalized.includes('which') || normalized.includes('all'))) {
    return { tool: 'list_courts', reason: 'Query asks to list or identify courts.' };
  }
  if (normalized.includes('docket') || normalized.includes('filing')) {
    return { tool: 'get_docket_entries', reason: 'Query mentions dockets or filings.' };
  }
  if (normalized.includes('citation') && (normalized.includes('valid') || normalized.includes('check') || normalized.includes('verify'))) {
    return { tool: 'validate_citations', reason: 'Query asks to validate or check citations.' };
  }
  if (normalized.includes('argument') || normalized.includes('precedent') || normalized.includes('legal analysis')) {
    return { tool: 'analyze_legal_argument', reason: 'Query involves legal argument analysis or precedent research.' };
  }
  return { tool: 'search_cases', reason: 'Default: general case search for broad legal queries.' };
}

function aiToolArguments(toolName: string, prompt: string): Record<string, unknown> {
  if (toolName === 'lookup_citation') {
    return { citation: prompt };
  }
  if (toolName === 'validate_citations') {
    return { text: prompt };
  }
  if (toolName === 'analyze_legal_argument') {
    return { argument: prompt, search_query: prompt };
  }
  if (toolName === 'list_courts') {
    return {};
  }
  if (toolName === 'get_comprehensive_judge_profile' || toolName === 'get_judge') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { judge_id: idMatch[1] } : { judge_id: '1' };
  }
  if (toolName === 'get_docket_entries') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { docket: idMatch[1] } : { docket: '1' };
  }
  if (toolName === 'get_case_details' || toolName === 'get_comprehensive_case_analysis') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { cluster_id: idMatch[1] } : { cluster_id: '1' };
  }
  if (toolName === 'get_opinion_text') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { opinion_id: idMatch[1] } : { opinion_id: '1' };
  }
  if (toolName === 'get_citation_network') {
    const idMatch = prompt.match(/\b(\d+)\b/);
    return idMatch ? { opinion_id: idMatch[1], depth: 2 } : { opinion_id: '1', depth: 2 };
  }
  if (toolName === 'smart_search') {
    return { query: prompt, max_results: 5 };
  }
  // Default: works for search_cases, search_opinions, advanced_search
  return {
    query: prompt,
    page_size: 5,
    order_by: 'score desc',
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasValidMcpRpcShape(payload: unknown): boolean {
  if (!isPlainObject(payload)) return false;
  if ('error' in payload && isPlainObject(payload.error)) return true;
  if ('result' in payload) return true;
  return false;
}

/** Build a tool-appropriate system prompt based on what MCP tool was called. */
function buildMcpSystemPrompt(toolName: string, hasHistory: boolean): string {
  const commonRules = [
    'ACCURACY RULES:',
    '- ONLY cite names, dates, and details that appear in the data below.',
    '- NEVER invent or hallucinate information not present in the data.',
    '- If data is limited, acknowledge that and work with what you have.',
    '- Quote directly from the data when relevant.',
  ];

  const followUp = hasHistory ? 'Reference prior conversation context when relevant.' : '';

  // Court listing queries
  if (toolName === 'list_courts' || toolName === 'get_court') {
    return [
      'You are an expert legal research analyst with access to CourtListener, a comprehensive legal database.',
      'You have been given REAL court data retrieved from CourtListener. Present this data clearly and completely.',
      '',
      ...commonRules,
      '',
      'FORMAT your response with these sections:',
      '**Courts Overview**: A 1-2 sentence summary of what was found.',
      '**Court Listing**: Present ALL courts from the data in a clear, organized format grouped by jurisdiction type (Federal, State, etc.). Include court name, jurisdiction, and any other available details.',
      '**Suggested Follow-up**: One specific follow-up query to explore further.',
      followUp,
    ].filter(Boolean).join('\n');
  }

  // Judge queries
  if (toolName.includes('judge')) {
    return [
      'You are an expert legal research analyst with access to CourtListener, a comprehensive legal database.',
      'You have been given REAL judge data retrieved from CourtListener. Present this data clearly.',
      '',
      ...commonRules,
      '',
      'FORMAT your response with these sections:',
      '**Judge Profile**: Present the judge information from the data — name, court, appointment details, and any available background.',
      '**Notable Details**: Any significant details from the data about their career or decisions.',
      '**Suggested Follow-up**: One specific follow-up query to explore further.',
      followUp,
    ].filter(Boolean).join('\n');
  }

  // Docket queries
  if (toolName.includes('docket')) {
    return [
      'You are an expert legal research analyst with access to CourtListener, a comprehensive legal database.',
      'You have been given REAL docket data retrieved from CourtListener. Present this data clearly.',
      '',
      ...commonRules,
      '',
      'FORMAT your response with these sections:',
      '**Docket Summary**: Summarize the docket — case name, court, parties, status.',
      '**Key Filings**: List the most important entries with dates and descriptions.',
      '**Suggested Follow-up**: One specific follow-up query to explore further.',
      followUp,
    ].filter(Boolean).join('\n');
  }

  // Citation queries
  if (toolName === 'lookup_citation' || toolName === 'validate_citations' || toolName === 'get_citation_network') {
    return [
      'You are an expert legal research analyst with access to CourtListener, a comprehensive legal database.',
      'You have been given REAL citation data retrieved from CourtListener. Analyze and present it clearly.',
      '',
      ...commonRules,
      '',
      'FORMAT your response with these sections:',
      '**Citation Details**: Present the citation information — case name, court, date, and full citation.',
      '**Significance**: Explain the importance of this case based on citation count and other available data.',
      '**Suggested Follow-up**: One specific follow-up query to explore further.',
      followUp,
    ].filter(Boolean).join('\n');
  }

  // Default: case search / legal analysis (search_cases, search_opinions, analyze_legal_argument, etc.)
  return [
    'You are an expert legal research analyst with access to CourtListener, a comprehensive legal database, via MCP tools.',
    'You have been given REAL case data retrieved from CourtListener. Your job is to ANALYZE this data and provide substantive legal insight.',
    '',
    'ANALYSIS INSTRUCTIONS:',
    '- Synthesize the case data into a coherent legal analysis that directly answers the user\'s question.',
    '- Identify key legal principles, trends, and holdings from the returned cases.',
    '- Explain how the cases relate to each other and to the user\'s query.',
    '- Highlight the most important or frequently-cited cases and explain WHY they matter.',
    '- Note any circuit splits, evolving standards, or notable dissents if apparent from the data.',
    '',
    ...commonRules,
    '',
    'FORMAT your response with these sections:',
    '**Legal Analysis**: A substantive 3-5 sentence analysis answering the user\'s question, synthesizing findings from the case data.',
    '**Key Cases Found**: The 3-5 most relevant cases with their citations, courts, dates, and a brief note on why each matters.',
    '**Legal Landscape**: 1-2 sentences on the broader legal landscape — are courts aligned? Is the law settled or evolving?',
    '**Suggested Follow-up**: One specific follow-up query to deepen the research.',
    followUp,
  ].filter(Boolean).join('\n');
}

function buildLowCostSummary(
  message: string,
  toolName: string,
  mcpPayload: unknown,
): string {
  // Try structured formatting first
  try {
    const payload = mcpPayload as Record<string, unknown>;
    const result = payload?.result as Record<string, unknown> | undefined;
    const content = result?.content as Array<{ type?: string; text?: string }> | undefined;
    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find((c) => c.type === 'text' && c.text);
      if (textItem?.text) {
        const parsed = JSON.parse(textItem.text);
        if (parsed && typeof parsed === 'object') {
          const formatted = formatMcpDataForLlm(toolName, parsed);
          if (formatted) {
            return [
              `**Legal Analysis**: CourtListener search via \`${toolName}\` returned the following results for: "${message}"`,
              '',
              `**Key Cases Found**:`,
              formatted.slice(0, 3000),
              '',
              '**Legal Landscape**: This is a fallback summary — the AI analysis model was unavailable. The raw case data above provides the actual court records for your research.',
              '',
              '**Suggested Follow-up**: Try narrowing by court, date range, or specific citation for more targeted results.',
            ].join('\n');
          }
        }
      }
    }
  } catch { /* fall through */ }

  const payloadText = JSON.stringify(mcpPayload);
  const compact = payloadText.length > 1200 ? `${payloadText.slice(0, 1200)}...` : payloadText;
  return [
    `**Legal Analysis**: Ran \`${toolName}\` for: "${message}"`,
    '',
    '**Raw Data**:',
    compact,
    '',
    '**Suggested Follow-up**: Try narrowing by court, date range, or specific citation for more targeted results.',
  ].join('\n');
}

/**
 * Extract and format key structured fields from MCP response for LLM consumption.
 * Parses search results into a clean, readable text format instead of raw JSON.
 */
function extractMcpContext(toolName: string, mcpPayload: unknown, maxLen: number): string {
  try {
    const payload = mcpPayload as Record<string, unknown>;
    const result = payload?.result as Record<string, unknown> | undefined;
    const content = result?.content as Array<{ type?: string; text?: string }> | undefined;

    // Try to parse structured data from content[].text
    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find((c) => c.type === 'text' && c.text);
      if (textItem?.text) {
        try {
          const parsed = JSON.parse(textItem.text);
          if (parsed && typeof parsed === 'object') {
            const formatted = formatMcpDataForLlm(toolName, parsed);
            if (formatted) {
              const trimmed = formatted.length > maxLen ? `${formatted.slice(0, maxLen)}... [truncated]` : formatted;
              return `Tool: ${toolName}\n\n${trimmed}`;
            }
          }
        } catch {
          // Not JSON — use as-is
          const texts = content
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text as string)
            .join('\n\n');
          if (texts.length > 0) {
            const trimmed = texts.length > maxLen ? `${texts.slice(0, maxLen)}... [truncated]` : texts;
            return `Tool: ${toolName}\n\nData returned:\n${trimmed}`;
          }
        }
      }
    }

    // Fallback: stringify the payload
    const raw = JSON.stringify(mcpPayload);
    return `Tool: ${toolName}\n\nRaw response:\n${raw.length > maxLen ? `${raw.slice(0, maxLen)}... [truncated]` : raw}`;
  } catch {
    const raw = JSON.stringify(mcpPayload);
    return `Tool: ${toolName}\n\nRaw response:\n${raw.slice(0, maxLen)}`;
  }
}

/**
 * Format structured MCP data into clean, readable text for the LLM.
 * Handles search results, entity lookups, analyses, etc.
 */
function formatMcpDataForLlm(toolName: string, data: Record<string, unknown>): string | null {
  const lines: string[] = [];

  // Handle search results (search_cases, search_opinions, etc.)
  const results = data.data as Record<string, unknown> | unknown[] | undefined;
  const pagination = data.pagination as Record<string, unknown> | undefined;

  // Search results with nested data.results or data.analysis pattern
  if (results && typeof results === 'object' && !Array.isArray(results)) {
    const nested = results as Record<string, unknown>;
    const summary = nested.summary as string | undefined;
    const items = nested.results as unknown[] | undefined;
    const searchParams = nested.search_parameters as Record<string, unknown> | undefined;
    const innerPagination = nested.pagination as Record<string, unknown> | undefined;

    // Handle analysis results nested under data.analysis (e.g., analyze_legal_argument)
    const nestedAnalysis = nested.analysis as Record<string, unknown> | undefined;
    if (nestedAnalysis && typeof nestedAnalysis === 'object') {
      if (nestedAnalysis.summary) lines.push(`Analysis: ${nestedAnalysis.summary}`);
      if (nestedAnalysis.query_used) lines.push(`Query: ${nestedAnalysis.query_used}`);
      if (typeof nestedAnalysis.total_found === 'number') lines.push(`Total opinions found: ${nestedAnalysis.total_found}`);

      const topCases = nestedAnalysis.top_cases as unknown[] | undefined;
      if (Array.isArray(topCases) && topCases.length > 0) {
        lines.push(`\nTop ${topCases.length} relevant cases:`);
        for (let i = 0; i < topCases.length; i++) {
          lines.push(formatSearchResult(i + 1, topCases[i] as Record<string, unknown>));
        }
      }
    }

    // Handle court listings (data.courts array from list_courts)
    const courts = nested.courts as unknown[] | undefined;
    if (Array.isArray(courts) && courts.length > 0) {
      lines.push(`\n${courts.length} courts found:`);
      for (let i = 0; i < courts.length; i++) {
        const c = courts[i] as Record<string, unknown>;
        lines.push(formatCourtResult(i + 1, c));
      }
    }

    // Handle judge data (data.judges or single judge profile)
    const judges = nested.judges as unknown[] | undefined;
    if (Array.isArray(judges) && judges.length > 0) {
      lines.push(`\n${judges.length} judges found:`);
      for (let i = 0; i < judges.length; i++) {
        const j = judges[i] as Record<string, unknown>;
        const name = j.name_full || j.name || `${j.name_first || ''} ${j.name_last || ''}`.trim() || 'Unknown';
        const court = j.court || '';
        const born = j.date_dob || '';
        const appointed = j.date_nominated || j.date_appointed || '';
        const parts = [`${i + 1}. ${name}`];
        if (court) parts.push(`Court: ${court}`);
        if (born) parts.push(`Born: ${born}`);
        if (appointed) parts.push(`Appointed: ${appointed}`);
        lines.push(parts.join(' | '));
      }
    }

    if (summary) lines.push(`Summary: ${summary}`);
    if (searchParams?.query) lines.push(`Search query: ${searchParams.query}`);

    const pag = innerPagination || pagination;
    if (pag) {
      lines.push(`Total results: ${pag.totalResults ?? pag.total_results ?? 'unknown'}, Page ${pag.currentPage ?? pag.current_page ?? 1} of ${pag.totalPages ?? pag.total_pages ?? '?'}`);
    }

    if (Array.isArray(items) && items.length > 0) {
      lines.push(`\nTop ${items.length} results:`);
      for (let i = 0; i < items.length; i++) {
        const item = items[i] as Record<string, unknown>;
        lines.push(formatSearchResult(i + 1, item));
      }
    }
  }

  // Direct array of results
  if (Array.isArray(results) && results.length > 0) {
    if (pagination) {
      lines.push(`Total results: ${pagination.totalResults ?? pagination.total_results ?? 'unknown'}, Page ${pagination.currentPage ?? pagination.current_page ?? 1}`);
    }
    lines.push(`\nTop ${results.length} results:`);
    for (let i = 0; i < results.length; i++) {
      const item = results[i] as Record<string, unknown>;
      lines.push(formatSearchResult(i + 1, item));
    }
  }

  // Analysis results (e.g., analyze_legal_argument)
  if (data.analysis && typeof data.analysis === 'object') {
    const analysis = data.analysis as Record<string, unknown>;
    if (analysis.summary) lines.push(`Analysis: ${analysis.summary}`);
    if (analysis.query_used) lines.push(`Query: ${analysis.query_used}`);
    if (typeof analysis.total_found === 'number') lines.push(`Total opinions found: ${analysis.total_found}`);

    const topCases = analysis.top_cases as unknown[] | undefined;
    if (Array.isArray(topCases) && topCases.length > 0) {
      lines.push(`\nTop ${topCases.length} relevant cases:`);
      for (let i = 0; i < topCases.length; i++) {
        const item = topCases[i] as Record<string, unknown>;
        lines.push(formatSearchResult(i + 1, item));
      }
    } else if (!lines.some(l => l.startsWith('Top '))) {
      lines.push(JSON.stringify(analysis, null, 2));
    }
  }

  // If we couldn't extract structured data, return null to fall back
  if (lines.length === 0) return null;

  return lines.join('\n');
}

/** Format a single search result into readable text. */
function formatSearchResult(num: number, item: Record<string, unknown>): string {
  const parts: string[] = [];
  const caseName = item.case_name || item.caseName || item.name || item.case_name_short || '';
  const court = item.court || item.court_id || '';
  const dateFiled = item.date_filed || item.dateFiled || '';
  const citation =
    item.federal_cite_one || item.state_cite_one || item.neutral_cite ||
    item.citation || item.citation_string || '';
  const citationCount = item.citation_count ?? item.citationCount;
  const status = item.precedential_status || item.status || '';
  const url = item.absolute_url || item.url || '';
  const snippet = item.snippet || item.summary || item.syllabus || '';

  parts.push(`${num}. ${caseName || 'Untitled'}`);
  if (court) parts.push(`   Court: ${court}`);
  if (dateFiled) parts.push(`   Date: ${dateFiled}`);
  if (citation) parts.push(`   Citation: ${citation}`);
  if (citationCount !== undefined && citationCount !== null) parts.push(`   Cited ${citationCount} times`);
  if (status) parts.push(`   Status: ${status}`);
  if (url) parts.push(`   URL: https://www.courtlistener.com${url}`);
  if (snippet) {
    const cleanSnippet = String(snippet).replace(/<[^>]+>/g, '').slice(0, 300);
    parts.push(`   Snippet: ${cleanSnippet}`);
  }

  return parts.join('\n');
}

/** Format a single court into readable text. */
function formatCourtResult(num: number, court: Record<string, unknown>): string {
  const name = court.full_name || court.short_name || court.name || 'Unknown Court';
  const id = court.id || '';
  const jurisdiction = court.jurisdiction || '';
  const citationStr = court.citation_string || '';
  const inUse = court.in_use;
  const startDate = court.start_date || '';
  const url = court.url || court.resource_uri || '';

  const parts = [`${num}. ${name}`];
  if (id) parts.push(`   ID: ${id}`);
  if (jurisdiction) parts.push(`   Jurisdiction: ${jurisdiction}`);
  if (citationStr) parts.push(`   Citation format: ${citationStr}`);
  if (startDate) parts.push(`   Established: ${startDate}`);
  if (typeof inUse === 'boolean') parts.push(`   Active: ${inUse ? 'Yes' : 'No'}`);
  if (url) parts.push(`   URL: ${url}`);
  return parts.join('\n');
}

async function callMcpJsonRpc(
  env: Env,
  ctx: ExecutionContext,
  token: string,
  method: string,
  params: Record<string, unknown>,
  id: number,
  sessionId?: string,
): Promise<{ payload: unknown; sessionId: string | null }> {
  // Resolve the best available token for internal MCP calls:
  // 1. MCP_AUTH_TOKEN (static secret) is the most reliable for internal use
  // 2. Fall back to the user-provided token if no static token is configured
  const effectiveToken = env.MCP_AUTH_TOKEN?.trim() || token;

  const headers = new Headers({
    authorization: `Bearer ${effectiveToken}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': PREFERRED_MCP_PROTOCOL_VERSION,
  });
  if (sessionId) {
    headers.set('mcp-session-id', sessionId);
  }

  const mcpRequest = new Request('https://mcp.internal/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }),
  });

  const authResult = await authorizeMcpGatewayRequest({
    request: mcpRequest,
    env,
    supportedProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS,
  });
  if (authResult.authError) {
    const text = await authResult.authError.text();
    throw new Error(text || 'MCP auth failed');
  }

  const response = await runWithPrincipalContext(authResult.principal, () =>
    mcpStreamableHandler.fetch(mcpRequest, env, ctx),
  );
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw.slice(0, 1000) || 'MCP request failed');
  }

  const payload = extractMcpResponseBody(raw);
  const rpcBody = payload as McpJsonRpcResponse<unknown>;
  if (rpcBody.error?.message) {
    throw new Error(`MCP error ${rpcBody.error.code}: ${rpcBody.error.message}`);
  }

  return {
    payload,
    sessionId: response.headers.get('mcp-session-id'),
  };
}

function jsonResponse(payload: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = createSecureResponseHeaders({ 'Cache-Control': 'no-store' }, extraHeaders);
  return Response.json(payload, {
    status,
    headers,
  });
}

function jsonError(
  error: string,
  status: number,
  errorCode: string,
  extra?: Record<string, unknown>,
  extraHeaders?: HeadersInit,
): Response {
  return jsonResponse(
    {
      error,
      error_code: errorCode,
      ...(extra ?? {}),
    },
    status,
    extraHeaders,
  );
}

function logWorkerWarning(event: string, error: unknown, meta?: Record<string, unknown>): void {
  console.warn(
    JSON.stringify({
      level: 'warn',
      event,
      error: error instanceof Error ? error.message : String(error),
      ...(meta ?? {}),
    }),
  );
}

function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function htmlResponse(html: string, nonce: string, extraHeaders?: HeadersInit): Response {
  const headers = createSecureResponseHeaders(
    {
      'content-type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    extraHeaders,
    nonce,
  );
  return new Response(html, {
    status: 200,
    headers,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeExternalHttpUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function renderOAuthConsentHtml(
  details: SupabaseOAuthAuthorizationDetails,
  csrfToken: string,
  nonce: string,
): string {
  const clientName = escapeHtml(details.client.name || 'OAuth Application');
  const safeClientUri = sanitizeExternalHttpUrl(details.client.uri);
  const safeClientLogoUri = sanitizeExternalHttpUrl(details.client.logo_uri);
  const clientUri = escapeHtml(safeClientUri || '');
  const clientLogoUri = escapeHtml(safeClientLogoUri || '');
  const redirectUri = escapeHtml(details.redirect_uri);
  const authorizationId = escapeHtml(details.authorization_id);
  const scopeItems = details.scope
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((scope) => `<li><code>${escapeHtml(scope)}</code></li>`)
    .join('');
  const token = escapeHtml(csrfToken);
  const logoMarkup = clientLogoUri
    ? `<img src="${clientLogoUri}" alt="" width="64" height="64" style="border-radius:12px;border:1px solid #d4d4d8;object-fit:cover;" />`
    : '';
  const homepageMarkup = clientUri
    ? `<p class="meta"><strong>Website:</strong> <a href="${clientUri}" rel="noreferrer noopener" target="_blank">${clientUri}</a></p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize Application</title>
    <style nonce="${nonce}">
      :root { color-scheme: light; }
      body { margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f4f5; color: #111827; }
      .wrap { max-width: 720px; margin: 48px auto; padding: 0 16px; }
      .card { background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; padding: 24px; box-shadow: 0 8px 28px rgba(17,24,39,0.06); }
      .header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
      h1 { margin: 0; font-size: 1.35rem; line-height: 1.2; }
      .meta { margin: 8px 0; color: #374151; }
      .muted { color: #6b7280; font-size: 0.92rem; }
      .scopes { margin: 10px 0 0; padding-left: 20px; }
      .scopes li { margin: 6px 0; }
      .panel { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-top: 12px; }
      .actions { display: flex; gap: 10px; margin-top: 20px; }
      button { border: 0; border-radius: 10px; padding: 10px 14px; font-size: 0.95rem; cursor: pointer; }
      .allow { background: #065f46; color: #fff; }
      .deny { background: #dc2626; color: #fff; }
      .cancel { background: #e5e7eb; color: #111827; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; padding: 10px 14px; font-size: 0.95rem; }
      code { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 1px 6px; }
      @media (max-width: 520px) { .actions { flex-direction: column; } }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card">
        <div class="header">
          ${logoMarkup}
          <div>
            <h1>Authorize ${clientName}</h1>
            <p class="muted">This app is requesting access to your CourtListener MCP account.</p>
          </div>
        </div>
        ${homepageMarkup}
        <div class="panel">
          <p class="meta"><strong>Redirect URI:</strong> <code>${redirectUri}</code></p>
          <p class="meta"><strong>Requested scopes:</strong></p>
          <ul class="scopes">${scopeItems || '<li><code>none</code></li>'}</ul>
        </div>
        <form method="post" action="/oauth/consent">
          <input type="hidden" name="authorization_id" value="${authorizationId}" />
          <input type="hidden" name="csrf_token" value="${token}" />
          <div class="actions">
            <button class="allow" type="submit" name="decision" value="approve">Allow access</button>
            <button class="deny" type="submit" name="decision" value="deny">Deny</button>
            <a class="cancel" href="/app/onboarding">Cancel</a>
          </div>
        </form>
      </section>
    </main>
  </body>
</html>`;
}

function redirectResponse(location: string, status = 302, extraHeaders?: HeadersInit): Response {
  const headers = createSecureResponseHeaders(
    {
      Location: location,
      'Cache-Control': 'no-store',
    },
    extraHeaders,
  );
  return new Response(null, { status, headers });
}

function spaAssetResponse(
  content: string,
  contentType: string,
  buildId: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = createSecureResponseHeaders(
    {
      'content-type': contentType,
      'Cache-Control': 'public, max-age=300',
      ETag: `"${buildId}"`,
    },
    extraHeaders,
  );
  return new Response(content, { status: 200, headers });
}

function appendHeaders(headers: Headers, extraHeaders?: HeadersInit): void {
  if (!extraHeaders) return;
  const source = new Headers(extraHeaders);
  for (const [key, value] of source.entries()) {
    headers.append(key, value);
  }
}

function createSecureResponseHeaders(baseHeaders: HeadersInit, extraHeaders?: HeadersInit, nonce?: string): Headers {
  const headers = new Headers(baseHeaders);
  appendHeaders(headers, extraHeaders);
  applySecurityHeaders(headers, nonce);
  return headers;
}

function applySecurityHeaders(headers: Headers, nonce?: string): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  const scriptDirective = nonce
    ? `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`
    : "script-src 'none'";
  const styleDirective = nonce ? `style-src 'self' 'nonce-${nonce}'` : "style-src 'none'";
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      scriptDirective,
      styleDirective,
      "connect-src 'self'",
      "frame-src https://challenges.cloudflare.com",
      "form-action 'self'",
    ].join('; '),
  );
}

function getApiKeyMaxTtlDays(env: Env): number {
  return parsePositiveInt(env.MCP_API_KEY_MAX_TTL_DAYS, DEFAULT_API_KEY_MAX_TTL_DAYS);
}

function getCappedExpiresAtFromDays(
  requestedDays: number | undefined,
  fallbackDays: number,
  maxTtlDays: number,
): string {
  const normalizedDays =
    typeof requestedDays === 'number' && Number.isFinite(requestedDays)
      ? Math.max(1, Math.min(Math.floor(requestedDays), maxTtlDays))
      : Math.min(fallbackDays, maxTtlDays);
  return new Date(Date.now() + normalizedDays * 24 * 60 * 60 * 1000).toISOString();
}

function getRequestIp(request: Request): string | null {
  const cfIp = request.headers.get('CF-Connecting-IP')?.trim();
  if (cfIp) return cfIp;
  const xff = request.headers.get('X-Forwarded-For');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return null;
}

function getSignupRedirectUrl(env: Env, requestOrigin: string): string {
  const configuredOrigin = env.MCP_UI_PUBLIC_ORIGIN?.trim();
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      return `${parsed.origin}/login`;
    } catch {
      // Ignore invalid override and fall back to request origin.
    }
  }
  return `${requestOrigin}/login`;
}

function getPasswordResetRedirectUrl(env: Env, requestOrigin: string): string {
  const configuredOrigin = env.MCP_UI_PUBLIC_ORIGIN?.trim();
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      return `${parsed.origin}/app/reset-password`;
    } catch {
      // Ignore invalid override and fall back to request origin.
    }
  }
  return `${requestOrigin}/app/reset-password`;
}

async function verifyTurnstileToken(
  secretKey: string,
  token: string,
  requestIp: string | null,
): Promise<boolean> {
  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);
  if (requestIp) {
    formData.append('remoteip', requestIp);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    return false;
  }

  const body = (await response.json()) as { success?: boolean };
  return body.success === true;
}

async function authenticateUiApiRequest(
  request: Request,
  env: Env,
): Promise<{ userId: string; keyId?: string; authType: 'api_key' | 'session' } | Response> {
  const config = getSupabaseManagementConfig(env);
  if (!config) {
    return jsonError('Supabase auth is not configured on this worker.', 503, 'supabase_not_configured');
  }

  const bearerToken = extractBearerToken(request.headers.get('authorization'));
  if (bearerToken) {
    const principal = await resolvePrincipalFromApiToken(config, bearerToken);
    if (principal) {
      return { ...principal, authType: 'api_key' };
    }
    return jsonError('Invalid or expired API token.', 401, 'invalid_api_token');
  }

  const sessionSecret = getUiSessionSecret(env);
  if (!sessionSecret) {
    return jsonError('Session signing secret is not configured.', 503, 'session_secret_missing');
  }

  const cookieToken = getCookieValue(request, 'clmcp_ui');
  const parsedPayload = cookieToken ? parseUiSessionToken(cookieToken) : null;
  if (parsedPayload && (await isUiSessionRevoked(env, parsedPayload.jti))) {
    return jsonError('Session is invalid or expired.', 401, 'invalid_session');
  }

  const sessionUserId = await getUiSessionUserId(request, sessionSecret);
  if (!sessionUserId) {
    return jsonError('Missing bearer token.', 401, 'missing_bearer_token');
  }
  return { userId: sessionUserId, authType: 'session' };
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const chunk of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = chunk.trim().split('=');
    if (!rawName || rawValue.length === 0) continue;
    cookies[rawName] = rawValue.join('=');
  }
  return cookies;
}

function getCookieValue(request: Request, name: string): string | null {
  return parseCookies(request.headers.get('cookie'))[name] ?? null;
}

function getRequestOrigin(request: Request): string | null {
  return request.headers.get('Origin');
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  try {
    return atob(normalized + '='.repeat(padLength));
  } catch {
    return null;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const maxLength = Math.max(aBytes.length, bBytes.length);

  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLength; i += 1) {
    const aByte = i < aBytes.length ? (aBytes[i] ?? 0) : 0;
    const bByte = i < bBytes.length ? (bBytes[i] ?? 0) : 0;
    diff |= aByte ^ bByte;
  }

  return diff === 0;
}

interface UiSessionPayload {
  sub: string;
  exp: number;
  jti: string;
}

function getUiSessionSecret(env: Env): string | null {
  const explicitSecret = env.MCP_UI_SESSION_SECRET?.trim() || '';
  if (explicitSecret) {
    return explicitSecret;
  }

  if (!parseBoolean(env.MCP_UI_ALLOW_SUPABASE_SECRET_FALLBACK)) {
    // Auto-derive from Supabase publishable key (stored server-side only)
    const anonKey = env.SUPABASE_PUBLISHABLE_KEY?.trim() || '';
    if (anonKey) {
      return `clmcp-session-v1:${anonKey}`;
    }
    return null;
  }

  const fallbackSecret = env.SUPABASE_SECRET_KEY?.trim() || '';
  return fallbackSecret || null;
}

async function signSessionPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  let binary = '';
  const bytes = new Uint8Array(signature);
  for (const b of bytes) binary += String.fromCharCode(b);
  return base64UrlEncode(binary);
}

async function createUiSessionToken(userId: string, secret: string, ttlSeconds: number): Promise<string> {
  const payloadObj: UiSessionPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    jti: generateRandomToken(24),
  };
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const signature = await signSessionPayload(payload, secret);
  return `${payload}.${signature}`;
}

function parseUiSessionToken(token: string): UiSessionPayload | null {
  const [payloadPart] = token.split('.');
  if (!payloadPart) return null;
  const payloadRaw = base64UrlDecode(payloadPart);
  if (!payloadRaw) return null;

  try {
    const payload = JSON.parse(payloadRaw) as Partial<UiSessionPayload>;
    if (!payload.sub || !payload.exp || !payload.jti) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload as UiSessionPayload;
  } catch {
    return null;
  }
}

function isUiSessionRevocationEnabled(env: Env): boolean {
  return env.MCP_UI_SESSION_REVOCATION_ENABLED
    ? parseBoolean(env.MCP_UI_SESSION_REVOCATION_ENABLED)
    : true;
}

function getSessionRevocationStub(env: Env, sessionJti: string): DurableObjectStub {
  const objectId = env.AUTH_FAILURE_LIMITER.idFromName(`ui-session:${sessionJti}`);
  return env.AUTH_FAILURE_LIMITER.get(objectId);
}

async function callSessionRevocation(
  env: Env,
  sessionJti: string,
  body: SessionRevocationRequestBody | SessionTokenRequestBody,
): Promise<SessionRevocationResponseBody | SessionTokenResponseBody | null> {
  const stub = getSessionRevocationStub(env, sessionJti);
  const startedAt = Date.now();
  try {
    const response = await stub.fetch('https://auth-failure-limiter/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as SessionRevocationResponseBody;
  } finally {
    recordDurableObjectLatency('session_revocation', Date.now() - startedAt);
  }
}

async function isUiSessionRevoked(env: Env, sessionJti: string): Promise<boolean> {
  if (!isUiSessionRevocationEnabled(env)) return false;
  const result = await callSessionRevocation(env, sessionJti, {
    action: 'session_check',
    nowMs: Date.now(),
  });
  return Boolean(result && 'revoked' in result && result.revoked === true);
}

async function revokeUiSession(env: Env, sessionJti: string, expiresAtEpochSeconds: number): Promise<void> {
  if (!isUiSessionRevocationEnabled(env)) return;
  const nowMs = Date.now();
  const revokeUntilMs = Math.max(nowMs, expiresAtEpochSeconds * 1000);
  await callSessionRevocation(env, sessionJti, {
    action: 'session_revoke',
    nowMs,
    revokeUntilMs,
  });
}

async function storeUiSessionSupabaseAccessToken(
  env: Env,
  sessionJti: string,
  token: string,
  tokenExpiresAtMs: number | null,
): Promise<void> {
  const nowMs = Date.now();
  const fallbackExpiresAtMs = nowMs + 50 * 60 * 1000;
  const response = await callSessionRevocation(env, sessionJti, {
    action: 'session_store_token',
    nowMs,
    token,
    tokenExpiresAtMs:
      typeof tokenExpiresAtMs === 'number' && Number.isFinite(tokenExpiresAtMs)
        ? tokenExpiresAtMs
        : fallbackExpiresAtMs,
  } satisfies SessionTokenRequestBody);
  if (!response) {
    throw new Error('session_token_store_failed');
  }
}

async function getUiSessionSupabaseAccessToken(env: Env, sessionJti: string): Promise<string | null> {
  const response = await callSessionRevocation(env, sessionJti, {
    action: 'session_get_token',
    nowMs: Date.now(),
  } satisfies SessionTokenRequestBody);
  if (!response || !('hasToken' in response)) {
    return null;
  }
  const tokenResponse = response as SessionTokenResponseBody;
  return tokenResponse.hasToken && tokenResponse.token ? tokenResponse.token : null;
}

async function clearUiSessionSupabaseAccessToken(env: Env, sessionJti: string): Promise<void> {
  await callSessionRevocation(env, sessionJti, {
    action: 'session_clear_token',
    nowMs: Date.now(),
  } satisfies SessionTokenRequestBody);
}

async function getUiSessionUserId(request: Request, secret: string): Promise<string | null> {
  const token = getCookieValue(request, 'clmcp_ui');
  if (!token) return null;
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) return null;
  const expectedSignature = await signSessionPayload(payloadPart, secret);
  if (!constantTimeEqual(expectedSignature, signaturePart)) return null;
  const payload = parseUiSessionToken(token);
  if (!payload) return null;
  return payload.sub;
}

function isSecureCookieRequest(request: Request, env: Env): boolean {
  if (parseBoolean(env.MCP_UI_INSECURE_COOKIES)) {
    return false;
  }
  return new URL(request.url).protocol === 'https:';
}

function buildUiSessionCookie(token: string, secure: boolean): string {
  return `clmcp_ui=${token}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=43200`;
}

function buildUiSessionCookieClear(secure: boolean): string {
  return `clmcp_ui=; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=0`;
}

function buildUiSessionIndicatorCookie(secure: boolean): string {
  return `clmcp_ui_present=1; Path=/;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=43200`;
}

function buildUiSessionIndicatorCookieClear(secure: boolean): string {
  return `clmcp_ui_present=; Path=/;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=0`;
}

function generateRandomToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return base64UrlEncode(binary);
}

function getCsrfTokenFromCookie(request: Request): string | null {
  const token = getCookieValue(request, 'clmcp_csrf')?.trim();
  if (!token) return null;
  return token;
}

function buildCsrfCookie(token: string, secure: boolean): string {
  return `clmcp_csrf=${token}; Path=/;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=43200`;
}

function getOrCreateCsrfCookieHeader(request: Request, env: Env): string | null {
  const existing = getCsrfTokenFromCookie(request);
  if (existing) return null;
  return buildCsrfCookie(generateRandomToken(24), isSecureCookieRequest(request, env));
}

function requireCsrfToken(request: Request): Response | null {
  const cookieToken = getCsrfTokenFromCookie(request);
  const headerToken = request.headers.get('x-csrf-token')?.trim() || '';
  if (!cookieToken || !headerToken || !constantTimeEqual(headerToken, cookieToken)) {
    return jsonError('CSRF token validation failed.', 403, 'csrf_validation_failed');
  }
  return null;
}

export class AuthFailureLimiterDO {
  constructor(private readonly state: DurableObjectState) {}

  private async loadState(): Promise<AuthFailureState> {
    const stored = await this.state.storage.get<AuthFailureState>('auth_failure_state');
    if (!stored) return { ...DEFAULT_AUTH_FAILURE_STATE };
    return {
      count: typeof stored.count === 'number' ? stored.count : 0,
      windowStartedAtMs:
        typeof stored.windowStartedAtMs === 'number' ? stored.windowStartedAtMs : 0,
      blockedUntilMs: typeof stored.blockedUntilMs === 'number' ? stored.blockedUntilMs : 0,
    };
  }

  private async saveState(nextState: AuthFailureState): Promise<void> {
    await this.state.storage.put('auth_failure_state', nextState);
  }

  private async clearState(): Promise<void> {
    await this.state.storage.delete('auth_failure_state');
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    const body = await parseJsonBody<
      | AuthFailureLimiterRequestBody
      | SessionRevocationRequestBody
      | SessionTokenRequestBody
      | LifetimeQuotaRequestBody
    >(request);
    if (!body) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }

    if (body.action === 'session_check' || body.action === 'session_revoke') {
      const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : Date.now();
      const key = 'ui_session_revoked_until_ms';
      const revokedUntilMs = (await this.state.storage.get<number>(key)) ?? 0;

      if (body.action === 'session_revoke') {
        const requestedUntil =
          typeof body.revokeUntilMs === 'number' && Number.isFinite(body.revokeUntilMs)
            ? body.revokeUntilMs
            : nowMs;
        const nextUntil = Math.max(revokedUntilMs, requestedUntil, nowMs);
        await this.state.storage.put(key, nextUntil);
        return Response.json({ revoked: true } satisfies SessionRevocationResponseBody);
      }

      if (revokedUntilMs <= nowMs) {
        if (revokedUntilMs > 0) {
          await this.state.storage.delete(key);
        }
        return Response.json({ revoked: false } satisfies SessionRevocationResponseBody);
      }

      return Response.json({ revoked: true } satisfies SessionRevocationResponseBody);
    }

    if (
      body.action === 'session_store_token' ||
      body.action === 'session_get_token' ||
      body.action === 'session_clear_token'
    ) {
      const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : Date.now();
      const tokenKey = 'ui_session_supabase_access_token';
      const expiresAtKey = 'ui_session_supabase_access_token_expires_at_ms';

      if (body.action === 'session_clear_token') {
        await this.state.storage.delete(tokenKey);
        await this.state.storage.delete(expiresAtKey);
        return Response.json({ hasToken: false, token: null } satisfies SessionTokenResponseBody);
      }

      if (body.action === 'session_store_token') {
        const token = typeof body.token === 'string' ? body.token.trim() : '';
        if (!token) {
          return Response.json({ error: 'invalid_token' }, { status: 400 });
        }
        const requestedExpiresAt =
          typeof body.tokenExpiresAtMs === 'number' && Number.isFinite(body.tokenExpiresAtMs)
            ? body.tokenExpiresAtMs
            : nowMs + 50 * 60 * 1000;
        const expiresAtMs = Math.max(nowMs + 1_000, requestedExpiresAt);
        await this.state.storage.put(tokenKey, token);
        await this.state.storage.put(expiresAtKey, expiresAtMs);
        return Response.json({ hasToken: true, token } satisfies SessionTokenResponseBody);
      }

      const token = (await this.state.storage.get<string>(tokenKey)) ?? '';
      const expiresAtMs = (await this.state.storage.get<number>(expiresAtKey)) ?? 0;
      if (!token || expiresAtMs <= nowMs) {
        if (token) await this.state.storage.delete(tokenKey);
        if (expiresAtMs > 0) await this.state.storage.delete(expiresAtKey);
        return Response.json({ hasToken: false, token: null } satisfies SessionTokenResponseBody);
      }
      return Response.json({ hasToken: true, token } satisfies SessionTokenResponseBody);
    }

    if (body.action === 'quota_increment_check') {
      const limit = Math.max(1, Math.floor(body.maxAllowed));
      const key = 'lifetime_quota_count';
      const existing = (await this.state.storage.get<number>(key)) ?? 0;

      if (existing >= limit) {
        return Response.json({
          blocked: true,
          used: existing,
          limit,
          remaining: 0,
        } satisfies LifetimeQuotaResponseBody);
      }

      const next = existing + 1;
      await this.state.storage.put(key, next);
      return Response.json({
        blocked: false,
        used: next,
        limit,
        remaining: Math.max(0, limit - next),
      } satisfies LifetimeQuotaResponseBody);
    }

    const authBody = body as AuthFailureLimiterRequestBody;
    const nowMs = Number.isFinite(authBody.nowMs) ? authBody.nowMs : Date.now();
    const maxAttempts = Math.max(1, authBody.maxAttempts);
    const windowMs = Math.max(1_000, authBody.windowMs);
    const blockMs = Math.max(1_000, authBody.blockMs);
    const action = authBody.action;

    if (action === 'clear') {
      await this.clearState();
      return Response.json({
        blocked: false,
        retryAfterSeconds: 0,
        state: { ...DEFAULT_AUTH_FAILURE_STATE },
      } satisfies AuthFailureLimiterResponseBody);
    }

    let current = await this.loadState();
    let stateChanged = false;
    if (nowMs - current.windowStartedAtMs >= windowMs) {
      current = {
        count: 0,
        windowStartedAtMs: nowMs,
        blockedUntilMs: 0,
      };
      stateChanged = true;
    }

    if (action === 'record') {
      const nextCount = current.count + 1;
      const shouldBlock = nextCount >= maxAttempts;
      current = {
        count: nextCount,
        windowStartedAtMs: current.windowStartedAtMs || nowMs,
        blockedUntilMs: shouldBlock ? nowMs + blockMs : current.blockedUntilMs,
      };
      await this.saveState(current);
      stateChanged = false;
    }

    const blocked = current.blockedUntilMs > nowMs;
    const retryAfterSeconds = blocked
      ? Math.max(1, Math.ceil((current.blockedUntilMs - nowMs) / 1000))
      : 0;

    if (action === 'check' && stateChanged) {
      await this.saveState(current);
    }

    return Response.json({
      blocked,
      retryAfterSeconds,
      state: current,
    } satisfies AuthFailureLimiterResponseBody);
  }
}

function getAuthFailureRateLimitConfig(env: Env): {
  enabled: boolean;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
} {
  return {
    enabled: env.MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED
      ? parseBoolean(env.MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED)
      : true,
    maxAttempts: parsePositiveInt(env.MCP_AUTH_FAILURE_RATE_LIMIT_MAX, DEFAULT_AUTH_FAILURE_LIMIT_MAX),
    windowMs:
      parsePositiveInt(
        env.MCP_AUTH_FAILURE_RATE_LIMIT_WINDOW_SECONDS,
        DEFAULT_AUTH_FAILURE_WINDOW_SECONDS,
      ) * 1000,
    blockMs:
      parsePositiveInt(
        env.MCP_AUTH_FAILURE_RATE_LIMIT_BLOCK_SECONDS,
        DEFAULT_AUTH_FAILURE_BLOCK_SECONDS,
      ) * 1000,
  };
}

function getAuthLimiterStub(env: Env, clientId: string): DurableObjectStub {
  const objectId = env.AUTH_FAILURE_LIMITER.idFromName(`auth-fail:${clientId}`);
  return env.AUTH_FAILURE_LIMITER.get(objectId);
}

async function callAuthLimiter(
  env: Env,
  clientId: string,
  action: AuthFailureLimiterRequestBody['action'],
  nowMs: number,
  limits?: { maxAttempts: number; windowMs: number; blockMs: number },
): Promise<AuthFailureLimiterResponseBody | null> {
  const cfg =
    limits ??
    ((): { maxAttempts: number; windowMs: number; blockMs: number } => {
      const authCfg = getAuthFailureRateLimitConfig(env);
      return {
        maxAttempts: authCfg.maxAttempts,
        windowMs: authCfg.windowMs,
        blockMs: authCfg.blockMs,
      };
    })();
  const stub = getAuthLimiterStub(env, clientId);
  const startedAt = Date.now();
  try {
    const response = await stub.fetch('https://auth-failure-limiter/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action,
        nowMs,
        maxAttempts: cfg.maxAttempts,
        windowMs: cfg.windowMs,
        blockMs: cfg.blockMs,
      } satisfies AuthFailureLimiterRequestBody),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as AuthFailureLimiterResponseBody;
    return body;
  } finally {
    recordDurableObjectLatency('auth_limiter', Date.now() - startedAt);
  }
}

function getClientIdentifier(request: Request): string {
  const requestIp = getRequestIp(request);
  if (requestIp) return requestIp;

  return 'unknown';
}

async function getAuthRateLimitedResponse(
  clientId: string,
  env: Env,
  nowMs: number,
): Promise<Response | null> {
  const cfg = getAuthFailureRateLimitConfig(env);
  if (!cfg.enabled) return null;
  const limiterState = await callAuthLimiter(env, clientId, 'check', nowMs);
  if (!limiterState?.blocked) return null;

  const retryAfterSeconds = limiterState.retryAfterSeconds;
  return jsonError(
    'Too many failed authentication attempts',
    429,
    'auth_rate_limited',
    { retry_after_seconds: retryAfterSeconds },
    { 'Retry-After': String(retryAfterSeconds) },
  );
}

async function recordAuthFailure(clientId: string, env: Env, nowMs: number): Promise<void> {
  const cfg = getAuthFailureRateLimitConfig(env);
  if (!cfg.enabled) return;

  await callAuthLimiter(env, clientId, 'record', nowMs);
}

async function clearAuthFailures(clientId: string, env: Env, nowMs: number): Promise<void> {
  const cfg = getAuthFailureRateLimitConfig(env);
  if (!cfg.enabled) return;
  await callAuthLimiter(env, clientId, 'clear', nowMs);
}

type UiRateLimitType = 'signup' | 'keys';

function getUiRateLimitConfig(
  env: Env,
  limitType: UiRateLimitType,
): { enabled: boolean; maxAttempts: number; windowMs: number; blockMs: number } {
  const enabled = env.MCP_UI_RATE_LIMIT_ENABLED
    ? parseBoolean(env.MCP_UI_RATE_LIMIT_ENABLED)
    : true;
  if (limitType === 'signup') {
    return {
      enabled,
      maxAttempts: parsePositiveInt(
        env.MCP_UI_SIGNUP_RATE_LIMIT_MAX,
        DEFAULT_UI_SIGNUP_RATE_LIMIT_MAX,
      ),
      windowMs:
        parsePositiveInt(
          env.MCP_UI_SIGNUP_RATE_LIMIT_WINDOW_SECONDS,
          DEFAULT_UI_SIGNUP_RATE_LIMIT_WINDOW_SECONDS,
        ) * 1000,
      blockMs:
        parsePositiveInt(
          env.MCP_UI_SIGNUP_RATE_LIMIT_BLOCK_SECONDS,
          DEFAULT_UI_SIGNUP_RATE_LIMIT_BLOCK_SECONDS,
        ) * 1000,
    };
  }

  return {
    enabled,
    maxAttempts: parsePositiveInt(env.MCP_UI_KEYS_RATE_LIMIT_MAX, DEFAULT_UI_KEYS_RATE_LIMIT_MAX),
    windowMs:
      parsePositiveInt(
        env.MCP_UI_KEYS_RATE_LIMIT_WINDOW_SECONDS,
        DEFAULT_UI_KEYS_RATE_LIMIT_WINDOW_SECONDS,
      ) * 1000,
    blockMs:
      parsePositiveInt(
        env.MCP_UI_KEYS_RATE_LIMIT_BLOCK_SECONDS,
        DEFAULT_UI_KEYS_RATE_LIMIT_BLOCK_SECONDS,
      ) * 1000,
  };
}

async function applyUiRateLimit(
  request: Request,
  env: Env,
  limitType: UiRateLimitType,
  identifier?: string,
): Promise<Response | null> {
  const cfg = getUiRateLimitConfig(env, limitType);
  if (!cfg.enabled) return null;

  const clientId = identifier?.trim() || getClientIdentifier(request);
  const nowMs = Date.now();
  const limiterKey = `ui-${limitType}:${clientId}`;
  const result = await callAuthLimiter(env, limiterKey, 'record', nowMs, {
    maxAttempts: cfg.maxAttempts,
    windowMs: cfg.windowMs,
    blockMs: cfg.blockMs,
  });
  if (!result?.blocked) return null;

  return jsonError(
    `Too many ${limitType} requests. Please retry later.`,
    429,
    'ui_rate_limited',
    { retry_after_seconds: result.retryAfterSeconds },
    { 'Retry-After': String(result.retryAfterSeconds) },
  );
}

async function applyAiChatLifetimeQuota(env: Env, userId: string): Promise<Response | null> {
  const enabled = env.MCP_UI_RATE_LIMIT_ENABLED
    ? parseBoolean(env.MCP_UI_RATE_LIMIT_ENABLED)
    : true;
  if (!enabled) return null;

  const maxAllowed = parsePositiveInt(
    env.MCP_UI_AI_CHAT_RATE_LIMIT_MAX,
    DEFAULT_UI_AI_CHAT_RATE_LIMIT_MAX,
  );
  const objectId = env.AUTH_FAILURE_LIMITER.idFromName(`ui-ai-chat-quota:user:${userId}`);
  const stub = env.AUTH_FAILURE_LIMITER.get(objectId);
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await stub.fetch('https://auth-failure-limiter/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'quota_increment_check',
        maxAllowed,
      } satisfies LifetimeQuotaRequestBody),
    });
  } finally {
    recordDurableObjectLatency('ai_chat_quota', Date.now() - startedAt);
  }

  if (!response.ok) {
    return jsonError('Unable to validate hosted AI chat quota.', 503, 'ai_chat_quota_unavailable');
  }

  const quota = (await response.json()) as LifetimeQuotaResponseBody;
  if (!quota.blocked) return null;

  return jsonError(
    `Hosted AI chat lifetime limit reached (${quota.limit} turns). Please connect your own local model directly to /mcp for continued chat.`,
    429,
    'ai_chat_limit_reached',
  );
}

function isMcpPath(pathname: string): boolean {
  return pathname === '/mcp' || pathname === '/sse';
}

function buildCorsHeaders(origin: string | null, allowedOrigins: string[]): Headers {
  return buildMcpCorsHeaders(origin, allowedOrigins);
}

function withCors(response: Response, origin: string | null, allowedOrigins: string[]): Response {
  const headers = new Headers(response.headers);
  const corsHeaders = buildCorsHeaders(origin, allowedOrigins);
  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }
  applySecurityHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function rejectDisallowedUiOrigin(
  origin: string | null,
  allowedOrigins: string[],
): Response | null {
  if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
    return jsonError('Forbidden origin', 403, 'forbidden_origin');
  }
  return null;
}

const workerDelegatedRouteDeps = {
  jsonError,
  jsonResponse,
  rejectDisallowedUiOrigin,
  getSupabaseSignupConfig,
  getUiSessionSecret,
  getCookieValue,
  parseUiSessionToken,
  getUiSessionUserId,
  isUiSessionRevoked,
  redirectResponse,
  getUiSessionSupabaseAccessToken,
  getOAuthAuthorizationDetails,
  sanitizeExternalHttpUrl,
  getCsrfTokenFromCookie,
  generateRandomToken,
  generateCspNonce,
  buildCsrfCookie,
  isSecureCookieRequest,
  htmlResponse,
  renderOAuthConsentHtml,
  clearUiSessionSupabaseAccessToken,
  submitOAuthAuthorizationConsent,
  constantTimeEqual,
  getOrCreateCsrfCookieHeader,
  requireCsrfToken,
  getSupabaseManagementConfig,
  parseJsonBody,
  applyUiRateLimit,
  authenticateUserWithPassword,
  authenticateUserWithAnonKey,
  createUiSessionToken,
  storeUiSessionSupabaseAccessToken,
  buildUiSessionCookie,
  buildUiSessionIndicatorCookie,
  applySecurityHeaders,
  getSupabaseUserFromAccessToken,
  sendPasswordResetEmail,
  getPasswordResetRedirectUrl,
  logWorkerWarning,
  exchangeRecoveryTokenHash,
  resetPasswordWithAccessToken,
  confirmUserEmail,
  revokeUiSession,
  buildUiSessionCookieClear,
  buildUiSessionIndicatorCookieClear,
  getRequestIp,
  verifyTurnstileToken,
  signUpSupabaseUser,
  getSignupRedirectUrl,
  logAuditEvent,
  authenticateUiApiRequest,
  listApiKeysForUser,
  getApiKeyMaxTtlDays,
  getCappedExpiresAtFromDays,
  createApiKeyForUser,
  revokeApiKeyForUser,
  applyAiChatLifetimeQuota,
  isPlainObject,
  aiToolFromPrompt,
  callMcpJsonRpc,
  hasValidMcpRpcShape,
  aiToolArguments,
  buildLowCostSummary,
  buildMcpSystemPrompt,
  extractMcpContext,
  preferredMcpProtocolVersion: PREFERRED_MCP_PROTOCOL_VERSION,
  defaultCfAiModelBalanced: DEFAULT_CF_AI_MODEL_BALANCED,
  defaultCfAiModelCheap: DEFAULT_CF_AI_MODEL_CHEAP,
  cheapModeMaxTokens: CHEAP_MODE_MAX_TOKENS,
  balancedModeMaxTokens: BALANCED_MODE_MAX_TOKENS,
  spaJs: SPA_JS,
  spaCss: SPA_CSS,
  spaBuildId: SPA_BUILD_ID,
  spaAssetResponse,
  renderSpaShellHtml,
  supportedProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS,
  mcpStreamableHandler,
  mcpSseCompatibilityHandler,
  withCors,
  buildCorsHeaders,
  getClientIdentifier,
  getAuthRateLimitedResponse,
  recordAuthFailure,
  clearAuthFailures,
} satisfies WorkerDelegatedRouteDeps<Env>;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestMethod = request.method;
    const pathname = url.pathname;
    const origin = getRequestOrigin(request);
    const allowedOrigins = getCachedAllowedOrigins(env.MCP_ALLOWED_ORIGINS);
    const mcpPath = isMcpPath(pathname);
    const requestStartedAt = Date.now();
    const routeMetricKey = buildWorkerRouteMetricKey(requestMethod, pathname);

    try {
      // CORS preflight (MCP endpoints only)
      if (requestMethod === 'OPTIONS' && mcpPath) {
        if (!isAllowedOrigin(origin, allowedOrigins)) {
          return new Response('Forbidden origin', { status: 403 });
        }
        return new Response(null, { headers: buildCorsHeaders(origin, allowedOrigins) });
      }

      // Health check
      if (pathname === '/health') {
        return jsonResponse({
          status: 'ok',
          service: 'courtlistener-mcp',
          transport: 'cloudflare-agents-streamable-http',
          metrics: {
            latency_ms: getWorkerLatencySnapshot(),
          },
        });
      }

      const delegatedRouteResponse = await handleDelegatedWorkerRoutes(
        {
          request,
          url,
          origin,
          allowedOrigins,
          env,
          ctx,
          pathname,
          requestMethod,
          mcpPath,
        },
        workerDelegatedRouteDeps,
      );
      if (delegatedRouteResponse) {
        return delegatedRouteResponse;
      }

      return new Response('Not found', { status: 404 });
    } finally {
      recordRouteLatency(routeMetricKey, Date.now() - requestStartedAt);
    }
  },
};
