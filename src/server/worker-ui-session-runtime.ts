import { parsePositiveInt } from '../common/validation.js';
import { shouldFailOpenOnAuthLimiterUnavailable } from './worker-durable-runtime.js';
import {
  extractBearerToken,
  parseBoolean,
  trustCloudflareAccessIdentityHeaders,
} from './worker-security.js';
import { verifyAccessToken, type OAuthConfig } from '../security/oidc.js';

export interface UiApiAuthResult {
  userId: string;
  keyId?: string;
  authType: 'api_key' | 'session';
}

interface UiSessionIdentity {
  userId: string;
  email?: string | null;
  displayName?: string | null;
}

interface UiSessionState {
  sessionToken: string;
  expiresInSeconds: number;
  headers: Headers;
}

interface UiSessionPayload {
  sub: string;
  email?: string;
  name?: string;
  exp: number;
  jti: string;
}

interface SessionBootstrapLimiterState {
  blocked?: boolean;
  retryAfterSeconds?: number;
}

type DurableAvailabilityResult<T> = { kind: 'ok'; value: T } | { kind: 'unavailable' };

type UiSessionResolution =
  | { kind: 'authenticated'; userId: string; email?: string | null; displayName?: string | null }
  | { kind: 'invalid' }
  | { kind: 'revocation_unavailable' };

type OAuthIdentityResolution =
  | {
      kind: 'authenticated';
      userId: string;
      email?: string | null;
      displayName?: string | null;
      authSource: 'oidc_bearer' | 'ui_session' | 'cloudflare_access';
    }
  | { kind: 'missing' }
  | { kind: 'session_revocation_unavailable' };

export interface WorkerUiSessionRuntimeEnv {
  MCP_UI_SESSION_SECRET?: string;
  MCP_UI_INSECURE_COOKIES?: string;
  MCP_UI_SESSION_REVOCATION_ENABLED?: string;
  MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS?: string;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  OIDC_JWKS_URL?: string;
  OIDC_REQUIRED_SCOPE?: string;
  MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_MAX?: string;
  MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN?: string;
}

interface WorkerUiSessionRuntimeDeps<TEnv extends WorkerUiSessionRuntimeEnv> {
  jsonError: (
    message: string,
    status: number,
    errorCode: string,
    extra?: Record<string, unknown>,
    extraHeaders?: HeadersInit,
  ) => Response;
  getClientIdentifier: (request: Request) => string;
  isUiSessionRevoked: (
    env: TEnv,
    sessionJti: string,
  ) => Promise<DurableAvailabilityResult<boolean>>;
  recordSessionBootstrapRateLimit: (
    env: TEnv,
    clientId: string,
    nowMs: number,
    config: { maxAttempts: number; windowMs: number; blockMs: number },
  ) => Promise<DurableAvailabilityResult<SessionBootstrapLimiterState | null>>;
  verifyOidcUserIdFromToken?: (
    token: string,
    env: TEnv,
  ) => Promise<{ identity: UiSessionIdentity | null; error: string | null }>;
  verifyOidcUserIdFromAuthorization?: (
    request: Request,
    env: TEnv,
  ) => Promise<{ identity: UiSessionIdentity | null; error: string | null }>;
}

export interface WorkerUiSessionRuntime<TEnv extends WorkerUiSessionRuntimeEnv> {
  getUiSessionSecret(env: TEnv): string | null;
  createUiSessionToken(
    userId: string,
    secret: string,
    ttlSeconds?: number,
    options?: { email?: string | null | undefined; displayName?: string | null | undefined },
  ): Promise<string>;
  parseUiSessionToken(token: string): UiSessionPayload | null;
  resolveUiSession(request: Request, env: TEnv): Promise<UiSessionResolution>;
  resolveUiSessionUserId(request: Request, env: TEnv): Promise<string | null>;
  isSecureCookieRequest(request: Request, env: TEnv): boolean;
  buildUiSessionBootstrapHeaders(request: Request, env: TEnv, sessionToken: string): Headers;
  buildUiSessionLogoutHeaders(request: Request, env: TEnv): Headers;
  createUiSessionState(
    request: Request,
    env: TEnv,
    identity: UiSessionIdentity,
    sessionSecret: string,
  ): Promise<UiSessionState | null>;
  getOrCreateCsrfCookieHeader(request: Request, env: TEnv): string | null;
  requireCsrfToken(request: Request): Response | null;
  authenticateUiApiRequest(request: Request, env: TEnv): Promise<UiApiAuthResult | Response>;
  verifyBootstrapUserIdFromAuthorization(
    request: Request,
    env: TEnv,
  ): Promise<{ identity: UiSessionIdentity | null; error: string | null }>;
  resolveCloudflareOAuthIdentity(request: Request, env: TEnv): Promise<OAuthIdentityResolution>;
  resolveCloudflareOAuthUserId(request: Request, env: TEnv): Promise<string | null>;
  getSessionBootstrapRateLimitedResponse(
    request: Request,
    env: TEnv,
    nowMs: number,
  ): Promise<Response | null>;
}

const UI_SESSION_COOKIE_NAME = 'clmcp_ui';
const UI_SESSION_PRESENT_COOKIE_NAME = 'clmcp_ui_present';
const CSRF_COOKIE_NAME = 'clmcp_csrf';
const UI_SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_UI_SESSION_BOOTSTRAP_RATE_LIMIT_MAX = 20;
const DEFAULT_UI_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_UI_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS = 300;

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

function getUiSessionSecret<TEnv extends WorkerUiSessionRuntimeEnv>(env: TEnv): string | null {
  const explicitSecret = env.MCP_UI_SESSION_SECRET?.trim() || '';
  return explicitSecret || null;
}

function getWorkerOidcConfig<TEnv extends WorkerUiSessionRuntimeEnv>(
  env: TEnv,
): OAuthConfig | null {
  const issuer = env.OIDC_ISSUER?.trim();
  if (!issuer) return null;
  return {
    issuer,
    ...(env.OIDC_AUDIENCE?.trim() ? { audience: env.OIDC_AUDIENCE.trim() } : {}),
    ...(env.OIDC_JWKS_URL?.trim() ? { jwksUrl: env.OIDC_JWKS_URL.trim() } : {}),
    ...(env.OIDC_REQUIRED_SCOPE?.trim() ? { requiredScope: env.OIDC_REQUIRED_SCOPE.trim() } : {}),
  };
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

function generateRandomToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return base64UrlEncode(binary);
}

function isSecureCookieRequest<TEnv extends WorkerUiSessionRuntimeEnv>(
  request: Request,
  env: TEnv,
): boolean {
  if (parseBoolean(env.MCP_UI_INSECURE_COOKIES)) {
    return false;
  }
  return new URL(request.url).protocol === 'https:';
}

function buildUiSessionCookie(token: string, secure: boolean): string {
  return `${UI_SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=43200`;
}

function buildUiSessionIndicatorCookie(secure: boolean): string {
  return `${UI_SESSION_PRESENT_COOKIE_NAME}=1; Path=/;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=43200`;
}

function buildExpiredCookie(name: string, secure: boolean): string {
  return `${name}=; Path=/;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=0`;
}

function getCsrfTokenFromCookie(request: Request): string | null {
  const token = getCookieValue(request, CSRF_COOKIE_NAME)?.trim();
  return token || null;
}

function buildCsrfCookie(token: string, secure: boolean): string {
  return `${CSRF_COOKIE_NAME}=${token}; Path=/;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=43200`;
}

async function createUiSessionToken(
  userId: string,
  secret: string,
  ttlSeconds: number,
  options?: { email?: string | null | undefined; displayName?: string | null | undefined },
): Promise<string> {
  const payloadObj: UiSessionPayload = {
    sub: userId,
    ...(options?.email?.trim() ? { email: options.email.trim() } : {}),
    ...(options?.displayName?.trim() ? { name: options.displayName.trim() } : {}),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    jti: generateRandomToken(24),
  };
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const signature = await signSessionPayload(payload, secret);
  return `${payload}.${signature}`;
}

async function getUiSessionUserId<TEnv extends WorkerUiSessionRuntimeEnv>(
  request: Request,
  secret: string,
  env: TEnv,
  deps: WorkerUiSessionRuntimeDeps<TEnv>,
): Promise<UiSessionResolution> {
  const token = getCookieValue(request, UI_SESSION_COOKIE_NAME);
  if (!token) return { kind: 'invalid' };
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) return { kind: 'invalid' };
  const expectedSignature = await signSessionPayload(payloadPart, secret);
  if (!constantTimeEqual(expectedSignature, signaturePart)) return { kind: 'invalid' };
  const payload = parseUiSessionToken(token);
  if (!payload) return { kind: 'invalid' };
  const revocationState = await deps.isUiSessionRevoked(env, payload.jti);
  if (revocationState.kind === 'unavailable') {
    return { kind: 'revocation_unavailable' };
  }
  if (revocationState.value) {
    return { kind: 'invalid' };
  }
  return {
    kind: 'authenticated',
    userId: payload.sub,
    email: payload.email ?? null,
    displayName: payload.name ?? null,
  };
}

async function verifyOidcUserIdFromAuthorization<TEnv extends WorkerUiSessionRuntimeEnv>(
  request: Request,
  env: TEnv,
): Promise<{ identity: UiSessionIdentity | null; error: string | null }> {
  return verifyOidcUserId(
    extractBearerToken(request.headers.get('authorization')),
    env,
    'Missing bearer token.',
  );
}

async function verifyOidcUserId<TEnv extends WorkerUiSessionRuntimeEnv>(
  bearerToken: string | null,
  env: TEnv,
  missingTokenError: string,
): Promise<{ identity: UiSessionIdentity | null; error: string | null }> {
  if (!bearerToken) {
    return { identity: null, error: missingTokenError };
  }
  const oidcConfig = getWorkerOidcConfig(env);
  if (!oidcConfig) {
    return { identity: null, error: 'OIDC issuer is not configured.' };
  }
  try {
    const verified = await verifyAccessToken(bearerToken, oidcConfig);
    const subject = verified.payload.sub;
    if (typeof subject === 'string' && subject.trim().length > 0) {
      const email =
        typeof verified.payload.email === 'string' && verified.payload.email.trim().length > 0
          ? verified.payload.email.trim()
          : null;
      const displayName =
        typeof verified.payload.name === 'string' && verified.payload.name.trim().length > 0
          ? verified.payload.name.trim()
          : typeof verified.payload.preferred_username === 'string' &&
              verified.payload.preferred_username.trim().length > 0
            ? verified.payload.preferred_username.trim()
            : email;
      return {
        identity: { userId: subject.trim(), email, displayName },
        error: null,
      };
    }
    return { identity: null, error: 'Verified token missing subject claim.' };
  } catch (error) {
    return {
      identity: null,
      error: error instanceof Error ? error.message : 'OIDC verification failed.',
    };
  }
}

async function verifyOidcUserIdFromToken<TEnv extends WorkerUiSessionRuntimeEnv>(
  bearerToken: string,
  env: TEnv,
): Promise<{ identity: UiSessionIdentity | null; error: string | null }> {
  return verifyOidcUserId(bearerToken, env, 'Missing bearer token.');
}

async function deriveCloudflareIdentityUserId<TEnv extends WorkerUiSessionRuntimeEnv>(
  request: Request,
  env: TEnv,
): Promise<string | null> {
  if (!trustCloudflareAccessIdentityHeaders(env)) return null;
  const rawIdentity =
    request.headers.get('cf-access-authenticated-user-id')?.trim() ||
    request.headers.get('cf-access-authenticated-user-email')?.trim();
  if (!rawIdentity) return null;

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawIdentity));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `cf_${base64UrlEncode(binary)}`;
}

function getSessionBootstrapRateLimitConfig<TEnv extends WorkerUiSessionRuntimeEnv>(
  env: TEnv,
): {
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
} {
  return {
    maxAttempts: parsePositiveInt(
      env.MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_MAX,
      DEFAULT_UI_SESSION_BOOTSTRAP_RATE_LIMIT_MAX,
    ),
    windowMs:
      parsePositiveInt(
        env.MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS,
        DEFAULT_UI_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS,
      ) * 1000,
    blockMs:
      parsePositiveInt(
        env.MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS,
        DEFAULT_UI_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS,
      ) * 1000,
  };
}

async function verifyBootstrapBearerToken<TEnv extends WorkerUiSessionRuntimeEnv>(
  bearerToken: string | null,
  env: TEnv,
  deps: WorkerUiSessionRuntimeDeps<TEnv>,
): Promise<{ identity: UiSessionIdentity | null; error: string | null }> {
  if (!bearerToken) {
    return { identity: null, error: 'Missing bootstrap bearer token.' };
  }

  if (bearerToken.split('.').length !== 3) {
    return { identity: null, error: 'Malformed OIDC bearer token.' };
  }

  if (!env.OIDC_AUDIENCE?.trim()) {
    return { identity: null, error: 'OIDC audience is not configured.' };
  }

  const verifyOidc = deps.verifyOidcUserIdFromToken ?? verifyOidcUserIdFromToken;
  return verifyOidc(bearerToken, env);
}

export function createWorkerUiSessionRuntime<TEnv extends WorkerUiSessionRuntimeEnv>(
  deps: WorkerUiSessionRuntimeDeps<TEnv>,
): WorkerUiSessionRuntime<TEnv> {
  return {
    getUiSessionSecret(env: TEnv): string | null {
      return getUiSessionSecret(env);
    },

    async createUiSessionToken(
      userId: string,
      secret: string,
      ttlSeconds = UI_SESSION_TTL_SECONDS,
      options?: { email?: string | null | undefined; displayName?: string | null | undefined },
    ): Promise<string> {
      return createUiSessionToken(userId, secret, ttlSeconds, options);
    },

    parseUiSessionToken(token: string): UiSessionPayload | null {
      return parseUiSessionToken(token);
    },

    async resolveUiSession(request: Request, env: TEnv): Promise<UiSessionResolution> {
      const sessionSecret = getUiSessionSecret(env);
      if (!sessionSecret) {
        return { kind: 'invalid' };
      }
      return getUiSessionUserId(request, sessionSecret, env, deps);
    },

    async resolveUiSessionUserId(request: Request, env: TEnv): Promise<string | null> {
      const sessionState = await this.resolveUiSession(request, env);
      return sessionState.kind === 'authenticated' ? sessionState.userId : null;
    },

    isSecureCookieRequest(request: Request, env: TEnv): boolean {
      return isSecureCookieRequest(request, env);
    },

    buildUiSessionBootstrapHeaders(request: Request, env: TEnv, sessionToken: string): Headers {
      const secureCookies = isSecureCookieRequest(request, env);
      const headers = new Headers();
      headers.append('Set-Cookie', buildUiSessionCookie(sessionToken, secureCookies));
      headers.append('Set-Cookie', buildUiSessionIndicatorCookie(secureCookies));
      headers.set('Cache-Control', 'no-store');
      return headers;
    },

    buildUiSessionLogoutHeaders(request: Request, env: TEnv): Headers {
      const secureCookies = isSecureCookieRequest(request, env);
      const headers = new Headers();
      headers.append('Set-Cookie', buildExpiredCookie(UI_SESSION_COOKIE_NAME, secureCookies));
      headers.append(
        'Set-Cookie',
        buildExpiredCookie(UI_SESSION_PRESENT_COOKIE_NAME, secureCookies),
      );
      headers.append('Set-Cookie', buildExpiredCookie(CSRF_COOKIE_NAME, secureCookies));
      headers.set('Cache-Control', 'no-store');
      return headers;
    },

    async createUiSessionState(
      request: Request,
      env: TEnv,
      identity: UiSessionIdentity,
      sessionSecret: string,
    ): Promise<UiSessionState | null> {
      const expiresInSeconds = UI_SESSION_TTL_SECONDS;
      const sessionToken = await createUiSessionToken(
        identity.userId,
        sessionSecret,
        expiresInSeconds,
        {
          email: identity.email,
          displayName: identity.displayName,
        },
      );
      const parsedSession = parseUiSessionToken(sessionToken);
      if (!parsedSession) {
        return null;
      }
      return {
        sessionToken,
        expiresInSeconds,
        headers: this.buildUiSessionBootstrapHeaders(request, env, sessionToken),
      };
    },

    getOrCreateCsrfCookieHeader(request: Request, env: TEnv): string | null {
      const existing = getCsrfTokenFromCookie(request);
      if (existing) return null;
      return buildCsrfCookie(generateRandomToken(24), isSecureCookieRequest(request, env));
    },

    requireCsrfToken(request: Request): Response | null {
      const cookieToken = getCsrfTokenFromCookie(request);
      const headerToken = request.headers.get('x-csrf-token')?.trim() || '';
      if (!cookieToken || !headerToken || !constantTimeEqual(headerToken, cookieToken)) {
        return deps.jsonError('CSRF token validation failed.', 403, 'csrf_validation_failed');
      }
      return null;
    },

    async authenticateUiApiRequest(
      request: Request,
      env: TEnv,
    ): Promise<UiApiAuthResult | Response> {
      const sessionSecret = getUiSessionSecret(env);
      if (!sessionSecret) {
        return deps.jsonError(
          'Session signing secret is not configured.',
          503,
          'session_secret_missing',
        );
      }

      const sessionState = await getUiSessionUserId(request, sessionSecret, env, deps);
      if (sessionState.kind === 'revocation_unavailable') {
        return deps.jsonError(
          'Unable to validate session revocation.',
          503,
          'session_revocation_unavailable',
        );
      }
      if (sessionState.kind !== 'authenticated') {
        return deps.jsonError('Session is invalid or missing.', 401, 'invalid_session');
      }
      return { userId: sessionState.userId, authType: 'session' };
    },

    async verifyBootstrapUserIdFromAuthorization(
      request: Request,
      env: TEnv,
    ): Promise<{ identity: UiSessionIdentity | null; error: string | null }> {
      const bearerToken = extractBearerToken(request.headers.get('authorization'));
      return verifyBootstrapBearerToken(bearerToken, env, deps);
    },

    async resolveCloudflareOAuthUserId(request: Request, env: TEnv): Promise<string | null> {
      const identity = await this.resolveCloudflareOAuthIdentity(request, env);
      return identity.kind === 'authenticated' ? identity.userId : null;
    },

    async resolveCloudflareOAuthIdentity(
      request: Request,
      env: TEnv,
    ): Promise<OAuthIdentityResolution> {
      const sessionSecret = getUiSessionSecret(env);

      // Verification precedence matters here because the OAuth authorize endpoint accepts
      // both explicit bearer credentials and browser/session-based identities.
      const identityResolvers: Array<() => Promise<OAuthIdentityResolution | null>> = [
        async () => {
          const verifyOidcFromAuthorization =
            deps.verifyOidcUserIdFromAuthorization ?? verifyOidcUserIdFromAuthorization;
          const verifiedOidc = await verifyOidcFromAuthorization(request, env);
          return verifiedOidc.identity
            ? ({
                kind: 'authenticated',
                userId: verifiedOidc.identity.userId,
                email: verifiedOidc.identity.email ?? null,
                displayName: verifiedOidc.identity.displayName ?? null,
                authSource: 'oidc_bearer',
              } satisfies OAuthIdentityResolution)
            : ({ kind: 'missing' } satisfies OAuthIdentityResolution);
        },
        async () => {
          if (!sessionSecret) return null;
          const sessionState = await getUiSessionUserId(request, sessionSecret, env, deps);
          if (sessionState.kind === 'revocation_unavailable') {
            return { kind: 'session_revocation_unavailable' } satisfies OAuthIdentityResolution;
          }
          return sessionState.kind === 'authenticated'
            ? ({
                kind: 'authenticated',
                userId: sessionState.userId,
                email: sessionState.email ?? null,
                displayName: sessionState.displayName ?? null,
                authSource: 'ui_session',
              } satisfies OAuthIdentityResolution)
            : ({ kind: 'missing' } satisfies OAuthIdentityResolution);
        },
        async () => {
          const userId = await deriveCloudflareIdentityUserId(request, env);
          return userId
            ? ({
                kind: 'authenticated',
                userId,
                authSource: 'cloudflare_access',
              } satisfies OAuthIdentityResolution)
            : ({ kind: 'missing' } satisfies OAuthIdentityResolution);
        },
      ];

      for (const resolveIdentity of identityResolvers) {
        const identity = await resolveIdentity();
        if (!identity || identity.kind === 'missing') continue;
        return identity;
      }

      return { kind: 'missing' };
    },

    async getSessionBootstrapRateLimitedResponse(
      request: Request,
      env: TEnv,
      nowMs: number,
    ): Promise<Response | null> {
      const cfg = getSessionBootstrapRateLimitConfig(env);
      const clientId = deps.getClientIdentifier(request);
      const limiterState = await deps.recordSessionBootstrapRateLimit(env, clientId, nowMs, cfg);
      if (limiterState.kind === 'unavailable') {
        if (shouldFailOpenOnAuthLimiterUnavailable(env)) {
          console.error(
            JSON.stringify({
              event: 'auth_limiter_fail_open',
              surface: 'session_bootstrap',
              client_id: clientId,
            }),
          );
          return null;
        }
        return deps.jsonError(
          'Unable to validate session bootstrap rate limit.',
          503,
          'session_bootstrap_rate_limit_unavailable',
        );
      }
      if (!limiterState.value?.blocked) return null;
      const retryAfterSeconds =
        limiterState.value.retryAfterSeconds ?? Math.ceil(cfg.blockMs / 1000);
      return deps.jsonError(
        'Too many session bootstrap attempts.',
        429,
        'session_bootstrap_rate_limited',
        { retry_after_seconds: retryAfterSeconds },
        { 'Retry-After': String(retryAfterSeconds) },
      );
    },
  };
}
