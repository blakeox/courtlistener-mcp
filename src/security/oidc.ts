import { decodeProtectedHeader, importJWK, JWTPayload, jwtVerify, type JWK } from 'jose';

type Fetcher = typeof fetch;

// Simple in-memory cache for discovery and JWKS URI
const discoveryCache = new Map<string, { jwks_uri: string; exp: number }>();

export interface OAuthVerificationResult {
  payload: JWTPayload;
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

async function fetchJwks(
  jwksUri: string,
  fetcher: Fetcher = fetch,
): Promise<JsonWebKeySetLike> {
  const res = await fetcher(jwksUri, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`JWKS fetch failed (${res.status}) for ${jwksUri}`);
  }
  const json = (await res.json()) as Partial<JsonWebKeySetLike>;
  if (!json || !Array.isArray(json.keys) || json.keys.length === 0) {
    throw new Error('JWKS response missing keys');
  }
  return { keys: json.keys };
}

async function getJwksUri(
  issuer: string,
  explicitJwks?: string,
  fetcher: Fetcher = fetch,
): Promise<string> {
  if (explicitJwks) return explicitJwks;

  const now = Date.now();
  const cached = discoveryCache.get(issuer);
  if (cached && cached.exp > now && cached.jwks_uri) return cached.jwks_uri;

  // Fetch OIDC discovery document
  const wellKnown = issuer.replace(/\/?$/, '/') + '.well-known/openid-configuration';
  const res = await fetcher(wellKnown, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed (${res.status}) for issuer ${issuer}`);
  }
  const json = (await res.json()) as { jwks_uri?: string };
  if (!json.jwks_uri) throw new Error('OIDC discovery missing jwks_uri');

  // Cache for 10 minutes
  discoveryCache.set(issuer, { jwks_uri: json.jwks_uri, exp: now + 10 * 60 * 1000 });
  return json.jwks_uri;
}

export async function verifyAccessToken(
  token: string,
  cfg: OAuthConfig,
  fetcher: Fetcher = fetch,
  deps?: OAuthDeps,
): Promise<OAuthVerificationResult> {
  if (!cfg.issuer) throw new Error('OIDC issuer not configured');

  const jwksUri = await getJwksUri(cfg.issuer, cfg.jwksUrl, fetcher);
  const _jwtVerify = deps?.jwtVerify ?? jwtVerify;
  const _importJWK = deps?.importJWK ?? importJWK;
  const jwks = await fetchJwks(jwksUri, fetcher);
  const protectedHeader = decodeProtectedHeader(token);
  const matchingKey = jwks.keys.find((key) => {
    if (typeof protectedHeader.kid === 'string' && key.kid !== protectedHeader.kid) return false;
    if (typeof protectedHeader.alg === 'string' && typeof key.alg === 'string' && key.alg !== protectedHeader.alg) return false;
    return true;
  });
  if (!matchingKey) {
    throw new Error('no applicable key found in the JSON Web Key Set');
  }
  const verificationKey = await _importJWK(matchingKey as JWK, typeof protectedHeader.alg === 'string' ? protectedHeader.alg : undefined);

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

  return { payload };
}
