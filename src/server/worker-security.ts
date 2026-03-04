import type { OAuthConfig } from '../security/oidc.js';
import { verifyAccessToken } from '../security/oidc.js';
import { getSupabaseConfig, validateSupabaseApiKey } from './supabase-auth.js';
import type { PrincipalContext } from '../infrastructure/principal-context.js';

export interface WorkerSecurityEnv {
  MCP_AUTH_TOKEN?: string;
  MCP_AUTH_PRIMARY?: string;
  MCP_ALLOW_STATIC_FALLBACK?: string;
  MCP_REQUIRE_PROTOCOL_VERSION?: string;
  MCP_ALLOWED_ORIGINS?: string;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  OIDC_JWKS_URL?: string;
  OIDC_REQUIRED_SCOPE?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_API_KEYS_TABLE?: string;
}

export interface WorkerSecurityDeps {
  verifyAccessTokenFn?: (
    token: string,
    cfg: OAuthConfig,
  ) => Promise<{ payload: Record<string, unknown> }>;
  verifySupabaseApiKeyFn?: (
    token: string,
    env: WorkerSecurityEnv,
  ) => Promise<boolean | { valid: boolean; userId?: string }>;
}

export type AuthMethod = 'supabase' | 'oidc' | 'static';
export type McpRequestPrincipal = PrincipalContext;

export interface McpAuthorizationResult {
  authError: Response | null;
  principal?: McpRequestPrincipal;
}

export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function isAllowedOrigin(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
}

function getOidcConfig(env: WorkerSecurityEnv): OAuthConfig | null {
  if (!env.OIDC_ISSUER) return null;
  return {
    issuer: env.OIDC_ISSUER,
    ...(env.OIDC_AUDIENCE !== undefined && { audience: env.OIDC_AUDIENCE }),
    ...(env.OIDC_JWKS_URL !== undefined && { jwksUrl: env.OIDC_JWKS_URL }),
    ...(env.OIDC_REQUIRED_SCOPE !== undefined && { requiredScope: env.OIDC_REQUIRED_SCOPE }),
  };
}

function getConfiguredAuthMethods(
  oidcConfig: OAuthConfig | null,
  supabaseConfigured: boolean,
  staticTokenConfigured: boolean,
): Set<AuthMethod> {
  const methods = new Set<AuthMethod>();
  if (oidcConfig) methods.add('oidc');
  if (supabaseConfigured) methods.add('supabase');
  if (staticTokenConfigured) methods.add('static');
  return methods;
}

function getPreferredAuthMethod(env: WorkerSecurityEnv, configuredMethods: Set<AuthMethod>): AuthMethod | null {
  const preferred = env.MCP_AUTH_PRIMARY?.trim().toLowerCase();
  if (preferred === 'supabase' || preferred === 'oidc' || preferred === 'static') {
    if (configuredMethods.has(preferred)) {
      return preferred;
    }
  }

  if (configuredMethods.has('supabase')) return 'supabase';
  if (configuredMethods.has('oidc')) return 'oidc';
  if (configuredMethods.has('static')) return 'static';
  return null;
}

function jsonError(status: number, message: string, code: string): Response {
  return Response.json({ error: code, message }, { status });
}

function extractUserIdFromClaims(payload: Record<string, unknown>): string | undefined {
  const subject = payload.sub;
  return typeof subject === 'string' && subject.trim().length > 0 ? subject : undefined;
}

/**
 * Authorize MCP requests using either:
 * 1) OIDC/Cloudflare Access JWT verification (if OIDC_* configured)
 * 2) Supabase-backed API key validation (if SUPABASE_* configured)
 * 3) Static bearer token (MCP_AUTH_TOKEN)
 *
 * If multiple mechanisms are configured, the primary backend is selected by:
 * MCP_AUTH_PRIMARY (default: supabase when configured), with static fallback
 * only when MCP_ALLOW_STATIC_FALLBACK is true.
 */
export async function authorizeMcpRequestWithPrincipal(
  request: Request,
  env: WorkerSecurityEnv,
  deps: WorkerSecurityDeps = {},
): Promise<McpAuthorizationResult> {
  const bearerToken = extractBearerToken(request.headers.get('Authorization'));
  const cfAccessJwt = request.headers.get('CF-Access-Jwt-Assertion')?.trim() || null;
  const staticToken = env.MCP_AUTH_TOKEN?.trim();
  const oidcConfig = getOidcConfig(env);
  const supabaseConfig = getSupabaseConfig(env);
  const staticTokenConfigured = Boolean(staticToken);
  const supabaseConfigured = Boolean(supabaseConfig);
  const configuredMethods = getConfiguredAuthMethods(
    oidcConfig,
    supabaseConfigured,
    staticTokenConfigured,
  );
  const preferredAuthMethod = getPreferredAuthMethod(env, configuredMethods);
  const allowStaticFallback = parseBoolean(env.MCP_ALLOW_STATIC_FALLBACK);

  const verifyFn = deps.verifyAccessTokenFn ?? verifyAccessToken;
  const verifySupabaseFn =
    deps.verifySupabaseApiKeyFn ??
    (async (token: string): Promise<{ valid: boolean; userId?: string }> => {
      if (!supabaseConfig) return { valid: false };
      const result = await validateSupabaseApiKey(token, supabaseConfig);
      return result;
    });

  if (configuredMethods.size === 0) {
    return { authError: null };
  }

  const shouldTryOidc = preferredAuthMethod === 'oidc';
  const shouldTrySupabase = preferredAuthMethod === 'supabase';
  const shouldTryStatic =
    preferredAuthMethod === 'static' ||
    (staticTokenConfigured && allowStaticFallback);

  if (oidcConfig && shouldTryOidc) {
    let hasJwtCandidate = false;
    let lastError: unknown;
    if (bearerToken) {
      hasJwtCandidate = true;
      try {
        const verified = await verifyFn(bearerToken, oidcConfig);
        const userId = extractUserIdFromClaims(verified.payload);
        return {
          authError: null,
          principal: {
            authMethod: 'oidc',
            ...(userId ? { userId } : {}),
          },
        };
      } catch (error) {
        lastError = error;
      }
    }
    if (cfAccessJwt && cfAccessJwt !== bearerToken) {
      hasJwtCandidate = true;
      try {
        const verified = await verifyFn(cfAccessJwt, oidcConfig);
        const userId = extractUserIdFromClaims(verified.payload);
        return {
          authError: null,
          principal: {
            authMethod: 'oidc',
            ...(userId ? { userId } : {}),
          },
        };
      } catch (error) {
        lastError = error;
      }
    }

    if (hasJwtCandidate) {
      if (!shouldTrySupabase && !shouldTryStatic) {
        const message =
          lastError instanceof Error ? lastError.message : 'token_verification_failed';
        if (message === 'insufficient_scope') {
          return {
            authError: jsonError(403, 'Token missing required scope', 'insufficient_scope'),
          };
        }
        return { authError: jsonError(401, 'Invalid OIDC access token', 'invalid_token') };
      }
    } else if (!shouldTrySupabase && !shouldTryStatic) {
      return {
        authError: jsonError(
          401,
          'Missing access token (Authorization: Bearer or CF-Access-Jwt-Assertion)',
          'missing_token',
        ),
      };
    }
  }

  if (supabaseConfig && shouldTrySupabase) {
    if (!bearerToken) {
      if (!shouldTryStatic) {
        return { authError: jsonError(401, 'Missing bearer token', 'missing_token') };
      }
    } else {
      try {
        const supabaseResult = await verifySupabaseFn(bearerToken, env);
        const normalizedResult =
          typeof supabaseResult === 'boolean' ? { valid: supabaseResult } : supabaseResult;
        if (normalizedResult.valid) {
          return {
            authError: null,
            principal: {
              authMethod: 'supabase',
              ...(normalizedResult.userId ? { userId: normalizedResult.userId } : {}),
            },
          };
        }
      } catch {
        if (!shouldTryStatic) {
          return { authError: jsonError(401, 'Invalid Supabase API key', 'invalid_token') };
        }
      }

      if (!shouldTryStatic) {
        return { authError: jsonError(401, 'Invalid Supabase API key', 'invalid_token') };
      }
    }
  }

  if (staticToken && shouldTryStatic) {
    if (bearerToken === staticToken) {
      return { authError: null, principal: { authMethod: 'static' } };
    }
    if (preferredAuthMethod === 'static' || allowStaticFallback) {
      return { authError: jsonError(401, 'Invalid static bearer token', 'invalid_token') };
    }
  }

  return { authError: jsonError(401, 'Unauthorized', 'unauthorized') };
}

export async function authorizeMcpRequest(
  request: Request,
  env: WorkerSecurityEnv,
  deps: WorkerSecurityDeps = {},
): Promise<Response | null> {
  const result = await authorizeMcpRequestWithPrincipal(request, env, deps);
  return result.authError;
}

export function validateProtocolVersionHeader(
  protocolVersion: string | null,
  required: boolean,
  supportedVersions: ReadonlySet<string>,
): Response | null {
  if (required && !protocolVersion) {
    return jsonError(400, 'Missing required MCP-Protocol-Version header', 'missing_protocol_version');
  }
  if (protocolVersion && !supportedVersions.has(protocolVersion)) {
    return Response.json(
      {
        error: 'unsupported_protocol_version',
        message: `Unsupported MCP-Protocol-Version: ${protocolVersion}`,
        supported: [...supportedVersions],
      },
      { status: 400 },
    );
  }
  return null;
}
