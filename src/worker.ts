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
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { bootstrapServices } from './infrastructure/bootstrap.js';
import { container } from './infrastructure/container.js';
import { SERVER_CAPABILITIES } from './infrastructure/protocol-constants.js';
import type { Logger } from './infrastructure/logger.js';
import type { MetricsCollector } from './infrastructure/metrics.js';
import { ToolHandlerRegistry } from './server/tool-handler.js';
import { ResourceHandlerRegistry } from './server/resource-handler.js';
import { PromptHandlerRegistry } from './server/prompt-handler.js';
import { SubscriptionManager } from './server/subscription-manager.js';
import { buildToolDefinitions, buildEnhancedMetadata } from './server/tool-builder.js';
import { setupHandlers } from './server/handler-registry.js';
import {
  authorizeMcpRequest,
  extractBearerToken,
  isAllowedOrigin,
  parseAllowedOrigins,
  parseBoolean,
  validateProtocolVersionHeader,
} from './server/worker-security.js';
import {
  authenticateUserWithAnonKey,
  authenticateUserWithPassword,
  confirmUserEmail,
  createApiKeyForUser,
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

    // Wire all existing MCP protocol handlers onto the low-level Server
    // that lives inside McpServer.  Because we never call
    // this.server.tool() / .resource() / .prompt(), the high-level
    // McpServer won't register conflicting handlers.
    const lowLevelServer = (this.server as unknown as McpServer).server;

    setupHandlers({
      server: lowLevelServer,
      logger,
      metrics,
      toolRegistry,
      resourceRegistry,
      promptRegistry,
      subscriptionManager: new SubscriptionManager(),
      isShuttingDown: () => false,
      activeRequests: new Set<string>(),
      buildToolDefinitions: () => buildToolDefinitions(toolRegistry, enhancedMetadata),
      executeToolWithMiddleware: async (
        req: CallToolRequest,
        requestId: string,
      ): Promise<CallToolResult> => {
        return await toolRegistry.execute(req, { logger, requestId });
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Workers fetch handler — thin wrapper around McpAgent.serve()
// ---------------------------------------------------------------------------

const mcpStreamableHandler = CourtListenerMCP.serve('/mcp');
const mcpSseCompatibilityHandler = CourtListenerMCP.serve('/sse');
const ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS';
const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set([
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
  '2025-11-25',
]);

const DEFAULT_AUTH_FAILURE_LIMIT_MAX = 20;
const DEFAULT_AUTH_FAILURE_WINDOW_SECONDS = 300;
const DEFAULT_AUTH_FAILURE_BLOCK_SECONDS = 600;
const DEFAULT_UI_SIGNUP_RATE_LIMIT_MAX = 8;
const DEFAULT_UI_SIGNUP_RATE_LIMIT_WINDOW_SECONDS = 300;
const DEFAULT_UI_SIGNUP_RATE_LIMIT_BLOCK_SECONDS = 900;
const DEFAULT_UI_KEYS_RATE_LIMIT_MAX = 120;
const DEFAULT_UI_KEYS_RATE_LIMIT_WINDOW_SECONDS = 300;
const DEFAULT_UI_KEYS_RATE_LIMIT_BLOCK_SECONDS = 300;
const DEFAULT_UI_AI_CHAT_RATE_LIMIT_MAX = 10;
const DEFAULT_API_KEY_MAX_TTL_DAYS = 90;

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

interface AuthFailureLimiterResponseBody {
  blocked: boolean;
  retryAfterSeconds: number;
  state: AuthFailureState;
}

interface SessionRevocationResponseBody {
  revoked: boolean;
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
const DEFAULT_CF_AI_MODEL = '@cf/meta/llama-3.2-1b-instruct';
const CHEAP_MODE_MAX_TOKENS = 180;
const BALANCED_MODE_MAX_TOKENS = 420;

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

function aiToolFromPrompt(message: string): 'lookup_citation' | 'search_cases' | 'search_opinions' {
  const normalized = message.toLowerCase();
  if (normalized.includes('citation') || normalized.includes('v.')) {
    return 'lookup_citation';
  }
  if (normalized.includes('opinion') || normalized.includes('holding')) {
    return 'search_opinions';
  }
  return 'search_cases';
}

function aiToolArguments(toolName: string, prompt: string): Record<string, unknown> {
  if (toolName === 'lookup_citation') {
    return { citation: prompt };
  }
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

function buildLowCostSummary(
  message: string,
  toolName: string,
  mcpPayload: unknown,
): string {
  const payloadText = JSON.stringify(mcpPayload);
  const compact = payloadText.length > 1200 ? `${payloadText.slice(0, 1200)}...` : payloadText;
  return [
    `Summary: Ran \`${toolName}\` for your request.`,
    `User question: ${message}`,
    'What MCP returned (truncated):',
    compact,
    'Next follow-up query: Ask for a narrower court, date range, or citation for more precise results.',
  ].join('\n\n');
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
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-06-18',
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

  const authError = await authorizeMcpRequest(mcpRequest, env);
  if (authError) {
    const text = await authError.text();
    throw new Error(text || 'MCP auth failed');
  }

  const protocolError = validateProtocolVersionHeader(
    headers.get('MCP-Protocol-Version'),
    parseBoolean(env.MCP_REQUIRE_PROTOCOL_VERSION),
    SUPPORTED_MCP_PROTOCOL_VERSIONS,
  );
  if (protocolError) {
    const text = await protocolError.text();
    throw new Error(text || 'MCP protocol version check failed');
  }

  const response = await mcpStreamableHandler.fetch(mcpRequest, env, ctx);
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
  const headers = new Headers({
    'Cache-Control': 'no-store',
  });
  if (extraHeaders) {
    const source = new Headers(extraHeaders);
    for (const [key, value] of source.entries()) {
      headers.append(key, value);
    }
  }
  applySecurityHeaders(headers);
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

function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function htmlResponse(html: string, nonce: string, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (extraHeaders) {
    const source = new Headers(extraHeaders);
    for (const [key, value] of source.entries()) {
      headers.append(key, value);
    }
  }
  applySecurityHeaders(headers, nonce);
  return new Response(html, {
    status: 200,
    headers,
  });
}

function redirectResponse(location: string, status = 302, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
  });
  if (extraHeaders) {
    const source = new Headers(extraHeaders);
    for (const [key, value] of source.entries()) {
      headers.append(key, value);
    }
  }
  applySecurityHeaders(headers);
  return new Response(null, { status, headers });
}

function spaAssetResponse(
  content: string,
  contentType: string,
  buildId: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers({
    'content-type': contentType,
    'Cache-Control': 'public, max-age=300',
    ETag: `"${buildId}"`,
  });
  if (extraHeaders) {
    const source = new Headers(extraHeaders);
    for (const [key, value] of source.entries()) {
      headers.append(key, value);
    }
  }
  applySecurityHeaders(headers);
  return new Response(content, { status: 200, headers });
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

  const cookieToken = parseCookies(request.headers.get('cookie')).clmcp_ui;
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
  body: SessionRevocationRequestBody,
): Promise<SessionRevocationResponseBody | null> {
  const stub = getSessionRevocationStub(env, sessionJti);
  const response = await stub.fetch('https://auth-failure-limiter/internal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as SessionRevocationResponseBody;
}

async function isUiSessionRevoked(env: Env, sessionJti: string): Promise<boolean> {
  if (!isUiSessionRevocationEnabled(env)) return false;
  const result = await callSessionRevocation(env, sessionJti, {
    action: 'session_check',
    nowMs: Date.now(),
  });
  return result?.revoked === true;
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

async function getUiSessionUserId(request: Request, secret: string): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);
  const token = cookies.clmcp_ui;
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
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies.clmcp_csrf?.trim();
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
      AuthFailureLimiterRequestBody | SessionRevocationRequestBody | LifetimeQuotaRequestBody
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
  const response = await stub.fetch('https://auth-failure-limiter/internal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'quota_increment_check',
      maxAllowed,
    } satisfies LifetimeQuotaRequestBody),
  });

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
  const headers = new Headers({
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, MCP-Protocol-Version',
    'Access-Control-Expose-Headers': 'mcp-session-id, MCP-Protocol-Version',
    Vary: 'Origin',
  });

  if (origin) {
    if (allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
    }
  }
  // When no Origin header is present, do not set CORS headers.
  // Wildcard CORS is only allowed when an Origin header matches a configured '*'.

  return headers;
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
  request: Request,
  allowedOrigins: string[],
): Response | null {
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
    return jsonError('Forbidden origin', 403, 'forbidden_origin');
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowedOrigins = parseAllowedOrigins(env.MCP_ALLOWED_ORIGINS);
    const mcpPath = isMcpPath(url.pathname);

    // CORS preflight (MCP endpoints only)
    if (request.method === 'OPTIONS' && mcpPath) {
      if (!isAllowedOrigin(origin, allowedOrigins)) {
        return new Response('Forbidden origin', { status: 403 });
      }
      return new Response(null, { headers: buildCorsHeaders(origin, allowedOrigins) });
    }

    // Health check
    if (url.pathname === '/health') {
      return jsonResponse({
        status: 'ok',
        service: 'courtlistener-mcp',
        transport: 'cloudflare-agents-streamable-http',
      });
    }

    if (request.method === 'GET' && url.pathname === '/app/assets/spa.js') {
      return spaAssetResponse(SPA_JS, 'application/javascript; charset=utf-8', SPA_BUILD_ID);
    }

    if (request.method === 'GET' && url.pathname === '/app/assets/spa.css') {
      return spaAssetResponse(SPA_CSS, 'text/css; charset=utf-8', SPA_BUILD_ID);
    }

    if (url.pathname.startsWith('/app/assets/') && request.method !== 'GET') {
      return jsonError('Method not allowed', 405, 'method_not_allowed');
    }

    if (request.method === 'GET' && (url.pathname === '/app' || url.pathname.startsWith('/app/'))) {
      if (url.pathname.startsWith('/app/assets/')) {
        return jsonResponse({ error: 'Asset not found', error_code: 'asset_not_found' }, 404);
      }
      const nonce = generateCspNonce();
      const csrfCookieHeader = getOrCreateCsrfCookieHeader(request, env);
      return htmlResponse(
        renderSpaShellHtml(),
        nonce,
        csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined,
      );
    }

    // Previous UI paths are redirected to the SPA app routes.
    if (request.method === 'GET') {
      const previousUiPathMap: Record<string, string> = {
        '/': '/app/onboarding',
        '/signup': '/app/signup',
        '/login': '/app/login',
        '/reset-password': '/app/reset-password',
        '/keys': '/app/keys',
        '/chat': '/app/console',
      };
      const redirectedPath = previousUiPathMap[url.pathname];
      if (redirectedPath) {
        const redirectUrl = new URL(redirectedPath, request.url);
        const csrfCookieHeader = getOrCreateCsrfCookieHeader(request, env);
        return redirectResponse(
          redirectUrl.toString(),
          302,
          csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined,
        );
      }
    }

    if (url.pathname === '/api/session') {
      if (request.method !== 'GET') {
        return jsonError('Method not allowed', 405, 'method_not_allowed');
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;
      const sessionSecret = getUiSessionSecret(env);
      let sessionUserId: string | null = null;
      if (sessionSecret) {
        const cookieToken = parseCookies(request.headers.get('cookie')).clmcp_ui;
        const parsedPayload = cookieToken ? parseUiSessionToken(cookieToken) : null;
        if (!parsedPayload || !(await isUiSessionRevoked(env, parsedPayload.jti))) {
          sessionUserId = await getUiSessionUserId(request, sessionSecret);
        }
      }
      const csrfCookieHeader = getOrCreateCsrfCookieHeader(request, env);
      return jsonResponse(
        {
          authenticated: Boolean(sessionUserId),
          user: sessionUserId ? { id: sessionUserId } : null,
          turnstile_site_key: env.TURNSTILE_SITE_KEY?.trim() || undefined,
        },
        200,
        csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined,
      );
    }

    if (url.pathname === '/api/login') {
      if (request.method !== 'POST') {
        return jsonError('Method not allowed', 405, 'method_not_allowed');
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;
      const csrfError = requireCsrfToken(request);
      if (csrfError) return csrfError;

      const managementConfig = getSupabaseManagementConfig(env);
      const signupConfig = getSupabaseSignupConfig(env);
      if (!managementConfig && !signupConfig) {
        return jsonError('Supabase auth is not configured on this worker.', 503, 'supabase_not_configured');
      }

      const body = await parseJsonBody<{ email?: string; password?: string }>(request);
      const email = body?.email?.trim().toLowerCase() || '';
      const password = body?.password || '';

      const loginRateLimited = await applyUiRateLimit(request, env, 'signup', email || undefined);
      if (loginRateLimited) return loginRateLimited;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonError('A valid email is required.', 400, 'invalid_email');
      }
      if (password.length < 8 || password.length > 256) {
        return jsonError('Password must be 8–256 characters.', 400, 'invalid_password');
      }

      try {
        const authResult = managementConfig
          ? await authenticateUserWithPassword(managementConfig, email, password)
          : await authenticateUserWithAnonKey(signupConfig!, email, password);
        if (!authResult.user.email_confirmed_at) {
          return jsonError('Email verification is required before login.', 403, 'email_not_verified');
        }
        const sessionSecret = getUiSessionSecret(env);
        if (!sessionSecret) {
          return jsonError('Session signing secret is not configured.', 503, 'session_secret_missing');
        }
        const sessionToken = await createUiSessionToken(authResult.user.id, sessionSecret, 12 * 60 * 60);
        const secureCookies = isSecureCookieRequest(request, env);
        const responseHeaders = new Headers();
        responseHeaders.append('Set-Cookie', buildUiSessionCookie(sessionToken, secureCookies));
        responseHeaders.append('Set-Cookie', buildUiSessionIndicatorCookie(secureCookies));
        applySecurityHeaders(responseHeaders);
        return Response.json(
          {
            message: 'Login successful.',
            user: {
              id: authResult.user.id,
              email: authResult.user.email ?? email,
            },
          },
          {
            status: 200,
            headers: responseHeaders,
          },
        );
      } catch {
        return jsonError('Invalid email or password.', 401, 'invalid_credentials');
      }
    }

    if (url.pathname === '/api/login/token') {
      if (request.method !== 'POST') {
        return jsonError('Method not allowed', 405, 'method_not_allowed');
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;
      const csrfError = requireCsrfToken(request);
      if (csrfError) return csrfError;

      const signupConfig = getSupabaseSignupConfig(env);
      if (!signupConfig) {
        return jsonError(
          'Supabase public signup is not configured on this worker.',
          503,
          'supabase_signup_not_configured',
        );
      }

      const body = await parseJsonBody<{ accessToken?: string }>(request);
      const accessToken = body?.accessToken?.trim() || '';
      if (!accessToken) {
        return jsonError('accessToken is required.', 400, 'missing_access_token');
      }

      try {
        const user = await getSupabaseUserFromAccessToken(signupConfig, accessToken);
        if (!user.email_confirmed_at) {
          return jsonError('Email verification is required before login.', 403, 'email_not_verified');
        }

        const sessionSecret = getUiSessionSecret(env);
        if (!sessionSecret) {
          return jsonError('Session signing secret is not configured.', 503, 'session_secret_missing');
        }
        const sessionToken = await createUiSessionToken(user.id, sessionSecret, 12 * 60 * 60);
        const secureCookies = isSecureCookieRequest(request, env);
        const responseHeaders = new Headers();
        responseHeaders.append('Set-Cookie', buildUiSessionCookie(sessionToken, secureCookies));
        responseHeaders.append('Set-Cookie', buildUiSessionIndicatorCookie(secureCookies));
        applySecurityHeaders(responseHeaders);
        return Response.json(
          {
            message: 'Login successful.',
            user: {
              id: user.id,
              email: user.email ?? null,
            },
          },
          {
            status: 200,
            headers: responseHeaders,
          },
        );
      } catch {
        return jsonError('Invalid or expired signup token.', 401, 'invalid_signup_token');
      }
    }

    if (url.pathname === '/api/password/forgot') {
      if (request.method !== 'POST') {
        return jsonError('Method not allowed', 405, 'method_not_allowed');
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;
      const csrfError = requireCsrfToken(request);
      if (csrfError) return csrfError;

      const signupConfig = getSupabaseSignupConfig(env);
      if (!signupConfig) {
        return jsonError(
          'Supabase public signup is not configured on this worker.',
          503,
          'supabase_signup_not_configured',
        );
      }

      const body = await parseJsonBody<{ email?: string }>(request);
      const email = body?.email?.trim().toLowerCase() || '';

      const forgotRateLimited = await applyUiRateLimit(request, env, 'signup', email || undefined);
      if (forgotRateLimited) return forgotRateLimited;

      if (!email || !email.includes('@')) {
        return jsonError('A valid email is required.', 400, 'invalid_email');
      }

      try {
        await sendPasswordResetEmail(signupConfig, email, {
          redirectTo: getPasswordResetRedirectUrl(env, url.origin),
        });
      } catch (error) {
        console.warn('password_reset_email_failed', error);
      }

      return jsonResponse(
        {
          message:
            'If the request can be processed, check your email for password reset instructions.',
        },
        202,
      );
    }

    if (url.pathname === '/api/password/reset') {
      if (request.method !== 'POST') {
        return jsonError('Method not allowed', 405, 'method_not_allowed');
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;
      const csrfError = requireCsrfToken(request);
      if (csrfError) return csrfError;

      const signupConfig = getSupabaseSignupConfig(env);
      if (!signupConfig) {
        return jsonError(
          'Supabase public signup is not configured on this worker.',
          503,
          'supabase_signup_not_configured',
        );
      }

      const body = await parseJsonBody<{ accessToken?: string; password?: string }>(request);
      const accessToken = body?.accessToken?.trim() || '';
      const password = body?.password || '';

      const resetRateLimited = await applyUiRateLimit(request, env, 'signup');
      if (resetRateLimited) return resetRateLimited;

      if (!accessToken) {
        return jsonError('accessToken is required.', 400, 'missing_access_token');
      }
      if (password.length < 8 || password.length > 256) {
        return jsonError('Password must be 8–256 characters.', 400, 'invalid_password');
      }

      try {
        const user = await resetPasswordWithAccessToken(signupConfig, accessToken, password);

        // Recovery link proves email ownership — confirm email if not yet confirmed
        const managementConfig = getSupabaseManagementConfig(env);
        if (managementConfig && user?.id && !user.email_confirmed_at) {
          try {
            await confirmUserEmail(managementConfig, user.id);
          } catch (confirmErr) {
            console.warn('email_confirm_after_reset_failed', confirmErr);
          }
        }

        // Auto-login: create session so user doesn't have to re-enter credentials
        const userId = user?.id;
        const sessionSecret = getUiSessionSecret(env);
        if (userId && sessionSecret) {
          const sessionToken = await createUiSessionToken(userId, sessionSecret, 12 * 60 * 60);
          const secureCookies = isSecureCookieRequest(request, env);
          const responseHeaders = new Headers();
          responseHeaders.append('Set-Cookie', buildUiSessionCookie(sessionToken, secureCookies));
          responseHeaders.append('Set-Cookie', buildUiSessionIndicatorCookie(secureCookies));
          applySecurityHeaders(responseHeaders);
          return Response.json(
            {
              message: 'Password has been reset. You are now logged in.',
              autoLogin: true,
              user: { id: userId, email: user.email ?? null },
            },
            { status: 200, headers: responseHeaders },
          );
        }

        return jsonResponse({ message: 'Password has been reset. You can now log in.' }, 200);
      } catch {
        return jsonError('Invalid or expired recovery token.', 401, 'invalid_recovery_token');
      }
    }

    if (url.pathname === '/api/logout') {
      if (request.method !== 'POST') {
        return jsonError('Method not allowed', 405, 'method_not_allowed');
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;
      const csrfError = requireCsrfToken(request);
      if (csrfError) return csrfError;

      const sessionSecret = getUiSessionSecret(env);
      if (sessionSecret) {
        const cookieToken = parseCookies(request.headers.get('cookie')).clmcp_ui;
        const parsedPayload = cookieToken ? parseUiSessionToken(cookieToken) : null;
        if (parsedPayload) {
          await revokeUiSession(env, parsedPayload.jti, parsedPayload.exp);
        }
      }

      const secureCookies = isSecureCookieRequest(request, env);
      const responseHeaders = new Headers();
      responseHeaders.append('Set-Cookie', buildUiSessionCookieClear(secureCookies));
      responseHeaders.append('Set-Cookie', buildUiSessionIndicatorCookieClear(secureCookies));
      applySecurityHeaders(responseHeaders);
      return Response.json(
        { message: 'Logged out.' },
        {
          status: 200,
          headers: responseHeaders,
        },
      );
    }

    if (url.pathname === '/api/signup') {
      if (request.method !== 'POST') {
        return jsonError('Method not allowed', 405, 'method_not_allowed');
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;

      const signupConfig = getSupabaseSignupConfig(env);
      if (!signupConfig) {
        return jsonError(
          'Supabase public signup is not configured on this worker.',
          503,
          'supabase_signup_not_configured',
        );
      }
      const managementConfig = getSupabaseManagementConfig(env);

      const body = await parseJsonBody<{
        email?: string;
        password?: string;
        fullName?: string;
        label?: string;
        expiresDays?: number;
        turnstileToken?: string;
      }>(request);

      const email = body?.email?.trim().toLowerCase() || '';
      const password = body?.password || '';
      const fullName = (body?.fullName?.trim() || '').slice(0, 256);
      const turnstileToken = body?.turnstileToken?.trim() || '';
      const requestIp = getRequestIp(request);
      const turnstileSecret = env.TURNSTILE_SECRET_KEY?.trim();

      const signupRateLimited = await applyUiRateLimit(request, env, 'signup', email || undefined);
      if (signupRateLimited) {
        return signupRateLimited;
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonError('A valid email is required.', 400, 'invalid_email');
      }
      if (password.length < 8 || password.length > 256) {
        return jsonError('Password must be 8–256 characters.', 400, 'invalid_password');
      }
      if (turnstileSecret) {
        if (!turnstileToken) {
          return jsonError('Turnstile verification is required.', 400, 'turnstile_token_required');
        }
        const verified = await verifyTurnstileToken(turnstileSecret, turnstileToken, requestIp);
        if (!verified) {
          return jsonError('Turnstile verification failed.', 400, 'turnstile_verification_failed');
        }
      }

      try {
        const signupResult = await signUpSupabaseUser(
          signupConfig,
          { email, password, fullName },
          { emailRedirectTo: getSignupRedirectUrl(env, url.origin) },
        );
        if (managementConfig) {
          try {
            await logAuditEvent(managementConfig, {
              actorType: 'anonymous',
              targetUserId: signupResult.user?.id ?? null,
              action: 'signup.user_created',
              status: 'success',
              requestIp,
              metadata: { email },
            });
          } catch (auditError) {
            console.warn('audit_log_failed', auditError);
          }
        }
        return jsonResponse(
          {
            message:
              'If the request can be processed, check your email for verification and next steps.',
          },
          202,
        );
      } catch (error) {
        if (managementConfig) {
          try {
            await logAuditEvent(managementConfig, {
              actorType: 'anonymous',
              action: 'signup.user_created',
              status: 'error',
              requestIp,
              metadata: {
                email,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          } catch (auditError) {
            console.warn('audit_log_failed', auditError);
          }
        }
        return jsonResponse(
          {
            message:
              'If the request can be processed, check your email for verification and next steps.',
          },
          202,
        );
      }
    }

    if (url.pathname === '/api/keys') {
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;

      const keysRateLimited = await applyUiRateLimit(request, env, 'keys');
      if (keysRateLimited) {
        return keysRateLimited;
      }

      const authResult = await authenticateUiApiRequest(request, env);
      if (authResult instanceof Response) {
        return authResult;
      }
      const perUserRateLimited = await applyUiRateLimit(
        request,
        env,
        'keys',
        `user:${authResult.userId}`,
      );
      if (perUserRateLimited) {
        return perUserRateLimited;
      }

      const config = getSupabaseManagementConfig(env);
      if (!config) {
        return jsonError('Supabase auth is not configured on this worker.', 503, 'supabase_not_configured');
      }

      if (request.method === 'GET') {
        try {
          const keys = await listApiKeysForUser(config, authResult.userId, 100);
          return jsonResponse({
            user_id: authResult.userId,
            keys,
          });
        } catch {
          return jsonError('Failed to list keys.', 400, 'keys_list_failed');
        }
      }

      if (request.method === 'POST') {
        if (authResult.authType === 'session') {
          const csrfError = requireCsrfToken(request);
          if (csrfError) return csrfError;
        }
        const body = await parseJsonBody<{ label?: string; expiresDays?: number }>(request);
        const label = (body?.label?.trim() || 'rotation').slice(0, 200);
        const maxTtlDays = getApiKeyMaxTtlDays(env);
        const expiresAt = getCappedExpiresAtFromDays(body?.expiresDays, 90, maxTtlDays);

        try {
          const createdKey = await createApiKeyForUser(config, {
            userId: authResult.userId,
            label,
            expiresAt,
          });
          try {
            await logAuditEvent(config, {
              actorType: 'user',
              actorUserId: authResult.userId,
              targetUserId: authResult.userId,
              apiKeyId: createdKey.key.id,
              action: 'keys.created',
              status: 'success',
              requestIp: getRequestIp(request),
              metadata: { label: createdKey.key.label },
            });
          } catch (auditError) {
            console.warn('audit_log_failed', auditError);
          }
          return jsonResponse(
            {
              message: 'Key created.',
              api_key: {
                id: createdKey.key.id,
                label: createdKey.key.label,
                created_at: createdKey.key.created_at,
                expires_at: createdKey.key.expires_at,
                token: createdKey.token,
              },
            },
            201,
          );
        } catch {
          return jsonError('Failed to create key.', 400, 'key_create_failed');
        }
      }

      return jsonError('Method not allowed', 405, 'method_not_allowed');
    }

    if (url.pathname === '/api/keys/revoke') {
      if (request.method !== 'POST') {
        return jsonError('Method not allowed', 405, 'method_not_allowed');
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;

      const keysRateLimited = await applyUiRateLimit(request, env, 'keys');
      if (keysRateLimited) {
        return keysRateLimited;
      }

      const authResult = await authenticateUiApiRequest(request, env);
      if (authResult instanceof Response) {
        return authResult;
      }
      const perUserRateLimited = await applyUiRateLimit(
        request,
        env,
        'keys',
        `user:${authResult.userId}`,
      );
      if (perUserRateLimited) {
        return perUserRateLimited;
      }

      const config = getSupabaseManagementConfig(env);
      if (!config) {
        return jsonError('Supabase auth is not configured on this worker.', 503, 'supabase_not_configured');
      }

      const body = await parseJsonBody<{ keyId?: string }>(request);
      if (authResult.authType === 'session') {
        const csrfError = requireCsrfToken(request);
        if (csrfError) return csrfError;
      }
      const keyId = body?.keyId?.trim();
      if (!keyId) {
        return jsonError('keyId is required.', 400, 'missing_key_id');
      }

      try {
        const revoked = await revokeApiKeyForUser(config, authResult.userId, keyId);
        if (!revoked) {
          return jsonError('Key not found or already revoked.', 404, 'key_not_found');
        }
        try {
          await logAuditEvent(config, {
            actorType: 'user',
            actorUserId: authResult.userId,
            targetUserId: authResult.userId,
            apiKeyId: keyId,
            action: 'keys.revoked',
            status: 'success',
            requestIp: getRequestIp(request),
          });
        } catch (auditError) {
          console.warn('audit_log_failed', auditError);
        }
        return jsonResponse({ message: 'Key revoked.' });
      } catch {
        return jsonError('Failed to revoke key.', 400, 'key_revoke_failed');
      }
    }

    if (url.pathname === '/api/ai-chat') {
      if (request.method !== 'POST') {
        return jsonError('Method not allowed', 405, 'method_not_allowed');
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;

      const authResult = await authenticateUiApiRequest(request, env);
      if (authResult instanceof Response) {
        return authResult;
      }
      const aiChatQuota = await applyAiChatLifetimeQuota(env, authResult.userId);
      if (aiChatQuota) return aiChatQuota;
      if (authResult.authType === 'session') {
        const csrfError = requireCsrfToken(request);
        if (csrfError) return csrfError;
      }

      const body = await parseJsonBody<{
        message?: string;
        mcpToken?: string;
        mcpSessionId?: string;
        toolName?: 'auto' | 'search_cases' | 'search_opinions' | 'lookup_citation';
        mode?: 'cheap' | 'balanced';
        testMode?: boolean;
      }>(request);
      if (!body || !isPlainObject(body)) {
        return jsonError('Invalid request payload.', 400, 'invalid_request_schema');
      }

      if (typeof body.message !== 'string' || typeof body.mcpToken !== 'string') {
        return jsonError('message and mcpToken must be strings.', 400, 'invalid_request_schema');
      }
      if (
        typeof body.testMode !== 'undefined' &&
        typeof body.testMode !== 'boolean'
      ) {
        return jsonError('testMode must be a boolean.', 400, 'invalid_request_schema');
      }

      const message = body.message.trim();
      if (message.length > 10000) {
        return jsonError('Message too long (max 10,000 characters).', 400, 'message_too_long');
      }
      const mcpToken = body.mcpToken.trim();
      const requestedTool = body.toolName || 'auto';
      const testMode = body.testMode === true;
      const mode = testMode ? 'cheap' : body.mode === 'balanced' ? 'balanced' : 'cheap';
      const toolName =
        requestedTool === 'auto'
          ? testMode
            ? 'search_cases'
            : aiToolFromPrompt(message)
          : requestedTool;
      const priorSessionId = body?.mcpSessionId?.trim() || '';

      if (!message) {
        return jsonError('message is required.', 400, 'missing_message');
      }
      if (!mcpToken) {
        return jsonError('mcpToken is required.', 400, 'missing_mcp_token');
      }
      try {
        const initializeResult = priorSessionId
          ? null
          : await callMcpJsonRpc(
              env,
              ctx,
              mcpToken,
              'initialize',
              {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'courtlistener-ai-chat', version: '1.0.0' },
              },
              1,
            );

        const activeSessionId = priorSessionId || initializeResult?.sessionId || '';
        if (!activeSessionId) {
          return jsonError('Failed to create MCP session.', 502, 'mcp_session_failed');
        }

        const toolResult = await callMcpJsonRpc(
          env,
          ctx,
          mcpToken,
          'tools/call',
          {
            name: toolName,
            arguments: aiToolArguments(toolName, message),
          },
          2,
          activeSessionId,
        );
        if (!hasValidMcpRpcShape(toolResult.payload)) {
          return jsonError('Invalid MCP response format.', 502, 'mcp_response_invalid');
        }

        let completionText = buildLowCostSummary(message, toolName, toolResult.payload);
        let fallbackUsed = true;
        if (env.AI && typeof env.AI.run === 'function') {
          const model = env.CLOUDFLARE_AI_MODEL?.trim() || DEFAULT_CF_AI_MODEL;
          const completion = await env.AI.run(model, {
            messages: [
              {
                role: 'system',
                content:
                  testMode
                    ? 'You are a legal research assistant. Deterministic test mode: keep response under 100 words and use sections: Summary, What MCP Returned, Next Follow-up Query.'
                    : 'You are a legal research assistant. Keep response under 140 words. Use sections: Summary, What MCP Returned, Next Follow-up Query.',
              },
              {
                role: 'user',
                content: `User question: ${message}\n\nMCP tool used: ${toolName}\n\nMCP raw response JSON:\n${JSON.stringify(toolResult.payload).slice(0, mode === 'cheap' ? 3500 : 10000)}`,
              },
            ],
            max_tokens: testMode ? 120 : mode === 'cheap' ? CHEAP_MODE_MAX_TOKENS : BALANCED_MODE_MAX_TOKENS,
            temperature: testMode ? 0 : mode === 'cheap' ? 0 : 0.2,
          });

          const aiText =
            (completion as { response?: string }).response ||
            (completion as { result?: { response?: string } }).result?.response ||
            '';
          if (aiText.trim()) {
            completionText = aiText.trim();
            fallbackUsed = false;
          }
        }
        if (!completionText.trim()) {
          return jsonError('Invalid AI response format.', 502, 'ai_response_invalid');
        }

        return jsonResponse({
          test_mode: testMode,
          fallback_used: fallbackUsed,
          mode,
          tool: toolName,
          session_id: toolResult.sessionId || activeSessionId,
          ai_response: completionText,
          mcp_result: toolResult.payload,
        });
      } catch (error) {
        console.error('[ui-api] handler failed', { error });
        return jsonError(
          error instanceof Error ? error.message : 'Failed to generate AI response.',
          502,
          'ai_chat_failed',
        );
      }
    }

    // Guard MCP endpoints with method/origin/auth/protocol checks
    if (mcpPath) {
      if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
        return withCors(
          new Response('Method not allowed', { status: 405 }),
          origin,
          allowedOrigins,
        );
      }

      if (!isAllowedOrigin(origin, allowedOrigins)) {
        return withCors(new Response('Forbidden origin', { status: 403 }), origin, allowedOrigins);
      }
    }

    // MCP endpoint auth (OIDC/Access JWT and/or static bearer token)
    if (mcpPath) {
      const clientId = getClientIdentifier(request);
      const nowMs = Date.now();
      const rateLimited = await getAuthRateLimitedResponse(clientId, env, nowMs);
      if (rateLimited) {
        return withCors(rateLimited, origin, allowedOrigins);
      }

      const authError = await authorizeMcpRequest(request, env);
      if (authError) {
        if (authError.status === 401 || authError.status === 403) {
          await recordAuthFailure(clientId, env, nowMs);
          const postFailureRateLimited = await getAuthRateLimitedResponse(clientId, env, nowMs);
          if (postFailureRateLimited) {
            return withCors(postFailureRateLimited, origin, allowedOrigins);
          }
        }
        return withCors(authError, origin, allowedOrigins);
      }

      await clearAuthFailures(clientId, env, nowMs);
    }

    // Optional strict protocol version gate
    if (mcpPath && request.method === 'POST') {
      const requireProtocolVersion = parseBoolean(env.MCP_REQUIRE_PROTOCOL_VERSION);
      const protocolVersion = request.headers.get('MCP-Protocol-Version');
      const protocolError = validateProtocolVersionHeader(
        protocolVersion,
        requireProtocolVersion,
        SUPPORTED_MCP_PROTOCOL_VERSIONS,
      );
      if (protocolError) {
        return withCors(protocolError, origin, allowedOrigins);
      }
    }

    // Friendly guidance when /sse is called without MCP-required Accept header
    if (url.pathname === '/sse') {
      const accept = request.headers.get('Accept') ?? '';
      if (!accept.includes('text/event-stream')) {
        return Response.json(
          {
            error: 'Not Acceptable',
            message: 'Client must include Accept: application/json, text/event-stream',
            example:
              'curl -i https://courtlistenermcp.blakeoxford.com/sse -H \'Accept: application/json, text/event-stream\' -H \'Content-Type: application/json\' -d \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}\'',
          },
          { status: 406, headers: buildCorsHeaders(origin, allowedOrigins) },
        );
      }
    }

    if (url.pathname === '/mcp') {
      const response = await mcpStreamableHandler.fetch(request, env, ctx);
      return withCors(response, origin, allowedOrigins);
    }

    if (url.pathname === '/sse') {
      const response = await mcpSseCompatibilityHandler.fetch(request, env, ctx);
      return withCors(response, origin, allowedOrigins);
    }

    return new Response('Not found', { status: 404 });
  },
};
