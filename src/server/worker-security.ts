import type { OAuthConfig } from '../security/oidc.js';
import { verifyAccessToken } from '../security/oidc.js';
import { getSupabaseConfig, validateSupabaseApiKey } from './supabase-auth.js';

export interface WorkerSecurityEnv {
  MCP_AUTH_TOKEN?: string;
  MCP_AUTH_PRIMARY?: string;
  MCP_ALLOW_STATIC_FALLBACK?: string;
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
  verifySupabaseApiKeyFn?: (token: string, env: WorkerSecurityEnv) => Promise<boolean>;
}

type AuthMethod = 'supabase' | 'oidc' | 'static';

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

function isAuthConfigured(env: WorkerSecurityEnv): boolean {
  return Boolean(
    getOidcConfig(env) ||
      env.MCP_AUTH_TOKEN?.trim() ||
      (env.SUPABASE_URL?.trim() && env.SUPABASE_SECRET_KEY?.trim()),
  );
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
export async function authorizeMcpRequest(
  request: Request,
  env: WorkerSecurityEnv,
  deps: WorkerSecurityDeps = {},
): Promise<Response | null> {
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
    (async (token: string, securityEnv: WorkerSecurityEnv): Promise<boolean> => {
      const config = getSupabaseConfig(securityEnv);
      if (!config) return false;
      const result = await validateSupabaseApiKey(token, config);
      return result.valid;
    });

  if (!isAuthConfigured(env)) {
    return null;
  }

  const shouldTryOidc = preferredAuthMethod === 'oidc';
  const shouldTrySupabase = preferredAuthMethod === 'supabase';
  const shouldTryStatic =
    preferredAuthMethod === 'static' ||
    (staticTokenConfigured && allowStaticFallback);

  if (oidcConfig && shouldTryOidc) {
    const jwtCandidates = [bearerToken, cfAccessJwt].filter(
      (token): token is string => typeof token === 'string' && token.length > 0,
    );
    if (jwtCandidates.length > 0) {
      let lastError: unknown;
      for (const jwtCandidate of jwtCandidates) {
        try {
          await verifyFn(jwtCandidate, oidcConfig);
          return null;
        } catch (error) {
          lastError = error;
        }
      }

      if (!shouldTrySupabase && !shouldTryStatic) {
        const message =
          lastError instanceof Error ? lastError.message : 'token_verification_failed';
        if (message === 'insufficient_scope') {
          return jsonError(403, 'Token missing required scope', 'insufficient_scope');
        }
        return jsonError(401, 'Invalid OIDC access token', 'invalid_token');
      }
    } else if (!shouldTrySupabase && !shouldTryStatic) {
      return jsonError(
        401,
        'Missing access token (Authorization: Bearer or CF-Access-Jwt-Assertion)',
        'missing_token',
      );
    }
  }

  if (supabaseConfig && shouldTrySupabase) {
    if (!bearerToken) {
      if (!shouldTryStatic) {
        return jsonError(401, 'Missing bearer token', 'missing_token');
      }
    } else {
      try {
        const validSupabaseKey = await verifySupabaseFn(bearerToken, env);
        if (validSupabaseKey) {
          return null;
        }
      } catch {
        if (!shouldTryStatic) {
          return jsonError(401, 'Invalid Supabase API key', 'invalid_token');
        }
      }

      if (!shouldTryStatic) {
        return jsonError(401, 'Invalid Supabase API key', 'invalid_token');
      }
    }
  }

  if (staticToken && shouldTryStatic) {
    if (bearerToken === staticToken) {
      return null;
    }
    if (preferredAuthMethod === 'static' || allowStaticFallback) {
      return jsonError(401, 'Invalid static bearer token', 'invalid_token');
    }
  }

  return jsonError(401, 'Unauthorized', 'unauthorized');
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
