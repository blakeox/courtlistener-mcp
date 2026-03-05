import type { OAuthConfig } from '../security/oidc.js';
import { verifyAccessToken } from '../security/oidc.js';
import { getSupabaseConfig, validateSupabaseApiKey } from './supabase-auth.js';
import type { PrincipalContext } from '../infrastructure/principal-context.js';
import {
  negotiateCapabilityProfile,
  type CapabilityProfile,
  type CapabilityProfileNegotiationReason,
} from '../infrastructure/protocol-governance.js';
import {
  PREFERRED_MCP_PROTOCOL_VERSION,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
} from '../infrastructure/protocol-constants.js';
import { buildEdgeAuthDecisionEngine } from './edge-auth-decision-engine.js';

export interface WorkerSecurityEnv {
  MCP_AUTH_TOKEN?: string;
  MCP_AUTH_PRIMARY?: string;
  MCP_ALLOW_STATIC_FALLBACK?: string;
  MCP_SERVICE_TOKEN_HEADER?: string;
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
  protocolNegotiation?: ProtocolHeaderNegotiationDiagnostics;
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

function jsonError(status: number, message: string, code: string): Response {
  return Response.json({ error: code, message }, { status });
}

export type ProtocolNegotiationDecisionReason =
  | 'accepted'
  | 'profile_fallback'
  | 'missing_protocol_version'
  | 'unsupported_protocol_version'
  | 'no_supported_protocol_version';

export interface ProtocolHeaderNegotiationDiagnostics {
  requestedProtocolVersion: string | null;
  requestedCapabilityProfile: string | null;
  acceptedProtocolVersion: string | null;
  acceptedCapabilityProfile: CapabilityProfile | null;
  accepted: boolean;
  reason: ProtocolNegotiationDecisionReason;
  profileReason?: CapabilityProfileNegotiationReason;
  profileFallbackFrom?: string;
  supportedProtocolVersions: string[];
  supportedCapabilityProfiles?: readonly CapabilityProfile[];
}

export interface ProtocolHeaderValidationResult {
  error: Response | null;
  diagnostics: ProtocolHeaderNegotiationDiagnostics;
}

function resolvePreferredProtocolVersion(supportedVersions: ReadonlySet<string>): string | null {
  if (supportedVersions.has(PREFERRED_MCP_PROTOCOL_VERSION)) {
    return PREFERRED_MCP_PROTOCOL_VERSION;
  }
  const knownSupported = SUPPORTED_MCP_PROTOCOL_VERSIONS.filter((version) =>
    supportedVersions.has(version),
  );
  if (knownSupported.length > 0) {
    return knownSupported[knownSupported.length - 1] ?? null;
  }
  const adHocSupported = [...supportedVersions].sort();
  return adHocSupported[adHocSupported.length - 1] ?? null;
}

function extractUserIdFromClaims(payload: Record<string, unknown>): string | undefined {
  const subject = payload.sub;
  return typeof subject === 'string' && subject.trim().length > 0 ? subject : undefined;
}

/**
 * Authorize MCP requests using either:
 * 0) Internal service-token header validation (x-mcp-service-token by default)
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
  const serviceTokenHeader = env.MCP_SERVICE_TOKEN_HEADER?.trim() || 'x-mcp-service-token';
  const serviceTokenCandidate = request.headers.get(serviceTokenHeader)?.trim() || null;
  const cfAccessJwt = request.headers.get('CF-Access-Jwt-Assertion')?.trim() || null;
  const staticToken = env.MCP_AUTH_TOKEN?.trim();
  const oidcConfig = getOidcConfig(env);
  const supabaseConfig = getSupabaseConfig(env);
  const staticTokenConfigured = Boolean(staticToken);
  const supabaseConfigured = Boolean(supabaseConfig);
  const allowStaticFallback = parseBoolean(env.MCP_ALLOW_STATIC_FALLBACK);
  const decisionEngine = buildEdgeAuthDecisionEngine({
    requestedPrimary: env.MCP_AUTH_PRIMARY,
    allowStaticFallback,
    serviceTokenConfigured: staticTokenConfigured,
    supabaseConfigured,
    oidcConfigured: Boolean(oidcConfig),
    staticTokenConfigured,
  });

  const verifyFn = deps.verifyAccessTokenFn ?? verifyAccessToken;
  const verifySupabaseFn =
    deps.verifySupabaseApiKeyFn ??
    (async (token: string): Promise<{ valid: boolean; userId?: string }> => {
      if (!supabaseConfig) return { valid: false };
      const result = await validateSupabaseApiKey(token, supabaseConfig);
      return result;
    });

  if (decisionEngine.attempts.length === 0) {
    return { authError: null };
  }

  const shouldTryServiceToken = decisionEngine.attempts.includes('serviceToken');
  const shouldTryOidc = decisionEngine.attempts.includes('oidc');
  const shouldTrySupabase = decisionEngine.attempts.includes('supabase');
  const shouldTryStatic = decisionEngine.attempts.includes('static');

  if (staticToken && shouldTryServiceToken && serviceTokenCandidate) {
    if (serviceTokenCandidate === staticToken) {
      return { authError: null, principal: { authMethod: 'static' } };
    }
    return { authError: jsonError(401, 'Invalid service token', 'invalid_token') };
  }

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
      if (!shouldTrySupabase && !shouldTryStatic && !shouldTryServiceToken) {
        const message =
          lastError instanceof Error ? lastError.message : 'token_verification_failed';
        if (message === 'insufficient_scope') {
          return {
            authError: jsonError(403, 'Token missing required scope', 'insufficient_scope'),
          };
        }
        return { authError: jsonError(401, 'Invalid OIDC access token', 'invalid_token') };
      }
    } else if (!shouldTrySupabase && !shouldTryStatic && !shouldTryServiceToken) {
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
      if (!shouldTryStatic && !shouldTryServiceToken) {
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
        if (!shouldTryStatic && !shouldTryServiceToken) {
          return { authError: jsonError(401, 'Invalid Supabase API key', 'invalid_token') };
        }
      }

      if (!shouldTryStatic && !shouldTryServiceToken) {
        return { authError: jsonError(401, 'Invalid Supabase API key', 'invalid_token') };
      }
    }
  }

  if (staticToken && shouldTryStatic) {
    if (bearerToken === staticToken) {
      return { authError: null, principal: { authMethod: 'static' } };
    }
    if (decisionEngine.effectivePrimary === 'static' || allowStaticFallback) {
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
  return validateProtocolHeaderNegotiation(protocolVersion, null, required, supportedVersions).error;
}

export function validateProtocolHeaderNegotiation(
  protocolVersion: string | null,
  capabilityProfile: string | null,
  required: boolean,
  supportedVersions: ReadonlySet<string>,
): ProtocolHeaderValidationResult {
  const supported = [...supportedVersions].sort();
  const preferredProtocolVersion = resolvePreferredProtocolVersion(supportedVersions);
  const baseDiagnostics: ProtocolHeaderNegotiationDiagnostics = {
    requestedProtocolVersion: protocolVersion,
    requestedCapabilityProfile: capabilityProfile,
    acceptedProtocolVersion: preferredProtocolVersion,
    acceptedCapabilityProfile: null,
    accepted: false,
    reason: 'accepted',
    supportedProtocolVersions: supported,
  };

  if (required && !protocolVersion) {
    const diagnostics: ProtocolHeaderNegotiationDiagnostics = {
      ...baseDiagnostics,
      accepted: false,
      reason: 'missing_protocol_version',
    };
    return {
      error: Response.json(
        {
          error: 'missing_protocol_version',
          message: 'Missing required MCP-Protocol-Version header',
          diagnostics,
        },
        { status: 400 },
      ),
      diagnostics,
    };
  }

  if (protocolVersion && !supportedVersions.has(protocolVersion)) {
    const diagnostics: ProtocolHeaderNegotiationDiagnostics = {
      ...baseDiagnostics,
      accepted: false,
      reason: 'unsupported_protocol_version',
    };
    return {
      error: Response.json(
        {
          error: 'unsupported_protocol_version',
          message: `Unsupported MCP-Protocol-Version: ${protocolVersion}`,
          supported: [...supportedVersions],
          diagnostics,
        },
        { status: 400 },
      ),
      diagnostics,
    };
  }

  const acceptedProtocolVersion = protocolVersion ?? preferredProtocolVersion;
  if (!acceptedProtocolVersion) {
    const diagnostics: ProtocolHeaderNegotiationDiagnostics = {
      ...baseDiagnostics,
      acceptedProtocolVersion: null,
      accepted: false,
      reason: 'no_supported_protocol_version',
    };
    return {
      error: Response.json(
        {
          error: 'unsupported_protocol_version',
          message: 'No supported MCP protocol versions are configured',
          supported,
          diagnostics,
        },
        { status: 400 },
      ),
      diagnostics,
    };
  }

  const canNegotiateProfiles = SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(
    acceptedProtocolVersion as (typeof SUPPORTED_MCP_PROTOCOL_VERSIONS)[number],
  );
  const profileNegotiation = canNegotiateProfiles
    ? negotiateCapabilityProfile(
        acceptedProtocolVersion as (typeof SUPPORTED_MCP_PROTOCOL_VERSIONS)[number],
        capabilityProfile,
      )
    : null;
  const profileFallback =
    profileNegotiation !== null &&
    profileNegotiation.reason !== 'accepted' &&
    profileNegotiation.reason !== 'defaulted_missing_profile';

  const diagnostics: ProtocolHeaderNegotiationDiagnostics = {
    ...baseDiagnostics,
    acceptedProtocolVersion,
    acceptedCapabilityProfile: profileNegotiation?.acceptedProfile ?? null,
    accepted: true,
    reason: profileFallback ? 'profile_fallback' : 'accepted',
    ...(profileNegotiation?.reason !== undefined && { profileReason: profileNegotiation.reason }),
    ...(profileNegotiation?.fallbackFrom !== undefined && {
      profileFallbackFrom: profileNegotiation.fallbackFrom,
    }),
    ...(profileNegotiation?.supportedProfiles !== undefined && {
      supportedCapabilityProfiles: profileNegotiation.supportedProfiles,
    }),
  };

  return { error: null, diagnostics };
}
