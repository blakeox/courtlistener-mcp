import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

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
  createRemoteJWKSet?: typeof createRemoteJWKSet;
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
  const _createRemoteJWKSet = deps?.createRemoteJWKSet ?? createRemoteJWKSet;
  const _jwtVerify = deps?.jwtVerify ?? jwtVerify;
  const JWKS = _createRemoteJWKSet(new URL(jwksUri));

  const { payload } = await _jwtVerify(token, JWKS, {
    issuer: cfg.issuer,
    audience: cfg.audience,
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
