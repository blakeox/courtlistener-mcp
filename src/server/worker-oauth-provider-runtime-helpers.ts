import { HOSTED_MCP_OAUTH_CONTRACT } from '../auth/oauth-contract.js';
import { verifyAccessToken, type OAuthConfig } from '../security/oidc.js';
import { mergeHostedAiClientOrigins } from './oauth-client-origins.js';
import { getPrevalidatedOAuthIdentity } from './prevalidated-oauth-context.js';

export interface OAuthRuntimeEnv {
  MCP_ALLOWED_ORIGINS?: string;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  OIDC_JWKS_URL?: string;
  OIDC_REQUIRED_SCOPE?: string;
  OAUTH_PROVIDER?: unknown;
}

export interface OAuthProviderRuntimeDeps<TEnv extends OAuthRuntimeEnv> {
  handleAuthorizeRoute: (request: Request, env: TEnv) => Promise<Response>;
  handleLegacyWorkerFetch: (
    request: Request,
    env: TEnv,
    ctx: ExecutionContext,
    options?: { skipGatewayAuth?: boolean },
  ) => Promise<Response>;
  getCachedAllowedOrigins: (rawAllowedOrigins: string | undefined) => string[];
  getRequestOrigin: (request: Request) => string | null;
  buildCorsHeaders: (origin: string | null, allowedOrigins: string[]) => Headers;
}

function getWorkerOidcConfig(env: OAuthRuntimeEnv): OAuthConfig | null {
  const issuer = env.OIDC_ISSUER?.trim();
  if (!issuer) return null;
  return {
    issuer,
    ...(env.OIDC_AUDIENCE?.trim() ? { audience: env.OIDC_AUDIENCE.trim() } : {}),
    ...(env.OIDC_JWKS_URL?.trim() ? { jwksUrl: env.OIDC_JWKS_URL.trim() } : {}),
    ...(env.OIDC_REQUIRED_SCOPE?.trim() ? { requiredScope: env.OIDC_REQUIRED_SCOPE.trim() } : {}),
  };
}

export function getRegistrationAllowedOrigins<TEnv extends OAuthRuntimeEnv>(
  env: TEnv,
  deps: Pick<OAuthProviderRuntimeDeps<TEnv>, 'getCachedAllowedOrigins'>,
): string[] {
  const configured = deps.getCachedAllowedOrigins(env.MCP_ALLOWED_ORIGINS);
  return mergeHostedAiClientOrigins(configured);
}

export function withRegistrationCors<TEnv extends OAuthRuntimeEnv>(
  response: Response,
  request: Request,
  env: TEnv,
  deps: Pick<
    OAuthProviderRuntimeDeps<TEnv>,
    'getRequestOrigin' | 'buildCorsHeaders' | 'getCachedAllowedOrigins'
  >,
): Response {
  const origin = deps.getRequestOrigin(request);
  const allowedOrigins = getRegistrationAllowedOrigins(env, deps);
  const headers = new Headers(response.headers);
  const corsHeaders = deps.buildCorsHeaders(origin, allowedOrigins);

  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handleOAuthProviderApiRequest<TEnv extends OAuthRuntimeEnv>(
  request: Request,
  env: TEnv,
  ctx: ExecutionContext,
  deps: Pick<OAuthProviderRuntimeDeps<TEnv>, 'handleLegacyWorkerFetch'>,
): Promise<Response> {
  if (!getPrevalidatedOAuthIdentity(ctx)) {
    return Promise.resolve(
      Response.json(
        {
          error: 'invalid_prevalidated_oauth_context',
          message: 'Validated OAuth context is required for the internal provider fast path.',
        },
        { status: 401 },
      ),
    );
  }

  const headers = new Headers(request.headers);
  headers.delete('Authorization');
  const enrichedRequest = new Request(request, { headers });
  return deps.handleLegacyWorkerFetch(enrichedRequest, env, ctx, { skipGatewayAuth: true });
}

export function handleOAuthProviderDefaultRequest<TEnv extends OAuthRuntimeEnv>(
  request: Request,
  env: TEnv,
  ctx: ExecutionContext,
  deps: Pick<OAuthProviderRuntimeDeps<TEnv>, 'handleAuthorizeRoute' | 'handleLegacyWorkerFetch'>,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/authorize' && env.OAUTH_PROVIDER) {
    return deps.handleAuthorizeRoute(request, env);
  }
  return deps.handleLegacyWorkerFetch(request, env, ctx);
}

export function buildOAuthProviderErrorResponse(params: {
  code: string;
  description: string;
  status: number;
  headers: Record<string, string>;
  currentRequestOrigin: string;
  baseOrigin: string;
}): Response {
  const normalizedHeaders = new Headers(params.headers);
  const isAuthChallenge =
    params.status === 401 || (params.status === 403 && params.code === 'insufficient_scope');

  if (isAuthChallenge) {
    const origin = params.currentRequestOrigin || params.baseOrigin;
    const mcpResourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource`;
    normalizedHeaders.set(
      'WWW-Authenticate',
      `Bearer resource_metadata="${mcpResourceMetadataUrl}"`,
    );
    normalizedHeaders.append('Link', `<${mcpResourceMetadataUrl}>; rel="oauth-protected-resource"`);
  }
  normalizedHeaders.set('content-type', 'application/json');
  normalizedHeaders.set('cache-control', 'no-store');

  return new Response(
    JSON.stringify({
      error: params.code,
      error_description: params.description,
    }),
    {
      status: params.status,
      headers: normalizedHeaders,
    },
  );
}

export async function resolveExternalOAuthToken<TEnv extends OAuthRuntimeEnv>(
  token: string,
  env: TEnv,
): Promise<{
  props: {
    userId: string;
    authMethod: 'oidc';
    source: 'external_oidc';
  };
  audience?: string | string[];
} | null> {
  const oidcConfig = getWorkerOidcConfig(env);
  if (!oidcConfig) return null;

  try {
    const verified = await verifyAccessToken(token, oidcConfig);
    const subject = verified.payload.sub;
    if (typeof subject !== 'string' || subject.trim().length === 0) {
      return null;
    }
    const audClaim = verified.payload.aud;
    const audience =
      typeof audClaim === 'string'
        ? audClaim
        : Array.isArray(audClaim)
          ? audClaim.filter((item): item is string => typeof item === 'string')
          : undefined;
    return {
      props: {
        userId: subject.trim(),
        authMethod: 'oidc',
        source: 'external_oidc',
      },
      ...(audience ? { audience } : {}),
    };
  } catch {
    return null;
  }
}

export const hostedOAuthScopesSupported = [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported];
