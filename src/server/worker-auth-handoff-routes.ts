import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { verifyAccessToken, type OAuthVerificationMetadata } from '../security/oidc.js';
import type { HostedOAuthCompletionSource } from '../auth/oauth-authorization-completion.js';
import {
  emitOAuthDiagnostic,
  summarizeHostedAuthReadiness,
  summarizeHostedAuthRequest,
  summarizeHostedAuthSignal,
  type HostedAuthSignalOutcome,
} from './oauth-diagnostics.js';
import type {
  WorkerUiSessionRuntime,
  WorkerUiSessionRuntimeEnv,
} from './worker-ui-session-runtime.js';
import {
  evaluateWorkerHostedAuthConfig,
  resolveWorkerHostedAuthConfig,
  type WorkerHostedAuthEnv,
  type WorkerUpstreamOidcClientConfig,
} from './worker-upstream-oidc-config.js';
import type { OAuthFrontdoorRateLimitDeps } from './worker-oauth-frontdoor-rate-limit.js';
import { getOAuthFrontdoorRateLimitedResponse } from './worker-oauth-frontdoor-rate-limit.js';

const AUTH_STATE_COOKIE_NAME = 'clauth_state';
const AUTH_APPROVAL_COOKIE_NAME = 'clauth_approve';
const AUTH_FLOW_COOKIE_NAME = 'clauth_flow';
const CSRF_COOKIE_NAME = 'clmcp_csrf';
const AUTH_STATE_TTL_SECONDS = 10 * 60;
const AUTH_APPROVAL_TTL_SECONDS = 10 * 60;
const AUTH_FLOW_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_AUTH_SUCCESS_PATH = '/app/account';
const UPSTREAM_DISCOVERY_TIMEOUT_MS = 5000;
const UPSTREAM_TOKEN_TIMEOUT_MS = 8000;
const AUTH_PAGE_STYLES = `
  :root {
    color-scheme: light dark;
    --auth-bg: #f5f7fb;
    --auth-surface: rgba(255, 255, 255, 0.9);
    --auth-panel: #ffffff;
    --auth-ink: #10233d;
    --auth-muted: #53657d;
    --auth-line: rgba(16, 35, 61, 0.12);
    --auth-brand: #0a7f5a;
    --auth-brand-deep: #086245;
    --auth-warn: #a65514;
    --auth-danger: #b53a3a;
    --auth-shadow: 0 28px 60px rgba(16, 35, 61, 0.14);
    --auth-radius: 20px;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --auth-bg: #09111d;
      --auth-surface: rgba(9, 17, 29, 0.82);
      --auth-panel: rgba(13, 24, 41, 0.9);
      --auth-ink: #f3f7ff;
      --auth-muted: #b5c0d2;
      --auth-line: rgba(243, 247, 255, 0.12);
      --auth-brand: #3cc58f;
      --auth-brand-deep: #2f9d72;
      --auth-warn: #ffb470;
      --auth-danger: #ff9d9d;
      --auth-shadow: 0 28px 60px rgba(0, 0, 0, 0.34);
    }
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    min-height: 100vh;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--auth-ink);
    background:
      radial-gradient(900px 520px at 10% -10%, rgba(46, 160, 120, 0.22), transparent 60%),
      radial-gradient(760px 420px at 100% 0%, rgba(76, 132, 255, 0.18), transparent 58%),
      linear-gradient(180deg, var(--auth-bg) 0%, color-mix(in srgb, var(--auth-bg) 90%, #ffffff) 100%);
  }

  a { color: inherit; }

  .auth-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .auth-card {
    width: min(100%, 760px);
    border: 1px solid var(--auth-line);
    background: var(--auth-surface);
    backdrop-filter: blur(14px);
    border-radius: var(--auth-radius);
    box-shadow: var(--auth-shadow);
    overflow: hidden;
  }

  .auth-card-inner {
    display: grid;
    gap: 24px;
    padding: 28px;
  }

  .auth-eyebrow {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--auth-brand);
  }

  .auth-header {
    display: grid;
    gap: 10px;
  }

  .auth-header h1 {
    margin: 0;
    font-size: clamp(1.9rem, 4vw, 2.5rem);
    line-height: 1.1;
  }

  .auth-subtitle {
    margin: 0;
    max-width: 56ch;
    color: var(--auth-muted);
    font-size: 1rem;
    line-height: 1.6;
  }

  .auth-panel {
    border: 1px solid var(--auth-line);
    border-radius: 18px;
    background: var(--auth-panel);
    padding: 20px;
  }

  .auth-copy {
    display: grid;
    gap: 12px;
  }

  .auth-copy p,
  .auth-footer p {
    margin: 0;
    color: var(--auth-muted);
    line-height: 1.6;
  }

  .auth-actions,
  .auth-form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .auth-inline-form {
    margin: 0;
  }

  .auth-button,
  .auth-button:visited {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 0 18px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  }

  button.auth-button {
    font: inherit;
  }

  .auth-button:hover { transform: translateY(-1px); }

  .auth-button-primary {
    background: var(--auth-brand);
    color: #fff;
  }

  .auth-button-primary:hover {
    background: var(--auth-brand-deep);
  }

  .auth-button-secondary {
    border-color: var(--auth-line);
    background: transparent;
    color: var(--auth-ink);
  }

  .auth-button-secondary:hover {
    background: color-mix(in srgb, var(--auth-panel) 84%, var(--auth-ink) 16%);
  }

  .auth-button-danger {
    background: var(--auth-danger);
    color: #fff;
  }

  .auth-meta {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .auth-meta-item {
    border: 1px solid var(--auth-line);
    border-radius: 14px;
    background: color-mix(in srgb, var(--auth-panel) 88%, #ffffff 12%);
    padding: 14px;
  }

  .auth-meta-label {
    display: block;
    margin-bottom: 6px;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--auth-muted);
  }

  .auth-meta-value {
    margin: 0;
    font-size: 1rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .auth-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .auth-chip {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--auth-line);
    border-radius: 999px;
    background: color-mix(in srgb, var(--auth-panel) 88%, var(--auth-brand) 12%);
    font-weight: 700;
  }

  .auth-section-title {
    margin: 0 0 10px;
    font-size: 0.95rem;
  }

  .auth-footer {
    display: grid;
    gap: 10px;
    padding-top: 4px;
    border-top: 1px solid var(--auth-line);
  }

  .auth-status {
    color: var(--auth-warn);
    font-weight: 700;
  }

  @media (max-width: 640px) {
    .auth-shell { padding: 16px; }
    .auth-card-inner { padding: 20px; }
    .auth-actions,
    .auth-form-actions,
    .auth-inline-form {
      display: grid;
      width: 100%;
    }
    .auth-button,
    .auth-inline-form .auth-button {
      width: 100%;
    }
  }
`;

type CookieSameSite = 'Lax' | 'Strict';

type HostedAuthStatus =
  | 'ready'
  | 'config_missing'
  | 'interactive_continue_required'
  | 'invalid_return_target'
  | 'upstream_discovery_failed'
  | 'upstream_discovery_timeout'
  | 'upstream_token_failed'
  | 'upstream_token_timeout'
  | 'invalid_return_state'
  | 'callback_failed'
  | 'approval_preparation_failed'
  | 'logout_confirmation_required'
  | 'logged_out';

interface UpstreamOidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
}

interface UpstreamOidcDiscoveryResolution {
  discovery: UpstreamOidcDiscovery;
  cacheStatus: 'hit' | 'miss';
}

interface HostedAuthUpstreamError extends Error {
  code:
    | 'upstream_discovery_failed'
    | 'upstream_discovery_timeout'
    | 'upstream_token_failed'
    | 'upstream_token_timeout';
}

const upstreamOidcDiscoveryCache = new Map<
  string,
  { value: UpstreamOidcDiscovery; expiresAtMs: number }
>();

interface AuthStatePayload {
  state: string;
  returnTo: string;
  codeVerifier: string;
  correlationId: string;
  exp: number;
}

interface AuthApprovalPayload {
  returnTo: string;
  correlationId: string;
  exp: number;
}

interface AuthFlowPayload {
  correlationId: string;
  exp: number;
}

interface HandleWorkerAuthHandoffRoutesDeps<TEnv extends WorkerUiSessionRuntimeEnv> {
  jsonError: (message: string, status: number, errorCode: string) => Response;
  generateCspNonce: () => string;
  htmlResponse: (html: string, nonce: string, extraHeaders?: HeadersInit) => Response;
  workerUiSessionRuntime: WorkerUiSessionRuntime<TEnv>;
  getOAuthHelpers: (env: TEnv) => OAuthHelpers;
  buildHostedOAuthCompletionDetails: (
    authMethod: HostedOAuthCompletionSource,
    userId: string,
  ) => { metadata: Record<string, unknown>; props: Record<string, unknown> };
  resolveGrantedScopes: (authRequest: { scope: string[] }) => string[];
  getClientIdentifier?: OAuthFrontdoorRateLimitDeps<TEnv>['getClientIdentifier'];
  getAuthRouteRateLimitedResponse?: OAuthFrontdoorRateLimitDeps<TEnv>['getAuthRouteRateLimitedResponse'];
  now?: OAuthFrontdoorRateLimitDeps<TEnv>['now'];
}

interface HandleWorkerAuthHandoffRoutesParams<TEnv extends WorkerUiSessionRuntimeEnv> {
  request: Request;
  url: URL;
  env: TEnv;
  deps: HandleWorkerAuthHandoffRoutesDeps<TEnv>;
}

function getHostedAuthSetupMessages(
  diagnostics: ReturnType<typeof evaluateWorkerHostedAuthConfig>,
): string[] {
  if (diagnostics.errors.length > 0) {
    return [
      'This Worker can serve the hosted auth handoff directly, but the current hosted auth configuration is incomplete.',
      ...diagnostics.errors,
    ];
  }

  return [
    'This Worker can serve the hosted auth handoff directly, but the upstream OIDC client configuration is missing.',
    'Configure OIDC_ISSUER plus MCP_AUTH_OIDC_CLIENT_ID and MCP_AUTH_OIDC_CLIENT_SECRET. During migration, LOGTO_APP_ID and LOGTO_APP_SECRET still work as the fallback pair when the generic Worker-native pair is absent.',
    'MCP_UI_SESSION_SECRET is also required so the Worker can sign UI session and auth-state cookies.',
  ];
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function encodeBase64Url(value: string | Uint8Array): string {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf-8') : Buffer.from(value);
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

async function signValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(signature));
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;

  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    const leftByte = leftBytes[index];
    const rightByte = rightBytes[index];
    if (leftByte === undefined || rightByte === undefined) return false;
    mismatch |= leftByte ^ rightByte;
  }
  return mismatch === 0;
}

function buildSignedCookie(
  name: string,
  payload: string,
  signature: string,
  secure: boolean,
  maxAge: number,
  sameSite: CookieSameSite = 'Lax',
): string {
  return `${name}=${payload}.${signature}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=${sameSite}; Max-Age=${maxAge}`;
}

function buildExpiredCookie(
  name: string,
  secure: boolean,
  sameSite: CookieSameSite = 'Lax',
): string {
  return `${name}=; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=${sameSite}; Max-Age=0`;
}

async function encodeAuthStateCookie(
  payload: AuthStatePayload,
  secret: string,
  secure: boolean,
): Promise<string> {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, secret);
  return buildSignedCookie(
    AUTH_STATE_COOKIE_NAME,
    encodedPayload,
    signature,
    secure,
    AUTH_STATE_TTL_SECONDS,
    'Lax',
  );
}

async function decodeAuthStateCookie(
  request: Request,
  secret: string,
): Promise<AuthStatePayload | null> {
  const raw = getCookieValue(request, AUTH_STATE_COOKIE_NAME);
  if (!raw) return null;
  const [encodedPayload, providedSignature] = raw.split('.');
  if (!encodedPayload || !providedSignature) return null;
  const expectedSignature = await signValue(encodedPayload, secret);
  if (!timingSafeEqualString(expectedSignature, providedSignature)) return null;
  const decoded = decodeBase64Url(encodedPayload);
  if (!decoded) return null;

  try {
    const payload = JSON.parse(decoded) as Partial<AuthStatePayload>;
    if (
      typeof payload.state !== 'string' ||
      typeof payload.returnTo !== 'string' ||
      typeof payload.codeVerifier !== 'string' ||
      typeof payload.correlationId !== 'string' ||
      typeof payload.exp !== 'number' ||
      !isSafeCorrelationId(payload.correlationId) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload as AuthStatePayload;
  } catch {
    return null;
  }
}

async function encodeAuthApprovalCookie(
  payload: AuthApprovalPayload,
  secret: string,
  secure: boolean,
): Promise<string> {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, secret);
  return buildSignedCookie(
    AUTH_APPROVAL_COOKIE_NAME,
    encodedPayload,
    signature,
    secure,
    AUTH_APPROVAL_TTL_SECONDS,
    'Strict',
  );
}

async function decodeAuthApprovalCookie(
  request: Request,
  secret: string,
): Promise<AuthApprovalPayload | null> {
  const raw = getCookieValue(request, AUTH_APPROVAL_COOKIE_NAME);
  if (!raw) return null;
  const [encodedPayload, providedSignature] = raw.split('.');
  if (!encodedPayload || !providedSignature) return null;
  const expectedSignature = await signValue(encodedPayload, secret);
  if (!timingSafeEqualString(expectedSignature, providedSignature)) return null;
  const decoded = decodeBase64Url(encodedPayload);
  if (!decoded) return null;

  try {
    const payload = JSON.parse(decoded) as Partial<AuthApprovalPayload>;
    if (
      typeof payload.returnTo !== 'string' ||
      typeof payload.correlationId !== 'string' ||
      typeof payload.exp !== 'number' ||
      !isSafeCorrelationId(payload.correlationId) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload as AuthApprovalPayload;
  } catch {
    return null;
  }
}

async function encodeAuthFlowCookie(
  payload: AuthFlowPayload,
  secret: string,
  secure: boolean,
): Promise<string> {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, secret);
  return buildSignedCookie(
    AUTH_FLOW_COOKIE_NAME,
    encodedPayload,
    signature,
    secure,
    AUTH_FLOW_TTL_SECONDS,
    'Lax',
  );
}

async function decodeAuthFlowCookie(
  request: Request,
  secret: string,
): Promise<AuthFlowPayload | null> {
  const raw = getCookieValue(request, AUTH_FLOW_COOKIE_NAME);
  if (!raw) return null;
  const [encodedPayload, providedSignature] = raw.split('.');
  if (!encodedPayload || !providedSignature) return null;
  const expectedSignature = await signValue(encodedPayload, secret);
  if (!timingSafeEqualString(expectedSignature, providedSignature)) return null;
  const decoded = decodeBase64Url(encodedPayload);
  if (!decoded) return null;

  try {
    const payload = JSON.parse(decoded) as Partial<AuthFlowPayload>;
    if (
      typeof payload.correlationId !== 'string' ||
      typeof payload.exp !== 'number' ||
      !isSafeCorrelationId(payload.correlationId) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload as AuthFlowPayload;
  } catch {
    return null;
  }
}

function createRandomToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

function isSafeCorrelationId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/u.test(value);
}

function createHostedAuthCorrelationId(): string {
  return createRandomToken(12);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(digest));
}

function getSecureCookieSetting<TEnv extends WorkerUiSessionRuntimeEnv>(
  request: Request,
  env: TEnv,
  deps: Pick<HandleWorkerAuthHandoffRoutesDeps<TEnv>, 'workerUiSessionRuntime'>,
): boolean {
  return deps.workerUiSessionRuntime.isSecureCookieRequest(request, env);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function createHostedAuthUpstreamError(
  code: HostedAuthUpstreamError['code'],
  message: string,
): HostedAuthUpstreamError {
  const error = new Error(message) as HostedAuthUpstreamError;
  error.code = code;
  return error;
}

function classifyHostedAuthErrorCode(
  error: unknown,
):
  | 'upstream_discovery_failed'
  | 'upstream_discovery_timeout'
  | 'upstream_token_failed'
  | 'upstream_token_timeout'
  | 'callback_failed' {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    switch (error.code) {
      case 'upstream_discovery_timeout':
        return 'upstream_discovery_timeout';
      case 'upstream_discovery_failed':
      case 'upstream_token_failed':
      case 'upstream_token_timeout':
        return error.code;
      default:
        break;
    }
  }
  return 'callback_failed';
}

interface HostedAuthResponseSignal {
  pathname: string;
  ready: boolean;
  status: HostedAuthStatus;
  outcome: HostedAuthSignalOutcome;
  correlationId?: string | null;
  authError?: string | null;
  credentialSource?: 'worker_native' | 'logto_legacy' | null;
  configErrorCount?: number;
  totalDurationMs?: number;
  upstreamDiscoveryDurationMs?: number;
  upstreamDiscoveryCacheStatus?: 'hit' | 'miss';
  tokenExchangeDurationMs?: number;
  tokenVerificationDurationMs?: number;
  jwksFetchDurationMs?: number;
  sessionCreationDurationMs?: number;
  approvalDurationMs?: number;
  logoutDurationMs?: number;
}

function normalizeDurationMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function getElapsedDurationMs(startedAtMs: number): number {
  return normalizeDurationMs(Date.now() - startedAtMs);
}

function extractVerificationSignalMetadata(
  error: unknown,
): Pick<HostedAuthResponseSignal, 'tokenVerificationDurationMs' | 'jwksFetchDurationMs'> {
  const metadata =
    error instanceof Error
      ? (error as Error & { verificationMetadata?: OAuthVerificationMetadata }).verificationMetadata
      : undefined;
  if (!metadata) {
    return {};
  }
  return {
    ...(typeof metadata.verificationDurationMs === 'number'
      ? { tokenVerificationDurationMs: normalizeDurationMs(metadata.verificationDurationMs) }
      : {}),
    ...(typeof metadata.jwksFetchDurationMs === 'number'
      ? { jwksFetchDurationMs: normalizeDurationMs(metadata.jwksFetchDurationMs) }
      : {}),
  };
}

function withHostedAuthRequestDuration(
  signal: HostedAuthResponseSignal,
  requestStartedAtMs: number,
): HostedAuthResponseSignal {
  return {
    ...signal,
    totalDurationMs: signal.totalDurationMs ?? getElapsedDurationMs(requestStartedAtMs),
  };
}

function appendHostedAuthHeaders(headers: Headers, signal: HostedAuthResponseSignal): Headers {
  headers.set('X-Hosted-Auth-Ready', signal.ready ? 'true' : 'false');
  headers.set('X-Hosted-Auth-Status', signal.status);
  if (signal.authError?.trim()) {
    headers.set('X-Hosted-Auth-Error', signal.authError.trim());
  } else {
    headers.delete('X-Hosted-Auth-Error');
  }
  const summary = summarizeHostedAuthSignal(signal);
  headers.set('X-Hosted-Auth-Route', String(summary.hosted_auth_route));
  headers.set('X-Hosted-Auth-Outcome', String(summary.hosted_auth_outcome));
  headers.set('X-Hosted-Auth-Category', String(summary.hosted_auth_category));
  headers.set('X-Hosted-Auth-Signal', String(summary.hosted_auth_signal));
  headers.set('X-Hosted-Auth-Failure', summary.hosted_auth_failure ? 'true' : 'false');
  headers.set('X-Hosted-Auth-Terminal', summary.hosted_auth_terminal ? 'true' : 'false');
  if (typeof summary.hosted_auth_correlation_id === 'string') {
    headers.set('X-Hosted-Auth-Correlation-Id', summary.hosted_auth_correlation_id);
  } else {
    headers.delete('X-Hosted-Auth-Correlation-Id');
  }
  if (typeof summary.hosted_auth_credential_source === 'string') {
    headers.set('X-Hosted-Auth-Credential-Source', summary.hosted_auth_credential_source);
  } else {
    headers.delete('X-Hosted-Auth-Credential-Source');
  }
  headers.set(
    'X-Hosted-Auth-Config-Error-Count',
    String(
      typeof summary.hosted_auth_config_error_count === 'number'
        ? summary.hosted_auth_config_error_count
        : 0,
    ),
  );
  if (typeof summary.hosted_auth_duration_ms === 'number') {
    headers.set('X-Hosted-Auth-Duration-Ms', String(summary.hosted_auth_duration_ms));
  } else {
    headers.delete('X-Hosted-Auth-Duration-Ms');
  }
  if (typeof summary.hosted_auth_upstream_discovery_duration_ms === 'number') {
    headers.set(
      'X-Hosted-Auth-Upstream-Discovery-Duration-Ms',
      String(summary.hosted_auth_upstream_discovery_duration_ms),
    );
  } else {
    headers.delete('X-Hosted-Auth-Upstream-Discovery-Duration-Ms');
  }
  if (typeof summary.hosted_auth_upstream_discovery_cache_status === 'string') {
    headers.set(
      'X-Hosted-Auth-Upstream-Discovery-Cache',
      summary.hosted_auth_upstream_discovery_cache_status,
    );
  } else {
    headers.delete('X-Hosted-Auth-Upstream-Discovery-Cache');
  }
  if (typeof summary.hosted_auth_token_exchange_duration_ms === 'number') {
    headers.set(
      'X-Hosted-Auth-Token-Exchange-Duration-Ms',
      String(summary.hosted_auth_token_exchange_duration_ms),
    );
  } else {
    headers.delete('X-Hosted-Auth-Token-Exchange-Duration-Ms');
  }
  if (typeof summary.hosted_auth_token_verification_duration_ms === 'number') {
    headers.set(
      'X-Hosted-Auth-Token-Verification-Duration-Ms',
      String(summary.hosted_auth_token_verification_duration_ms),
    );
  } else {
    headers.delete('X-Hosted-Auth-Token-Verification-Duration-Ms');
  }
  if (typeof summary.hosted_auth_jwks_fetch_duration_ms === 'number') {
    headers.set(
      'X-Hosted-Auth-JWKS-Fetch-Duration-Ms',
      String(summary.hosted_auth_jwks_fetch_duration_ms),
    );
  } else {
    headers.delete('X-Hosted-Auth-JWKS-Fetch-Duration-Ms');
  }
  if (typeof summary.hosted_auth_session_creation_duration_ms === 'number') {
    headers.set(
      'X-Hosted-Auth-Session-Creation-Duration-Ms',
      String(summary.hosted_auth_session_creation_duration_ms),
    );
  } else {
    headers.delete('X-Hosted-Auth-Session-Creation-Duration-Ms');
  }
  if (typeof summary.hosted_auth_approval_duration_ms === 'number') {
    headers.set(
      'X-Hosted-Auth-Approval-Duration-Ms',
      String(summary.hosted_auth_approval_duration_ms),
    );
  } else {
    headers.delete('X-Hosted-Auth-Approval-Duration-Ms');
  }
  if (typeof summary.hosted_auth_logout_duration_ms === 'number') {
    headers.set('X-Hosted-Auth-Logout-Duration-Ms', String(summary.hosted_auth_logout_duration_ms));
  } else {
    headers.delete('X-Hosted-Auth-Logout-Duration-Ms');
  }
  return headers;
}

function attachHostedAuthHeaders(response: Response, signal: HostedAuthResponseSignal): Response {
  const headers = appendHostedAuthHeaders(new Headers(response.headers), signal);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function renderHostedAuthDocument(params: {
  nonce: string;
  title: string;
  subtitle: string;
  bodyHtml: string;
  actionsHtml?: string;
  footerHtml?: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
    <style nonce="${escapeHtml(params.nonce)}">${AUTH_PAGE_STYLES}</style>
  </head>
  <body>
    <main class="auth-shell">
      <section class="auth-card">
        <div class="auth-card-inner">
          <header class="auth-header">
            <p class="auth-eyebrow">CourtListener MCP hosted auth</p>
            <h1>${escapeHtml(params.title)}</h1>
            <p class="auth-subtitle">${escapeHtml(params.subtitle)}</p>
          </header>
          <section class="auth-panel">
            <div class="auth-copy">
              ${params.bodyHtml}
            </div>
          </section>
          ${params.actionsHtml ? `<div class="auth-actions">${params.actionsHtml}</div>` : ''}
          ${params.footerHtml ? `<footer class="auth-footer">${params.footerHtml}</footer>` : ''}
        </div>
      </section>
    </main>
  </body>
  </html>`;
}

function renderAuthButtonLink(
  href: string,
  label: string,
  variant: 'primary' | 'secondary' = 'primary',
): string {
  return `<a class="auth-button auth-button-${variant}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderAuthPage(
  title: string,
  lines: string[],
  primaryHref: string | null,
  primaryLabel: string | null,
  nonce: string,
): string {
  const paragraphs = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  const footer =
    primaryHref && primaryLabel
      ? '<p>You can safely restart this sign-in attempt. Existing OAuth requests stay protected until you explicitly approve them.</p>'
      : '<p class="auth-status">This page is informational only until hosted auth is configured and reachable.</p>';
  return renderHostedAuthDocument({
    nonce,
    title,
    subtitle:
      'Secure browser handoff for OAuth approvals, upstream sign-in, and Worker session recovery.',
    bodyHtml: paragraphs,
    actionsHtml: primaryHref && primaryLabel ? renderAuthButtonLink(primaryHref, primaryLabel) : '',
    footerHtml: footer,
  });
}

function renderLogoutPage(params: {
  csrfToken: string;
  returnTo: string | null;
  nonce: string;
}): string {
  return renderHostedAuthDocument({
    nonce: params.nonce,
    title: 'Sign out',
    subtitle:
      'Clear the hosted-auth browser session stored on this Worker before leaving this device or switching identities.',
    bodyHtml: [
      '<p>This signs the browser out of the Worker-hosted auth handoff only.</p>',
      '<p>Your upstream identity provider session may still remain active depending on its own session policy.</p>',
    ].join(''),
    actionsHtml: `
      <div class="auth-form-actions">
        <form class="auth-inline-form" method="post" action="/auth/logout">
          <input type="hidden" name="csrf_token" value="${escapeHtml(params.csrfToken)}" />
          ${params.returnTo ? `<input type="hidden" name="return_to" value="${escapeHtml(params.returnTo)}" />` : ''}
          <button class="auth-button auth-button-danger" type="submit">Sign out</button>
        </form>
        ${renderAuthButtonLink(params.returnTo || '/auth/start', 'Cancel', 'secondary')}
      </div>
    `,
    footerHtml:
      '<p>If you need a different account, sign out here first, then restart the hosted sign-in flow.</p>',
  });
}

function renderAuthApprovalPage(params: {
  clientId: string;
  redirectUriHost: string | null;
  scope: string[];
  csrfToken: string;
  logoutHref: string;
  nonce: string;
}): string {
  const scopeChips = (params.scope.length > 0 ? params.scope : ['default scopes'])
    .map((scope) => `<li class="auth-chip">${escapeHtml(scope)}</li>`)
    .join('');
  const destination = params.redirectUriHost || 'the requesting client';
  return renderHostedAuthDocument({
    nonce: params.nonce,
    title: 'Approve OAuth access',
    subtitle:
      'Review the requesting client and requested scopes before handing the browser session back to the MCP client.',
    bodyHtml: `
      <div class="auth-meta">
        <div class="auth-meta-item">
          <span class="auth-meta-label">Client</span>
          <p class="auth-meta-value"><strong>${escapeHtml(params.clientId || 'unknown')}</strong></p>
        </div>
        <div class="auth-meta-item">
          <span class="auth-meta-label">Redirect</span>
          <p class="auth-meta-value">${escapeHtml(destination)}</p>
        </div>
      </div>
      <section>
        <h2 class="auth-section-title">Requested scopes</h2>
        <ul class="auth-chip-list">${scopeChips}</ul>
      </section>
      <p>Approving returns control to ${escapeHtml(destination)} and completes the current OAuth handoff.</p>
    `,
    actionsHtml: `
      <div class="auth-form-actions">
        <form class="auth-inline-form" method="post" action="/auth/approve">
          <input type="hidden" name="csrf_token" value="${escapeHtml(params.csrfToken)}" />
          <button class="auth-button auth-button-primary" type="submit">Approve and continue</button>
        </form>
        ${renderAuthButtonLink(params.logoutHref, 'Sign out instead', 'secondary')}
      </div>
    `,
    footerHtml:
      '<p>This approval is bound to your current browser session and protected with CSRF checks before OAuth completion.</p>',
  });
}

function resolveAuthStartReturnTarget(
  request: Request,
  rawReturnTo: string | null,
): { value: string; isExplicit: boolean } {
  const trimmed = rawReturnTo?.trim() || '';
  if (!trimmed) {
    return { value: new URL(DEFAULT_AUTH_SUCCESS_PATH, request.url).toString(), isExplicit: false };
  }

  if (trimmed.startsWith('/')) {
    return { value: new URL(trimmed, request.url).toString(), isExplicit: true };
  }

  try {
    const target = new URL(trimmed);
    const requestOrigin = new URL(request.url).origin;
    return {
      value:
        target.origin === requestOrigin
          ? target.toString()
          : new URL(DEFAULT_AUTH_SUCCESS_PATH, request.url).toString(),
      isExplicit: true,
    };
  } catch {
    return { value: new URL(DEFAULT_AUTH_SUCCESS_PATH, request.url).toString(), isExplicit: true };
  }
}

function isDirectOauthReturnTarget(request: Request, returnTo: string): boolean {
  try {
    const target = new URL(returnTo);
    return target.origin === new URL(request.url).origin && target.pathname === '/authorize';
  } catch {
    return false;
  }
}

function buildAuthApprovalUrl(request: Request, returnTo: string): string {
  const approvalUrl = new URL('/auth/approve', request.url);
  approvalUrl.searchParams.set('return_to', returnTo);
  return approvalUrl.toString();
}

function buildAuthStartUrl(
  request: Request,
  returnTo: string | null,
  authError?: string | null,
): string {
  const startUrl = new URL('/auth/start', request.url);
  if (returnTo?.trim()) {
    startUrl.searchParams.set('return_to', returnTo.trim());
  }
  if (authError?.trim()) {
    startUrl.searchParams.set('auth_error', authError.trim());
  }
  return startUrl.toString();
}

function buildAuthContinueUrl(request: Request, returnTo: string | null): string {
  const startUrl = new URL('/auth/start', request.url);
  startUrl.searchParams.set('continue', '1');
  if (returnTo?.trim()) {
    startUrl.searchParams.set('return_to', returnTo.trim());
  }
  return startUrl.toString();
}

function buildLogoutUrl(request: Request, returnTo: string | null): string {
  const logoutUrl = new URL('/auth/logout', request.url);
  if (returnTo?.trim()) {
    logoutUrl.searchParams.set('return_to', returnTo.trim());
  }
  return logoutUrl.toString();
}

function describeAuthError(authError: string): string[] {
  switch (authError) {
    case 'invalid_return_state':
      return [
        'The sign-in response no longer matched the saved auth state for this browser.',
        'Restart the sign-in flow to continue.',
      ];
    case 'callback_failed':
      return [
        'The upstream identity provider returned a response, but the Worker could not finish hosted auth.',
        'Restart the sign-in flow to try again.',
      ];
    case 'upstream_discovery_failed':
      return [
        'The Worker could not load upstream identity metadata for hosted auth.',
        'Check OIDC issuer reachability and configuration, then retry.',
      ];
    case 'upstream_discovery_timeout':
      return [
        'The Worker timed out while contacting the upstream identity provider.',
        'Retry once the upstream provider is reachable again.',
      ];
    case 'upstream_token_timeout':
      return [
        'The Worker timed out while exchanging the upstream authorization code.',
        'Retry once the upstream identity provider is reachable again.',
      ];
    case 'upstream_token_failed':
      return [
        'The Worker reached the upstream identity provider, but token exchange failed.',
        'Check upstream token endpoint health, client credentials, and callback configuration, then retry.',
      ];
    default:
      return ['Hosted auth could not continue.', 'Restart the sign-in flow to try again.'];
  }
}

function extractSetCookieValue(setCookieHeader: string | null, name: string): string | null {
  if (!setCookieHeader) return null;
  const prefix = `${name}=`;
  const firstPart = setCookieHeader.split(';', 1)[0];
  if (!firstPart) return null;
  return firstPart.startsWith(prefix) ? firstPart.slice(prefix.length) : null;
}

function emitHostedAuthEvent<TEnv extends WorkerUiSessionRuntimeEnv & WorkerHostedAuthEnv>(
  env: TEnv,
  request: Request,
  event: string,
  metadata: Record<string, unknown>,
  signal?: HostedAuthResponseSignal,
): void {
  emitOAuthDiagnostic(env as TEnv & { MCP_OAUTH_DIAGNOSTICS?: string }, event, {
    ...summarizeHostedAuthRequest(request),
    ...(signal ? summarizeHostedAuthSignal(signal) : {}),
    ...metadata,
  });
}

async function buildApprovalPageResponse<
  TEnv extends WorkerUiSessionRuntimeEnv & WorkerHostedAuthEnv,
>(
  request: Request,
  env: TEnv,
  sessionSecret: string,
  returnTo: string,
  correlationId: string,
  deps: HandleWorkerAuthHandoffRoutesDeps<TEnv>,
): Promise<Response> {
  const oauthHelpers = deps.getOAuthHelpers(env);
  const authRequest = await oauthHelpers.parseAuthRequest(new Request(returnTo));
  const secure = getSecureCookieSetting(request, env, deps);

  const approvalCookie = await encodeAuthApprovalCookie(
    {
      returnTo,
      correlationId,
      exp: Math.floor(Date.now() / 1000) + AUTH_APPROVAL_TTL_SECONDS,
    },
    sessionSecret,
    secure,
  );
  const csrfCookieHeader = deps.workerUiSessionRuntime.getOrCreateCsrfCookieHeader(request, env);
  const csrfToken =
    getCookieValue(request, CSRF_COOKIE_NAME) ||
    extractSetCookieValue(csrfCookieHeader, CSRF_COOKIE_NAME);
  if (!csrfToken) {
    throw new Error('Unable to initialize CSRF protection.');
  }

  const returnToUrl = new URL(returnTo);
  const redirectUri = (() => {
    const raw = returnToUrl.searchParams.get('redirect_uri')?.trim();
    if (!raw) return null;
    try {
      return new URL(raw);
    } catch {
      return null;
    }
  })();
  const headers = new Headers();
  headers.append('Set-Cookie', approvalCookie);
  if (csrfCookieHeader) {
    headers.append('Set-Cookie', csrfCookieHeader);
  }
  const nonce = deps.generateCspNonce();

  return deps.htmlResponse(
    renderAuthApprovalPage({
      clientId: returnToUrl.searchParams.get('client_id')?.trim() || '',
      redirectUriHost: redirectUri?.host || null,
      scope: Array.isArray(authRequest.scope) ? authRequest.scope : [],
      csrfToken,
      logoutHref: buildLogoutUrl(request, returnTo),
      nonce,
    }),
    nonce,
    headers,
  );
}

async function completeHostedAuthorization<
  TEnv extends WorkerUiSessionRuntimeEnv & WorkerHostedAuthEnv,
>(
  env: TEnv,
  returnTo: string,
  userId: string,
  deps: HandleWorkerAuthHandoffRoutesDeps<TEnv>,
): Promise<Response> {
  const oauthHelpers = deps.getOAuthHelpers(env);
  const authRequest = await oauthHelpers.parseAuthRequest(new Request(returnTo));
  const completionDetails = deps.buildHostedOAuthCompletionDetails(
    'browser_oauth_complete',
    userId,
  );
  const completion = await oauthHelpers.completeAuthorization({
    request: authRequest,
    userId,
    metadata: completionDetails.metadata,
    scope: deps.resolveGrantedScopes(authRequest),
    props: completionDetails.props,
  });
  return buildRedirectResponse(completion.redirectTo);
}

async function fetchUpstreamOidcDiscovery(
  issuer: string,
): Promise<UpstreamOidcDiscoveryResolution> {
  const now = Date.now();
  const cached = upstreamOidcDiscoveryCache.get(issuer);
  if (cached && cached.expiresAtMs > now) {
    return {
      discovery: cached.value,
      cacheStatus: 'hit',
    };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${issuer.replace(/\/?$/u, '/')}.well-known/openid-configuration`,
      {
        headers: { accept: 'application/json' },
      },
      UPSTREAM_DISCOVERY_TIMEOUT_MS,
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw createHostedAuthUpstreamError(
        'upstream_discovery_timeout',
        'OIDC discovery timed out.',
      );
    }
    throw createHostedAuthUpstreamError('upstream_discovery_failed', 'OIDC discovery failed.');
  }
  if (!response.ok) {
    throw createHostedAuthUpstreamError(
      'upstream_discovery_failed',
      `OIDC discovery failed (${response.status}).`,
    );
  }
  const json = (await response.json()) as Partial<UpstreamOidcDiscovery>;
  if (!json.authorization_endpoint || !json.token_endpoint) {
    throw createHostedAuthUpstreamError(
      'upstream_discovery_failed',
      'OIDC discovery missing authorization or token endpoint.',
    );
  }

  const value = {
    authorization_endpoint: json.authorization_endpoint,
    token_endpoint: json.token_endpoint,
  };
  upstreamOidcDiscoveryCache.set(issuer, { value, expiresAtMs: now + 10 * 60 * 1000 });
  return {
    discovery: value,
    cacheStatus: 'miss',
  };
}

async function exchangeAuthorizationCode(
  discovery: UpstreamOidcDiscovery,
  callbackUrl: string,
  code: string,
  codeVerifier: string,
  cfg: WorkerUpstreamOidcClientConfig,
): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: callbackUrl,
    code,
    code_verifier: codeVerifier,
  });

  let response: Response;
  try {
    response = await fetchWithTimeout(
      discovery.token_endpoint,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      },
      UPSTREAM_TOKEN_TIMEOUT_MS,
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw createHostedAuthUpstreamError(
        'upstream_token_timeout',
        'OIDC token exchange timed out.',
      );
    }
    throw createHostedAuthUpstreamError('upstream_token_failed', 'OIDC token exchange failed.');
  }
  if (!response.ok) {
    throw createHostedAuthUpstreamError(
      'upstream_token_failed',
      `OIDC token exchange failed (${response.status}).`,
    );
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw createHostedAuthUpstreamError(
      'upstream_token_failed',
      'OIDC token exchange did not return an access token.',
    );
  }
  return { accessToken: json.access_token };
}

function buildRedirectResponse(location: string, headers?: Headers): Response {
  const responseHeaders = headers ?? new Headers();
  responseHeaders.set('Location', location);
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('X-Frame-Options', 'DENY');
  responseHeaders.set('Referrer-Policy', 'no-referrer');
  responseHeaders.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  responseHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  responseHeaders.set(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  return new Response(null, { status: 302, headers: responseHeaders });
}

async function resolveHostedAuthCorrelationId<TEnv extends WorkerUiSessionRuntimeEnv>(
  request: Request,
  env: TEnv,
  deps: Pick<HandleWorkerAuthHandoffRoutesDeps<TEnv>, 'workerUiSessionRuntime'>,
  candidates: Array<string | null | undefined> = [],
): Promise<{ correlationId: string | null; setCookieHeader: string | null }> {
  const secret = deps.workerUiSessionRuntime.getUiSessionSecret(env);
  const secure = getSecureCookieSetting(request, env, deps);

  for (const candidate of candidates) {
    const normalized = candidate?.trim() || '';
    if (!normalized || !isSafeCorrelationId(normalized)) continue;
    if (!secret) {
      return { correlationId: normalized, setCookieHeader: null };
    }
    return {
      correlationId: normalized,
      setCookieHeader: await encodeAuthFlowCookie(
        {
          correlationId: normalized,
          exp: Math.floor(Date.now() / 1000) + AUTH_FLOW_TTL_SECONDS,
        },
        secret,
        secure,
      ),
    };
  }

  if (!secret) {
    return { correlationId: null, setCookieHeader: null };
  }

  const persisted = await decodeAuthFlowCookie(request, secret);
  if (persisted?.correlationId) {
    return { correlationId: persisted.correlationId, setCookieHeader: null };
  }

  return { correlationId: null, setCookieHeader: null };
}

export async function handleWorkerAuthHandoffRoutes<
  TEnv extends WorkerUiSessionRuntimeEnv & WorkerHostedAuthEnv,
>(params: HandleWorkerAuthHandoffRoutesParams<TEnv>): Promise<Response | null> {
  const { request, url, env, deps } = params;
  const requestStartedAtMs = Date.now();
  const hostedAuth = resolveWorkerHostedAuthConfig(env);
  const hostedAuthDiagnostics = evaluateWorkerHostedAuthConfig(env);
  const authConfig = hostedAuth?.upstream ?? null;
  const signalBase = {
    pathname: url.pathname,
    credentialSource: authConfig?.credentialSource ?? hostedAuthDiagnostics.credentialSource,
    configErrorCount: hostedAuthDiagnostics.errors.length,
  } as const;
  const requestCorrelation = await resolveHostedAuthCorrelationId(request, env, deps);
  const authRouteRateLimitKey =
    url.pathname === '/auth/start'
      ? 'auth-start'
      : url.pathname === '/auth/callback'
        ? 'auth-callback'
        : url.pathname === '/auth/approve'
          ? 'auth-approve'
          : null;

  if (authRouteRateLimitKey) {
    const rateLimited = await getOAuthFrontdoorRateLimitedResponse(
      request,
      env,
      authRouteRateLimitKey,
      deps,
    );
    if (rateLimited) {
      return rateLimited;
    }
  }

  if (url.pathname === '/auth/logout' && request.method === 'GET') {
    const correlation = requestCorrelation.correlationId
      ? requestCorrelation
      : await resolveHostedAuthCorrelationId(request, env, deps, [createHostedAuthCorrelationId()]);
    const csrfCookieHeader = deps.workerUiSessionRuntime.getOrCreateCsrfCookieHeader(request, env);
    const csrfToken =
      getCookieValue(request, CSRF_COOKIE_NAME) ||
      extractSetCookieValue(csrfCookieHeader, CSRF_COOKIE_NAME);
    if (!csrfToken) {
      const response = deps.jsonError(
        'Unable to initialize CSRF protection.',
        500,
        'csrf_initialization_failed',
      );
      if (correlation.setCookieHeader) {
        response.headers.append('Set-Cookie', correlation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: true,
          status: 'logout_confirmation_required' as const,
          outcome: 'rejected' as const,
          correlationId: correlation.correlationId,
          authError: 'csrf_initialization_failed',
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.logout.reject',
        { reason: 'csrf_initialization_failed' },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    const resolvedReturnTo = resolveAuthStartReturnTarget(
      request,
      url.searchParams.get('return_to'),
    );
    const headers = new Headers();
    if (csrfCookieHeader) {
      headers.append('Set-Cookie', csrfCookieHeader);
    }
    if (correlation.setCookieHeader) {
      headers.append('Set-Cookie', correlation.setCookieHeader);
    }
    const nonce = deps.generateCspNonce();
    const response = deps.htmlResponse(
      renderLogoutPage({
        csrfToken,
        returnTo: resolvedReturnTo.isExplicit ? resolvedReturnTo.value : null,
        nonce,
      }),
      nonce,
      headers,
    );
    const signal = withHostedAuthRequestDuration(
      {
        ...signalBase,
        ready: true,
        status: 'logout_confirmation_required' as const,
        outcome: 'interactive' as const,
        correlationId: correlation.correlationId,
      },
      requestStartedAtMs,
    );
    emitHostedAuthEvent(
      env,
      request,
      'hosted_auth.logout.page',
      {
        return_to: resolvedReturnTo.isExplicit ? resolvedReturnTo.value : null,
      },
      signal,
    );
    return attachHostedAuthHeaders(response, signal);
  }

  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    const secure = getSecureCookieSetting(request, env, deps);
    const correlation = requestCorrelation.correlationId
      ? requestCorrelation
      : await resolveHostedAuthCorrelationId(request, env, deps, [createHostedAuthCorrelationId()]);
    const form = await request.formData();
    const csrfToken =
      typeof form.get('csrf_token') === 'string' ? String(form.get('csrf_token')).trim() : '';
    if (!csrfToken || csrfToken !== (getCookieValue(request, CSRF_COOKIE_NAME) ?? '')) {
      const response = deps.jsonError(
        'CSRF token validation failed.',
        403,
        'csrf_validation_failed',
      );
      if (correlation.setCookieHeader) {
        response.headers.append('Set-Cookie', correlation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: true,
          status: 'logout_confirmation_required' as const,
          outcome: 'rejected' as const,
          correlationId: correlation.correlationId,
          authError: 'csrf_validation_failed',
          logoutDurationMs: getElapsedDurationMs(requestStartedAtMs),
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.logout.reject',
        { reason: 'csrf_validation_failed' },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    const rawReturnTo =
      typeof form.get('return_to') === 'string' ? String(form.get('return_to')) : null;
    const resolvedReturnTo = resolveAuthStartReturnTarget(request, rawReturnTo);
    const headers = new Headers();
    headers.append('Set-Cookie', buildExpiredCookie('clmcp_ui', secure, 'Lax'));
    headers.append('Set-Cookie', buildExpiredCookie('clmcp_ui_present', secure, 'Lax'));
    headers.append('Set-Cookie', buildExpiredCookie(AUTH_STATE_COOKIE_NAME, secure, 'Lax'));
    headers.append('Set-Cookie', buildExpiredCookie(AUTH_APPROVAL_COOKIE_NAME, secure, 'Strict'));
    headers.append('Set-Cookie', buildExpiredCookie(AUTH_FLOW_COOKIE_NAME, secure, 'Lax'));
    headers.append('Set-Cookie', buildExpiredCookie(CSRF_COOKIE_NAME, secure, 'Lax'));
    const response = buildRedirectResponse(
      buildAuthStartUrl(request, resolvedReturnTo.isExplicit ? resolvedReturnTo.value : null),
      headers,
    );
    const signal = withHostedAuthRequestDuration(
      {
        ...signalBase,
        ready: true,
        status: 'logged_out' as const,
        outcome: 'completed' as const,
        correlationId: correlation.correlationId,
        logoutDurationMs: getElapsedDurationMs(requestStartedAtMs),
      },
      requestStartedAtMs,
    );
    emitHostedAuthEvent(
      env,
      request,
      'hosted_auth.logout.completed',
      {
        return_to: resolvedReturnTo.isExplicit ? resolvedReturnTo.value : null,
      },
      signal,
    );
    return attachHostedAuthHeaders(response, signal);
  }

  if (url.pathname === '/auth/start' && request.method === 'GET') {
    if (!hostedAuth || !authConfig) {
      const nonce = deps.generateCspNonce();
      const response = deps.htmlResponse(
        renderAuthPage(
          'Hosted auth is not configured',
          getHostedAuthSetupMessages(hostedAuthDiagnostics),
          null,
          null,
          nonce,
        ),
        nonce,
      );
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: 'config_missing' as const,
          outcome: 'unavailable' as const,
          correlationId: requestCorrelation.correlationId,
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.start.config_missing',
        {
          ...summarizeHostedAuthReadiness(hostedAuthDiagnostics),
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    const resolvedReturnTo = resolveAuthStartReturnTarget(
      request,
      url.searchParams.get('return_to'),
    );
    const authError = url.searchParams.get('auth_error')?.trim() || '';
    if (authError) {
      const nonce = deps.generateCspNonce();
      const response = deps.htmlResponse(
        renderAuthPage(
          'Hosted auth needs attention',
          describeAuthError(authError),
          buildAuthContinueUrl(
            request,
            resolvedReturnTo.isExplicit ? resolvedReturnTo.value : null,
          ),
          'Restart sign in',
          nonce,
        ),
        nonce,
      );
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: authError as HostedAuthStatus,
          outcome: 'unavailable' as const,
          correlationId: requestCorrelation.correlationId,
          authError,
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.start.error_page',
        {
          auth_error: authError,
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    const sessionState = await deps.workerUiSessionRuntime.resolveUiSession(request, env);
    if (sessionState.kind === 'authenticated') {
      const correlation = await resolveHostedAuthCorrelationId(request, env, deps, [
        createHostedAuthCorrelationId(),
      ]);
      if (isDirectOauthReturnTarget(request, resolvedReturnTo.value)) {
        const headers = new Headers();
        if (correlation.setCookieHeader) {
          headers.append('Set-Cookie', correlation.setCookieHeader);
        }
        const response = buildRedirectResponse(
          buildAuthApprovalUrl(request, resolvedReturnTo.value),
          headers,
        );
        const signal = withHostedAuthRequestDuration(
          {
            ...signalBase,
            ready: true,
            status: 'ready' as const,
            outcome: 'redirect' as const,
            correlationId: correlation.correlationId,
          },
          requestStartedAtMs,
        );
        emitHostedAuthEvent(
          env,
          request,
          'hosted_auth.start.redirect_approval',
          {
            return_to: resolvedReturnTo.value,
          },
          signal,
        );
        return attachHostedAuthHeaders(response, signal);
      }
      const headers = new Headers();
      if (correlation.setCookieHeader) {
        headers.append('Set-Cookie', correlation.setCookieHeader);
      }
      const response = buildRedirectResponse(resolvedReturnTo.value, headers);
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: true,
          status: 'ready' as const,
          outcome: 'redirect' as const,
          correlationId: correlation.correlationId,
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.start.redirect_session',
        {
          return_to: resolvedReturnTo.value,
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    const continueFlow = url.searchParams.get('continue') === '1' || resolvedReturnTo.isExplicit;
    if (!continueFlow) {
      const nonce = deps.generateCspNonce();
      const response = deps.htmlResponse(
        renderAuthPage(
          'Sign in to continue',
          [
            'This hosted Worker can complete OAuth for remote MCP clients and browser sessions on the same origin.',
            'Use the sign-in link below to continue with the configured upstream identity provider.',
          ],
          buildAuthContinueUrl(request, null),
          'Continue to sign in',
          nonce,
        ),
        nonce,
      );
      return attachHostedAuthHeaders(
        response,
        withHostedAuthRequestDuration(
          {
            ...signalBase,
            ready: true,
            status: 'interactive_continue_required',
            outcome: 'interactive',
            correlationId: requestCorrelation.correlationId,
          },
          requestStartedAtMs,
        ),
      );
    }

    const correlationId = createHostedAuthCorrelationId();
    const discoveryStartedAtMs = Date.now();
    try {
      const discoveryResult = await fetchUpstreamOidcDiscovery(authConfig.issuer);
      const upstreamDiscoveryDurationMs = getElapsedDurationMs(discoveryStartedAtMs);
      const discovery = discoveryResult.discovery;
      const callbackUrl = new URL('/auth/callback', request.url).toString();
      const state = createRandomToken(18);
      const codeVerifier = createRandomToken(32);
      const authStateCookie = await encodeAuthStateCookie(
        {
          state,
          returnTo: resolvedReturnTo.value,
          codeVerifier,
          correlationId,
          exp: Math.floor(Date.now() / 1000) + AUTH_STATE_TTL_SECONDS,
        },
        hostedAuth.sessionSecret,
        getSecureCookieSetting(request, env, deps),
      );
      const authorizationUrl = new URL(discovery.authorization_endpoint);
      authorizationUrl.searchParams.set('client_id', authConfig.clientId);
      authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
      authorizationUrl.searchParams.set('response_type', 'code');
      authorizationUrl.searchParams.set('scope', authConfig.scopes.join(' '));
      authorizationUrl.searchParams.set('state', state);
      authorizationUrl.searchParams.set('code_challenge_method', 'S256');
      authorizationUrl.searchParams.set('code_challenge', await sha256Base64Url(codeVerifier));
      if (authConfig.audience) {
        authorizationUrl.searchParams.set('resource', authConfig.audience);
      }

      const headers = new Headers();
      headers.append('Set-Cookie', authStateCookie);
      headers.append(
        'Set-Cookie',
        await encodeAuthFlowCookie(
          {
            correlationId,
            exp: Math.floor(Date.now() / 1000) + AUTH_FLOW_TTL_SECONDS,
          },
          hostedAuth.sessionSecret,
          getSecureCookieSetting(request, env, deps),
        ),
      );
      const response = buildRedirectResponse(authorizationUrl.toString(), headers);
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: true,
          status: 'ready' as const,
          outcome: 'redirect' as const,
          correlationId,
          upstreamDiscoveryDurationMs,
          upstreamDiscoveryCacheStatus: discoveryResult.cacheStatus,
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.start.redirect_upstream',
        {
          upstream_issuer: authConfig.issuer,
          credential_source: authConfig.credentialSource,
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    } catch (error) {
      const errorCode = classifyHostedAuthErrorCode(error);
      const nonce = deps.generateCspNonce();
      const response = deps.htmlResponse(
        renderAuthPage(
          'Hosted auth is temporarily unavailable',
          describeAuthError(errorCode),
          buildAuthContinueUrl(
            request,
            resolvedReturnTo.isExplicit ? resolvedReturnTo.value : null,
          ),
          'Retry sign in',
          nonce,
        ),
        nonce,
      );
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: errorCode,
          outcome: 'unavailable' as const,
          correlationId,
          authError: errorCode,
          ...(errorCode.startsWith('upstream_discovery')
            ? { upstreamDiscoveryDurationMs: getElapsedDurationMs(discoveryStartedAtMs) }
            : {}),
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.start.upstream_failed',
        {
          reason: errorCode,
          error_message: error instanceof Error ? error.message : 'unknown_error',
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }
  }

  if (url.pathname === '/auth/callback' && request.method === 'GET') {
    if (!hostedAuth || !authConfig) {
      const detail = hostedAuthDiagnostics.errors[0];
      const response = deps.jsonError(
        detail ? `Hosted auth is not configured. ${detail}` : 'Hosted auth is not configured.',
        503,
        'auth_not_configured',
      );
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: 'config_missing' as const,
          outcome: 'rejected' as const,
          correlationId: requestCorrelation.correlationId,
          authError: 'config_missing',
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.callback.reject',
        {
          reason: 'config_missing',
          ...summarizeHostedAuthReadiness(hostedAuthDiagnostics),
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    const code = url.searchParams.get('code')?.trim() || '';
    const returnedState = url.searchParams.get('state')?.trim() || '';
    const statePayload = await decodeAuthStateCookie(request, hostedAuth.sessionSecret);
    const secure = getSecureCookieSetting(request, env, deps);
    const callbackCorrelation = await resolveHostedAuthCorrelationId(request, env, deps, [
      statePayload?.correlationId,
    ]);
    const clearStateCookie = buildExpiredCookie(AUTH_STATE_COOKIE_NAME, secure, 'Lax');

    if (!code || !statePayload || statePayload.state !== returnedState) {
      const headers = new Headers();
      headers.append('Set-Cookie', clearStateCookie);
      if (callbackCorrelation.setCookieHeader) {
        headers.append('Set-Cookie', callbackCorrelation.setCookieHeader);
      }
      const response = buildRedirectResponse(
        buildAuthStartUrl(request, statePayload?.returnTo ?? null, 'invalid_return_state'),
        headers,
      );
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: 'invalid_return_state' as const,
          outcome: 'rejected' as const,
          correlationId: callbackCorrelation.correlationId,
          authError: 'invalid_return_state',
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.callback.reject',
        {
          reason: 'invalid_return_state',
          return_to: statePayload?.returnTo ?? null,
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    let discoveryStartedAtMs: number | null = null;
    let tokenExchangeStartedAtMs: number | null = null;
    let upstreamDiscoveryCacheStatus: 'hit' | 'miss' | undefined;
    let tokenVerificationDurationMs: number | undefined;
    let jwksFetchDurationMs: number | undefined;
    let sessionCreationDurationMs: number | undefined;
    try {
      discoveryStartedAtMs = Date.now();
      const discoveryResult = await fetchUpstreamOidcDiscovery(authConfig.issuer);
      const discovery = discoveryResult.discovery;
      const upstreamDiscoveryDurationMs = getElapsedDurationMs(discoveryStartedAtMs);
      upstreamDiscoveryCacheStatus = discoveryResult.cacheStatus;
      const callbackUrl = new URL('/auth/callback', request.url).toString();
      tokenExchangeStartedAtMs = Date.now();
      const exchanged = await exchangeAuthorizationCode(
        discovery,
        callbackUrl,
        code,
        statePayload.codeVerifier,
        authConfig,
      );
      const tokenExchangeDurationMs = getElapsedDurationMs(tokenExchangeStartedAtMs);
      const tokenVerificationStartedAtMs = Date.now();
      const verified = await verifyAccessToken(exchanged.accessToken, {
        issuer: authConfig.issuer,
        ...(authConfig.audience ? { audience: authConfig.audience } : {}),
      });
      tokenVerificationDurationMs =
        verified.metadata.verificationDurationMs ||
        getElapsedDurationMs(tokenVerificationStartedAtMs);
      jwksFetchDurationMs = verified.metadata.jwksFetchDurationMs;
      const subject = typeof verified.payload.sub === 'string' ? verified.payload.sub.trim() : '';
      if (!subject) {
        throw new Error('OIDC access token is missing a subject.');
      }

      const sessionCreationStartedAtMs = Date.now();
      const sessionState = await deps.workerUiSessionRuntime.createUiSessionState(
        request,
        env,
        subject,
        hostedAuth.sessionSecret,
      );
      sessionCreationDurationMs = getElapsedDurationMs(sessionCreationStartedAtMs);
      if (!sessionState) {
        throw new Error('Unable to create a valid UI session.');
      }

      if (isDirectOauthReturnTarget(request, statePayload.returnTo)) {
        const headers = new Headers(sessionState.headers);
        headers.append('Set-Cookie', clearStateCookie);
        if (callbackCorrelation.setCookieHeader) {
          headers.append('Set-Cookie', callbackCorrelation.setCookieHeader);
        }
        const response = buildRedirectResponse(
          buildAuthApprovalUrl(request, statePayload.returnTo),
          headers,
        );
        const signal = withHostedAuthRequestDuration(
          {
            ...signalBase,
            ready: true,
            status: 'ready' as const,
            outcome: 'redirect' as const,
            correlationId: callbackCorrelation.correlationId,
            upstreamDiscoveryDurationMs,
            upstreamDiscoveryCacheStatus,
            tokenExchangeDurationMs,
            tokenVerificationDurationMs,
            jwksFetchDurationMs,
            sessionCreationDurationMs,
          },
          requestStartedAtMs,
        );
        emitHostedAuthEvent(
          env,
          request,
          'hosted_auth.callback.session_created',
          {
            approval_required: true,
            return_to: statePayload.returnTo,
          },
          signal,
        );
        return attachHostedAuthHeaders(response, signal);
      }

      const headers = new Headers(sessionState.headers);
      headers.append('Set-Cookie', clearStateCookie);
      if (callbackCorrelation.setCookieHeader) {
        headers.append('Set-Cookie', callbackCorrelation.setCookieHeader);
      }
      const response = buildRedirectResponse(statePayload.returnTo, headers);
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: true,
          status: 'ready' as const,
          outcome: 'redirect' as const,
          correlationId: callbackCorrelation.correlationId,
          upstreamDiscoveryDurationMs,
          upstreamDiscoveryCacheStatus,
          tokenExchangeDurationMs,
          tokenVerificationDurationMs,
          jwksFetchDurationMs,
          sessionCreationDurationMs,
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.callback.session_created',
        {
          approval_required: false,
          return_to: statePayload.returnTo,
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    } catch (error) {
      const authError = classifyHostedAuthErrorCode(error);
      const headers = new Headers();
      headers.append('Set-Cookie', clearStateCookie);
      if (callbackCorrelation.setCookieHeader) {
        headers.append('Set-Cookie', callbackCorrelation.setCookieHeader);
      }
      const response = buildRedirectResponse(
        buildAuthStartUrl(request, statePayload.returnTo, authError),
        headers,
      );
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: authError,
          outcome: 'rejected' as const,
          correlationId: callbackCorrelation.correlationId,
          authError,
          ...(authError.startsWith('upstream_discovery') && discoveryStartedAtMs !== null
            ? {
                upstreamDiscoveryDurationMs: getElapsedDurationMs(discoveryStartedAtMs),
                ...(upstreamDiscoveryCacheStatus ? { upstreamDiscoveryCacheStatus } : {}),
              }
            : {}),
          ...(authError.startsWith('upstream_token') && tokenExchangeStartedAtMs !== null
            ? { tokenExchangeDurationMs: getElapsedDurationMs(tokenExchangeStartedAtMs) }
            : {}),
          ...(typeof tokenVerificationDurationMs === 'number'
            ? { tokenVerificationDurationMs }
            : {}),
          ...(typeof jwksFetchDurationMs === 'number' ? { jwksFetchDurationMs } : {}),
          ...extractVerificationSignalMetadata(error),
          ...(typeof sessionCreationDurationMs === 'number' ? { sessionCreationDurationMs } : {}),
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.callback.failed',
        {
          reason: authError,
          error_message: error instanceof Error ? error.message : 'unknown_error',
          return_to: statePayload.returnTo,
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }
  }

  if (url.pathname === '/auth/approve' && request.method === 'GET') {
    const approveCorrelation = requestCorrelation.correlationId
      ? requestCorrelation
      : await resolveHostedAuthCorrelationId(request, env, deps, [createHostedAuthCorrelationId()]);
    const resolvedReturnTo = resolveAuthStartReturnTarget(
      request,
      url.searchParams.get('return_to'),
    );
    if (!isDirectOauthReturnTarget(request, resolvedReturnTo.value)) {
      const nonce = deps.generateCspNonce();
      const response = deps.htmlResponse(
        renderAuthPage(
          'Approval link is invalid',
          ['Restart the sign-in flow from your MCP client to continue.'],
          buildAuthStartUrl(request, null),
          'Start over',
          nonce,
        ),
        nonce,
      );
      if (approveCorrelation.setCookieHeader) {
        response.headers.append('Set-Cookie', approveCorrelation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: 'invalid_return_target' as const,
          outcome: 'rejected' as const,
          correlationId: approveCorrelation.correlationId,
          authError: 'invalid_return_target',
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.approve.reject',
        { reason: 'invalid_return_target' },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    const sessionState = await deps.workerUiSessionRuntime.resolveUiSession(request, env);
    if (sessionState.kind !== 'authenticated') {
      const headers = new Headers();
      if (approveCorrelation.setCookieHeader) {
        headers.append('Set-Cookie', approveCorrelation.setCookieHeader);
      }
      const response = buildRedirectResponse(
        buildAuthStartUrl(request, buildAuthApprovalUrl(request, resolvedReturnTo.value)),
        headers,
      );
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: true,
          status: 'ready' as const,
          outcome: 'redirect' as const,
          correlationId: approveCorrelation.correlationId,
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.approve.redirect_start',
        {
          return_to: resolvedReturnTo.value,
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    try {
      if (!hostedAuth?.sessionSecret) {
        throw new Error('Hosted auth approval requires configuration.');
      }
      const response = await buildApprovalPageResponse(
        request,
        env,
        hostedAuth.sessionSecret,
        resolvedReturnTo.value,
        approveCorrelation.correlationId ?? createHostedAuthCorrelationId(),
        deps,
      );
      if (approveCorrelation.setCookieHeader) {
        response.headers.append('Set-Cookie', approveCorrelation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: true,
          status: 'ready' as const,
          outcome: 'interactive' as const,
          correlationId: approveCorrelation.correlationId,
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.approve.page',
        {
          return_to: resolvedReturnTo.value,
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    } catch (error) {
      const nonce = deps.generateCspNonce();
      const response = deps.htmlResponse(
        renderAuthPage(
          'Unable to prepare approval',
          ['Restart the sign-in flow from your MCP client and try again.'],
          buildAuthStartUrl(request, resolvedReturnTo.value),
          'Start over',
          nonce,
        ),
        nonce,
      );
      if (approveCorrelation.setCookieHeader) {
        response.headers.append('Set-Cookie', approveCorrelation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: 'approval_preparation_failed' as const,
          outcome: 'rejected' as const,
          correlationId: approveCorrelation.correlationId,
          authError: 'approval_preparation_failed',
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.approve.reject',
        {
          reason: 'approval_preparation_failed',
          error_message: error instanceof Error ? error.message : 'unknown_error',
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }
  }

  if (url.pathname === '/auth/approve' && request.method === 'POST') {
    const sessionSecret = hostedAuth?.sessionSecret || null;
    const secure = getSecureCookieSetting(request, env, deps);
    const initialApproveCorrelation = requestCorrelation.correlationId
      ? requestCorrelation
      : await resolveHostedAuthCorrelationId(request, env, deps, [createHostedAuthCorrelationId()]);
    const clearApprovalCookie = buildExpiredCookie(AUTH_APPROVAL_COOKIE_NAME, secure, 'Strict');
    if (!sessionSecret) {
      const response = deps.jsonError('Hosted auth is not configured.', 503, 'auth_not_configured');
      response.headers.append('Set-Cookie', clearApprovalCookie);
      if (initialApproveCorrelation.setCookieHeader) {
        response.headers.append('Set-Cookie', initialApproveCorrelation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: 'config_missing' as const,
          outcome: 'rejected' as const,
          correlationId: initialApproveCorrelation.correlationId,
          authError: 'config_missing',
          approvalDurationMs: getElapsedDurationMs(requestStartedAtMs),
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.approve.reject',
        { reason: 'config_missing' },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    const sessionState = await deps.workerUiSessionRuntime.resolveUiSession(request, env);
    if (sessionState.kind !== 'authenticated') {
      const response = deps.jsonError('Session is invalid or missing.', 401, 'invalid_session');
      response.headers.append('Set-Cookie', clearApprovalCookie);
      if (initialApproveCorrelation.setCookieHeader) {
        response.headers.append('Set-Cookie', initialApproveCorrelation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: 'ready' as const,
          outcome: 'rejected' as const,
          correlationId: initialApproveCorrelation.correlationId,
          authError: 'invalid_session',
          approvalDurationMs: getElapsedDurationMs(requestStartedAtMs),
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.approve.reject',
        { reason: 'invalid_session' },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    const approvalState = await decodeAuthApprovalCookie(request, sessionSecret);
    const approvalCorrelation = await resolveHostedAuthCorrelationId(request, env, deps, [
      approvalState?.correlationId,
      initialApproveCorrelation.correlationId,
    ]);
    if (!approvalState || !isDirectOauthReturnTarget(request, approvalState.returnTo)) {
      const response = deps.jsonError(
        'Approval state is invalid or expired.',
        400,
        'invalid_approval_state',
      );
      response.headers.append('Set-Cookie', clearApprovalCookie);
      if (approvalCorrelation.setCookieHeader) {
        response.headers.append('Set-Cookie', approvalCorrelation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: 'invalid_return_target' as const,
          outcome: 'rejected' as const,
          correlationId: approvalCorrelation.correlationId,
          authError: 'invalid_approval_state',
          approvalDurationMs: getElapsedDurationMs(requestStartedAtMs),
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.approve.reject',
        { reason: 'invalid_approval_state' },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    const form = await request.formData();
    const csrfToken =
      typeof form.get('csrf_token') === 'string' ? String(form.get('csrf_token')).trim() : '';
    if (!csrfToken || csrfToken !== (getCookieValue(request, CSRF_COOKIE_NAME) ?? '')) {
      const response = deps.jsonError(
        'CSRF token validation failed.',
        403,
        'csrf_validation_failed',
      );
      response.headers.append('Set-Cookie', clearApprovalCookie);
      if (approvalCorrelation.setCookieHeader) {
        response.headers.append('Set-Cookie', approvalCorrelation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: 'ready' as const,
          outcome: 'rejected' as const,
          correlationId: approvalCorrelation.correlationId,
          authError: 'csrf_validation_failed',
          approvalDurationMs: getElapsedDurationMs(requestStartedAtMs),
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.approve.reject',
        { reason: 'csrf_validation_failed' },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }

    try {
      const approvalStartedAtMs = Date.now();
      const response = await completeHostedAuthorization(
        env,
        approvalState.returnTo,
        sessionState.userId,
        deps,
      );
      response.headers.append('Set-Cookie', clearApprovalCookie);
      if (approvalCorrelation.setCookieHeader) {
        response.headers.append('Set-Cookie', approvalCorrelation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: true,
          status: 'ready' as const,
          outcome: 'completed' as const,
          correlationId: approvalCorrelation.correlationId,
          approvalDurationMs: getElapsedDurationMs(approvalStartedAtMs),
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.approve.completed',
        {
          return_to: approvalState.returnTo,
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    } catch (error) {
      const response = deps.jsonError(
        'OAuth authorization could not be completed.',
        400,
        'authorization_completion_failed',
      );
      response.headers.append('Set-Cookie', clearApprovalCookie);
      if (approvalCorrelation.setCookieHeader) {
        response.headers.append('Set-Cookie', approvalCorrelation.setCookieHeader);
      }
      const signal = withHostedAuthRequestDuration(
        {
          ...signalBase,
          ready: false,
          status: 'ready' as const,
          outcome: 'rejected' as const,
          correlationId: approvalCorrelation.correlationId,
          authError: 'authorization_completion_failed',
          approvalDurationMs: getElapsedDurationMs(requestStartedAtMs),
        },
        requestStartedAtMs,
      );
      emitHostedAuthEvent(
        env,
        request,
        'hosted_auth.approve.reject',
        {
          reason: 'authorization_completion_failed',
          error_message: error instanceof Error ? error.message : 'unknown_error',
        },
        signal,
      );
      return attachHostedAuthHeaders(response, signal);
    }
  }

  return null;
}
