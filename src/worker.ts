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
 *   SUPABASE_ANON_KEY       — Legacy alias for publishable key
 *   SUPABASE_SERVICE_ROLE_KEY — Legacy alias for Supabase secret key
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
  authenticateUserWithPassword,
  createApiKeyForUser,
  getSupabaseManagementConfig,
  getSupabaseSignupConfig,
  getSupabaseUserFromAccessToken,
  listApiKeysForUser,
  logAuditEvent,
  resolvePrincipalFromApiToken,
  revokeApiKeyForUser,
  signUpSupabaseUser,
} from './server/supabase-management.js';
import {
  renderChatPage,
  renderKeysPage,
  renderLoginPage,
  renderOverviewPage,
  renderSignupPage,
} from './web/app.js';

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
  /** Legacy alias for publishable key */
  SUPABASE_ANON_KEY?: string;
  /** Legacy alias for Supabase secret key */
  SUPABASE_SERVICE_ROLE_KEY?: string;
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
  /** Maximum allowed API key TTL in days (default 90) */
  MCP_API_KEY_MAX_TTL_DAYS?: string;
  /** Secret used to sign UI session cookies (falls back to Supabase secret key aliases if unset) */
  MCP_UI_SESSION_SECRET?: string;
  /** Allow non-Secure UI cookies for local HTTP development (default false) */
  MCP_UI_INSECURE_COOKIES?: string;
  /** Legacy endpoint toggle for /api/signup/issue-key (default false) */
  MCP_ENABLE_SIGNUP_ISSUE_KEY?: string;
  /** Durable Object binding (auto-wired by wrangler.jsonc) */
  MCP_OBJECT: DurableObjectNamespace;
  /** Durable Object binding for auth failure rate limiting */
  AUTH_FAILURE_LIMITER: DurableObjectNamespace;
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

interface AuthFailureLimiterResponseBody {
  blocked: boolean;
  retryAfterSeconds: number;
  state: AuthFailureState;
}

const DEFAULT_AUTH_FAILURE_STATE: AuthFailureState = {
  count: 0,
  windowStartedAtMs: 0,
  blockedUntilMs: 0,
};

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

function wantsHtml(request: Request): boolean {
  const accept = request.headers.get('accept') || '';
  return accept.toLowerCase().includes('text/html');
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
    return jsonResponse({ error: 'Supabase auth is not configured on this worker.' }, 503);
  }

  const bearerToken = extractBearerToken(request.headers.get('authorization'));
  if (bearerToken) {
    const principal = await resolvePrincipalFromApiToken(config, bearerToken);
    if (principal) {
      return { ...principal, authType: 'api_key' };
    }
    return jsonResponse({ error: 'Invalid or expired API token.' }, 401);
  }

  const sessionSecret = (
    env.MCP_UI_SESSION_SECRET ||
    env.SUPABASE_SECRET_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
  if (!sessionSecret) {
    return jsonResponse({ error: 'Missing bearer token.' }, 401);
  }
  const sessionUserId = await getUiSessionUserId(request, sessionSecret);
  if (!sessionUserId) {
    return jsonResponse({ error: 'Missing bearer token.' }, 401);
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
  const payloadObj = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const signature = await signSessionPayload(payload, secret);
  return `${payload}.${signature}`;
}

async function getUiSessionUserId(request: Request, secret: string): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);
  const token = cookies.clmcp_ui;
  if (!token) return null;
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) return null;
  const expectedSignature = await signSessionPayload(payloadPart, secret);
  if (expectedSignature !== signaturePart) return null;
  const payloadRaw = base64UrlDecode(payloadPart);
  if (!payloadRaw) return null;
  try {
    const payload = JSON.parse(payloadRaw) as { sub?: string; exp?: number };
    if (!payload.sub || !payload.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
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
  if (!cookieToken || !headerToken || headerToken !== cookieToken) {
    return jsonResponse({ error: 'CSRF token validation failed.' }, 403);
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

    const body = await parseJsonBody<AuthFailureLimiterRequestBody>(request);
    if (!body) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }

    const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : Date.now();
    const maxAttempts = Math.max(1, body.maxAttempts);
    const windowMs = Math.max(1_000, body.windowMs);
    const blockMs = Math.max(1_000, body.blockMs);
    const action = body.action;

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
    if (nowMs - current.windowStartedAtMs > windowMs) {
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
  return Response.json(
    {
      error: 'rate_limited',
      message: 'Too many failed authentication attempts',
      retry_after_seconds: retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    },
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

  return jsonResponse(
    {
      error: 'rate_limited',
      message: `Too many ${limitType} requests. Please retry later.`,
      retry_after_seconds: result.retryAfterSeconds,
    },
    429,
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
  } else if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    headers.set('Access-Control-Allow-Origin', '*');
  }

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
    return jsonResponse({ error: 'Forbidden origin' }, 403);
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

    // Helpful root response for browser/manual checks
    if (url.pathname === '/') {
      if (request.method === 'GET' && wantsHtml(request)) {
        const nonce = generateCspNonce();
        const csrfCookieHeader = getOrCreateCsrfCookieHeader(request, env);
        return htmlResponse(renderOverviewPage(nonce), nonce, csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined);
      }

      return jsonResponse({
        service: 'courtlistener-mcp',
        status: 'ok',
        message: 'MCP endpoint is available at /mcp (primary) and /sse (compatibility)',
        endpoints: {
          health: '/health',
          mcp: '/mcp',
          sse_compat: '/sse',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/signup') {
      const nonce = generateCspNonce();
      const turnstileSiteKey = env.TURNSTILE_SITE_KEY?.trim();
      const csrfCookieHeader = getOrCreateCsrfCookieHeader(request, env);
      return htmlResponse(
        turnstileSiteKey
          ? renderSignupPage(nonce, {
              turnstileSiteKey,
            })
          : renderSignupPage(nonce),
        nonce,
        csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined,
      );
    }

    if (request.method === 'GET' && url.pathname === '/login') {
      const nonce = generateCspNonce();
      const csrfCookieHeader = getOrCreateCsrfCookieHeader(request, env);
      return htmlResponse(renderLoginPage(nonce), nonce, csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined);
    }

    if (request.method === 'GET' && url.pathname === '/keys') {
      const nonce = generateCspNonce();
      const csrfCookieHeader = getOrCreateCsrfCookieHeader(request, env);
      return htmlResponse(renderKeysPage(nonce), nonce, csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined);
    }

    if (request.method === 'GET' && url.pathname === '/chat') {
      const nonce = generateCspNonce();
      const csrfCookieHeader = getOrCreateCsrfCookieHeader(request, env);
      return htmlResponse(renderChatPage(nonce), nonce, csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined);
    }

    if (url.pathname === '/api/session') {
      if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;
      const sessionSecret = (
        env.MCP_UI_SESSION_SECRET ||
        env.SUPABASE_SECRET_KEY ||
        env.SUPABASE_SERVICE_ROLE_KEY ||
        ''
      ).trim();
      const sessionUserId = sessionSecret ? await getUiSessionUserId(request, sessionSecret) : null;
      const csrfCookieHeader = getOrCreateCsrfCookieHeader(request, env);
      return jsonResponse(
        {
          authenticated: Boolean(sessionUserId),
          user: sessionUserId ? { id: sessionUserId } : null,
        },
        200,
        csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined,
      );
    }

    if (url.pathname === '/api/login') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;
      const csrfError = requireCsrfToken(request);
      if (csrfError) return csrfError;

      const config = getSupabaseManagementConfig(env);
      if (!config) {
        return jsonResponse({ error: 'Supabase auth is not configured on this worker.' }, 503);
      }

      const body = await parseJsonBody<{ email?: string; password?: string }>(request);
      const email = body?.email?.trim().toLowerCase() || '';
      const password = body?.password || '';

      const loginRateLimited = await applyUiRateLimit(request, env, 'signup', email || undefined);
      if (loginRateLimited) return loginRateLimited;

      if (!email || !email.includes('@')) {
        return jsonResponse({ error: 'A valid email is required.' }, 400);
      }
      if (password.length < 8) {
        return jsonResponse({ error: 'Password must be at least 8 characters.' }, 400);
      }

      try {
        const authResult = await authenticateUserWithPassword(config, email, password);
        if (!authResult.user.email_confirmed_at) {
          return jsonResponse({ error: 'Email verification is required before login.' }, 403);
        }
        const sessionSecret = (
          env.MCP_UI_SESSION_SECRET ||
          env.SUPABASE_SECRET_KEY ||
          env.SUPABASE_SERVICE_ROLE_KEY ||
          ''
        ).trim();
        if (!sessionSecret) {
          return jsonResponse({ error: 'Session signing secret is not configured.' }, 503);
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
        return jsonResponse({ error: 'Invalid email or password.' }, 401);
      }
    }

    if (url.pathname === '/api/login/token') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;
      const csrfError = requireCsrfToken(request);
      if (csrfError) return csrfError;

      const signupConfig = getSupabaseSignupConfig(env);
      if (!signupConfig) {
        return jsonResponse({ error: 'Supabase public signup is not configured on this worker.' }, 503);
      }

      const body = await parseJsonBody<{ accessToken?: string }>(request);
      const accessToken = body?.accessToken?.trim() || '';
      if (!accessToken) {
        return jsonResponse({ error: 'accessToken is required.' }, 400);
      }

      try {
        const user = await getSupabaseUserFromAccessToken(signupConfig, accessToken);
        if (!user.email_confirmed_at) {
          return jsonResponse({ error: 'Email verification is required before login.' }, 403);
        }

        const sessionSecret = (
          env.MCP_UI_SESSION_SECRET ||
          env.SUPABASE_SECRET_KEY ||
          env.SUPABASE_SERVICE_ROLE_KEY ||
          ''
        ).trim();
        if (!sessionSecret) {
          return jsonResponse({ error: 'Session signing secret is not configured.' }, 503);
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
        return jsonResponse({ error: 'Invalid or expired signup token.' }, 401);
      }
    }

    if (url.pathname === '/api/logout') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;
      const csrfError = requireCsrfToken(request);
      if (csrfError) return csrfError;
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
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;

      const signupConfig = getSupabaseSignupConfig(env);
      if (!signupConfig) {
        return jsonResponse({ error: 'Supabase public signup is not configured on this worker.' }, 503);
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
      const fullName = body?.fullName?.trim() || '';
      const turnstileToken = body?.turnstileToken?.trim() || '';
      const requestIp = getRequestIp(request);
      const turnstileSecret = env.TURNSTILE_SECRET_KEY?.trim();

      const signupRateLimited = await applyUiRateLimit(request, env, 'signup', email || undefined);
      if (signupRateLimited) {
        return signupRateLimited;
      }

      if (!email || !email.includes('@')) {
        return jsonResponse({ error: 'A valid email is required.' }, 400);
      }
      if (password.length < 8) {
        return jsonResponse({ error: 'Password must be at least 8 characters.' }, 400);
      }
      if (turnstileSecret) {
        if (!turnstileToken) {
          return jsonResponse({ error: 'Turnstile verification is required.' }, 400);
        }
        const verified = await verifyTurnstileToken(turnstileSecret, turnstileToken, requestIp);
        if (!verified) {
          return jsonResponse({ error: 'Turnstile verification failed.' }, 400);
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

    if (url.pathname === '/api/signup/issue-key') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }
      if (!parseBoolean(env.MCP_ENABLE_SIGNUP_ISSUE_KEY)) {
        return jsonResponse(
          {
            error: 'Legacy endpoint disabled. Use /api/login then /api/keys.',
          },
          410,
        );
      }
      const uiOriginRejection = rejectDisallowedUiOrigin(request, allowedOrigins);
      if (uiOriginRejection) return uiOriginRejection;

      const config = getSupabaseManagementConfig(env);
      if (!config) {
        return jsonResponse({ error: 'Supabase auth is not configured on this worker.' }, 503);
      }

      const body = await parseJsonBody<{
        email?: string;
        password?: string;
        label?: string;
        expiresDays?: number;
      }>(request);

      const email = body?.email?.trim().toLowerCase() || '';
      const password = body?.password || '';
      const label = body?.label?.trim() || 'primary';
      const requestIp = getRequestIp(request);
      const maxTtlDays = getApiKeyMaxTtlDays(env);
      const expiresAt = getCappedExpiresAtFromDays(body?.expiresDays, 90, maxTtlDays);

      const signupRateLimited = await applyUiRateLimit(request, env, 'signup', email || undefined);
      if (signupRateLimited) {
        return signupRateLimited;
      }

      if (!email || !email.includes('@')) {
        return jsonResponse({ error: 'A valid email is required.' }, 400);
      }
      if (password.length < 8) {
        return jsonResponse({ error: 'Password must be at least 8 characters.' }, 400);
      }

      try {
        const authResult = await authenticateUserWithPassword(config, email, password);
        if (!authResult.user.email_confirmed_at) {
          return jsonResponse(
            {
              error: 'Unable to issue key. Check credentials and email verification status.',
            },
            403,
          );
        }

        const createdKey = await createApiKeyForUser(config, {
          userId: authResult.user.id,
          label,
          expiresAt,
        });
        try {
          await logAuditEvent(config, {
            actorType: 'service',
            targetUserId: authResult.user.id,
            apiKeyId: createdKey.key.id,
            action: 'signup.initial_key_created',
            status: 'success',
            requestIp,
            metadata: { label: createdKey.key.label },
          });
        } catch (auditError) {
          console.warn('audit_log_failed', auditError);
        }
        return jsonResponse(
          {
            message: 'Initial API key issued.',
            user: {
              id: authResult.user.id,
              email: authResult.user.email ?? email,
            },
            api_key: {
              id: createdKey.key.id,
              label: createdKey.key.label,
              created_at: createdKey.key.created_at,
              expires_at: createdKey.key.expires_at,
              token: createdKey.token,
              max_ttl_days: maxTtlDays,
            },
          },
          201,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'issue_key_failed';
        try {
          await logAuditEvent(config, {
            actorType: 'anonymous',
            action: 'signup.initial_key_created',
            status: 'error',
            requestIp,
            metadata: {
              email,
              error: message,
            },
          });
        } catch (auditError) {
          console.warn('audit_log_failed', auditError);
        }
        return jsonResponse(
          { error: 'Unable to issue key. Check credentials and email verification status.' },
          403,
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
        return jsonResponse({ error: 'Supabase auth is not configured on this worker.' }, 503);
      }

      if (request.method === 'GET') {
        try {
          const keys = await listApiKeysForUser(config, authResult.userId, 100);
          return jsonResponse({
            user_id: authResult.userId,
            keys,
          });
        } catch {
          return jsonResponse({ error: 'Failed to list keys.' }, 400);
        }
      }

      if (request.method === 'POST') {
        if (authResult.authType === 'session') {
          const csrfError = requireCsrfToken(request);
          if (csrfError) return csrfError;
        }
        const body = await parseJsonBody<{ label?: string; expiresDays?: number }>(request);
        const label = body?.label?.trim() || 'rotation';
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
          return jsonResponse({ error: 'Failed to create key.' }, 400);
        }
      }

      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    if (url.pathname === '/api/keys/revoke') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
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
        return jsonResponse({ error: 'Supabase auth is not configured on this worker.' }, 503);
      }

      const body = await parseJsonBody<{ keyId?: string }>(request);
      if (authResult.authType === 'session') {
        const csrfError = requireCsrfToken(request);
        if (csrfError) return csrfError;
      }
      const keyId = body?.keyId?.trim();
      if (!keyId) {
        return jsonResponse({ error: 'keyId is required.' }, 400);
      }

      try {
        const revoked = await revokeApiKeyForUser(config, authResult.userId, keyId);
        if (!revoked) {
          return jsonResponse({ error: 'Key not found or already revoked.' }, 404);
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
        return jsonResponse({ error: 'Failed to revoke key.' }, 400);
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
