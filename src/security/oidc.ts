import { decodeProtectedHeader, importJWK, JWTPayload, jwtVerify, type JWK } from 'jose';

type Fetcher = typeof fetch;

// Simple in-memory cache for discovery and JWKS URI
const discoveryCache = new Map<string, { jwks_uri: string; exp: number }>();

export type OAuthDiscoveryCacheStatus = 'hit' | 'miss' | 'bypass';

export interface OAuthVerificationMetadata {
  verificationDurationMs: number;
  discoveryDurationMs?: number;
  discoveryCacheStatus: OAuthDiscoveryCacheStatus;
  jwksFetchDurationMs: number;
}

export interface OAuthVerificationResult {
  payload: JWTPayload;
  metadata: OAuthVerificationMetadata;
}

export interface OAuthConfig {
  issuer: string;
  audience?: string;
  jwksUrl?: string;
  requiredScope?: string;
}
/**
 * Optional dependency overrides to facilitate unit testing without real network or crypto calls.
 */
export interface OAuthDeps {
  jwtVerify?: typeof jwtVerify;
  importJWK?: typeof importJWK;
}

interface JsonWebKeySetLike {
  keys: Array<Record<string, unknown>>;
}

interface OAuthVerificationError extends Error {
  verificationMetadata?: OAuthVerificationMetadata;
}

interface JwksFetchResult {
  jwks: JsonWebKeySetLike;
  durationMs: number;
}

interface JwksUriResolution {
  jwksUri: string;
  discoveryDurationMs?: number;
  discoveryCacheStatus: OAuthDiscoveryCacheStatus;
}

function normalizeDurationMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function buildVerificationMetadata(params: {
  verificationStartedAtMs: number;
  discoveryDurationMs: number | undefined;
  discoveryCacheStatus: OAuthDiscoveryCacheStatus;
  jwksFetchDurationMs: number;
}): OAuthVerificationMetadata {
  return {
    verificationDurationMs: normalizeDurationMs(Date.now() - params.verificationStartedAtMs),
    ...(typeof params.discoveryDurationMs === 'number'
      ? { discoveryDurationMs: normalizeDurationMs(params.discoveryDurationMs) }
      : {}),
    discoveryCacheStatus: params.discoveryCacheStatus,
    jwksFetchDurationMs: normalizeDurationMs(params.jwksFetchDurationMs),
  };
}

function attachVerificationMetadata(
  error: unknown,
  metadata: OAuthVerificationMetadata,
): OAuthVerificationError {
  const wrapped: OAuthVerificationError = error instanceof Error ? error : new Error(String(error));
  wrapped.verificationMetadata = metadata;
  return wrapped;
}

function findMatchingJwk(
  jwks: JsonWebKeySetLike,
  protectedHeader: ReturnType<typeof decodeProtectedHeader>,
): Record<string, unknown> | undefined {
  return jwks.keys.find((key) => {
    if (typeof protectedHeader.kid === 'string' && key.kid !== protectedHeader.kid) return false;
    if (
      typeof protectedHeader.alg === 'string' &&
      typeof key.alg === 'string' &&
      key.alg !== protectedHeader.alg
    ) {
      return false;
    }
    return true;
  });
}

async function fetchJwks(
  jwksUri: string,
  fetcher: Fetcher = fetch,
  forceRefresh = false,
): Promise<JwksFetchResult> {
  const startedAtMs = Date.now();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (forceRefresh) {
    headers['cache-control'] = 'no-cache';
    headers.pragma = 'no-cache';
  }
  const res = await fetcher(jwksUri, { headers });
  if (!res.ok) {
    throw new Error(`JWKS fetch failed (${res.status}) for ${jwksUri}`);
  }
  const json = (await res.json()) as Partial<JsonWebKeySetLike>;
  if (!json || !Array.isArray(json.keys) || json.keys.length === 0) {
    throw new Error('JWKS response missing keys');
  }
  return {
    jwks: { keys: json.keys },
    durationMs: normalizeDurationMs(Date.now() - startedAtMs),
  };
}

async function getJwksUri(
  issuer: string,
  explicitJwks?: string,
  fetcher: Fetcher = fetch,
): Promise<JwksUriResolution> {
  if (explicitJwks) {
    return {
      jwksUri: explicitJwks,
      discoveryCacheStatus: 'bypass',
    };
  }

  const now = Date.now();
  const cached = discoveryCache.get(issuer);
  if (cached && cached.exp > now && cached.jwks_uri) {
    return {
      jwksUri: cached.jwks_uri,
      discoveryCacheStatus: 'hit',
    };
  }

  // Fetch OIDC discovery document
  const startedAtMs = Date.now();
  const wellKnown = issuer.replace(/\/?$/, '/') + '.well-known/openid-configuration';
  const res = await fetcher(wellKnown, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed (${res.status}) for issuer ${issuer}`);
  }
  const json = (await res.json()) as { jwks_uri?: string };
  if (!json.jwks_uri) throw new Error('OIDC discovery missing jwks_uri');

  // Cache for 10 minutes
  discoveryCache.set(issuer, { jwks_uri: json.jwks_uri, exp: now + 10 * 60 * 1000 });
  return {
    jwksUri: json.jwks_uri,
    discoveryDurationMs: normalizeDurationMs(Date.now() - startedAtMs),
    discoveryCacheStatus: 'miss',
  };
}

export async function verifyAccessToken(
  token: string,
  cfg: OAuthConfig,
  fetcher: Fetcher = fetch,
  deps?: OAuthDeps,
): Promise<OAuthVerificationResult> {
  if (!cfg.issuer) throw new Error('OIDC issuer not configured');

  const verificationStartedAtMs = Date.now();
  let discoveryDurationMs: number | undefined;
  let discoveryCacheStatus: OAuthDiscoveryCacheStatus = cfg.jwksUrl ? 'bypass' : 'miss';
  let jwksFetchDurationMs = 0;
  try {
    const jwksResolution = await getJwksUri(cfg.issuer, cfg.jwksUrl, fetcher);
    const jwksUri = jwksResolution.jwksUri;
    discoveryDurationMs = jwksResolution.discoveryDurationMs;
    discoveryCacheStatus = jwksResolution.discoveryCacheStatus;

    const _jwtVerify = deps?.jwtVerify ?? jwtVerify;
    const _importJWK = deps?.importJWK ?? importJWK;
    const protectedHeader = decodeProtectedHeader(token);
    const jwksResult = await fetchJwks(jwksUri, fetcher);
    jwksFetchDurationMs += jwksResult.durationMs;
    let matchingKey = findMatchingJwk(jwksResult.jwks, protectedHeader);
    if (!matchingKey && typeof protectedHeader.kid === 'string' && protectedHeader.kid.length > 0) {
      const refreshedJwksResult = await fetchJwks(jwksUri, fetcher, true);
      jwksFetchDurationMs += refreshedJwksResult.durationMs;
      matchingKey = findMatchingJwk(refreshedJwksResult.jwks, protectedHeader);
    }
    if (!matchingKey) {
      throw new Error('no applicable key found in the JSON Web Key Set');
    }
    const verificationKey = await _importJWK(
      matchingKey as JWK,
      typeof protectedHeader.alg === 'string' ? protectedHeader.alg : undefined,
    );

    const { payload } = await _jwtVerify(token, verificationKey, {
      issuer: cfg.issuer,
      ...(cfg.audience !== undefined && { audience: cfg.audience }),
    });

    // Optional scope check
    if (cfg.requiredScope) {
      // Common claims: scope (space-delimited string) or scp (array)
      let scopes: string[] = [];
      const scopeClaim = payload.scope;
      const scpClaim = (payload as unknown as Record<string, unknown>).scp as string[] | undefined;
      if (typeof scopeClaim === 'string') scopes = scopeClaim.split(' ').filter(Boolean);
      else if (Array.isArray(scpClaim)) scopes = scpClaim;

      if (!scopes.includes(cfg.requiredScope)) {
        throw new Error('insufficient_scope');
      }
    }

    return {
      payload,
      metadata: buildVerificationMetadata({
        verificationStartedAtMs,
        discoveryDurationMs,
        discoveryCacheStatus,
        jwksFetchDurationMs,
      }),
    };
  } catch (error) {
    throw attachVerificationMetadata(
      error,
      buildVerificationMetadata({
        verificationStartedAtMs,
        discoveryDurationMs,
        discoveryCacheStatus,
        jwksFetchDurationMs,
      }),
    );
  }
}
