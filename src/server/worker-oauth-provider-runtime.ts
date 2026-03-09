import { OAuthProvider, getOAuthApi, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { HOSTED_MCP_OAUTH_CONTRACT } from '../auth/oauth-contract.js';
import { verifyAccessToken, type OAuthConfig } from '../security/oidc.js';
import { mergeHostedAiClientOrigins } from './oauth-client-origins.js';

// Captured per-request so onError can build resource_metadata URLs relative
// to the origin the client actually connected to (workers.dev vs custom domain).
let _currentRequestOrigin = '';

interface OAuthRuntimeEnv {
  MCP_ALLOWED_ORIGINS?: string;
  MCP_AUTH_UI_ORIGIN?: string;
  MCP_UI_SESSION_SECRET?: string;
  COURTLISTENER_API_KEY?: string;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  OIDC_JWKS_URL?: string;
  OIDC_REQUIRED_SCOPE?: string;
  OAUTH_PROVIDER?: OAuthHelpers;
  MCP_OAUTH_DIAGNOSTICS?: string;
}

interface OAuthProviderRuntimeDeps<TEnv extends OAuthRuntimeEnv> {
  /** Base origin used as a static default for OAuthProvider config URLs.
   *  Per-request dynamic origin is handled by setCurrentRequestOrigin +
   *  custom discovery handlers. Defaults to 'https://courtlistenermcp.blakeoxford.com'. */
  baseOrigin?: string;
  handleAuthorizeRoute: (request: Request, env: TEnv & { OAUTH_PROVIDER: OAuthHelpers }) => Promise<Response>;
  handleLegacyWorkerFetch: (
    request: Request,
    env: TEnv,
    ctx: ExecutionContext,
    options?: { skipGatewayAuth?: boolean },
  ) => Promise<Response>;
  getCachedAllowedOrigins: (rawAllowedOrigins: string | undefined, authUiOriginRaw?: string) => string[];
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
  const configured = deps.getCachedAllowedOrigins(env.MCP_ALLOWED_ORIGINS, env.MCP_AUTH_UI_ORIGIN);
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

function getRegistrationTokenSigningSecret(env: OAuthRuntimeEnv): string | null {
  return (
    env.MCP_UI_SESSION_SECRET?.trim() ||
    env.COURTLISTENER_API_KEY?.trim() ||
    null
  );
}

function encodeBase64Url(input: Uint8Array): string {
  const base64 = Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createRegistrationAccessToken<TEnv extends OAuthRuntimeEnv>(
  env: TEnv,
  clientId: string,
): Promise<string | null> {
  const secret = getRegistrationTokenSigningSecret(env);
  if (!secret) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const payload = encoder.encode(`registration:${clientId}`);
  const signature = await crypto.subtle.sign('HMAC', key, payload);
  return `clreg.${encodeBase64Url(payload)}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyRegistrationAccessToken<TEnv extends OAuthRuntimeEnv>(
  env: TEnv,
  clientId: string,
  presentedToken: string,
): Promise<boolean> {
  if (!presentedToken.startsWith('clreg.')) return false;
  const expected = await createRegistrationAccessToken(env, clientId);
  return expected !== null && expected === presentedToken;
}

export function createCloudflareOAuthProviderRuntime<TEnv extends OAuthRuntimeEnv>(
  deps: OAuthProviderRuntimeDeps<TEnv>,
) {
  const base = deps.baseOrigin ?? 'https://courtlistenermcp.blakeoxford.com';
  const options = {
    authorizeEndpoint: `${base}/authorize`,
    tokenEndpoint: `${base}/token`,
    clientRegistrationEndpoint: `${base}/register`,
    resourceMetadata: {
      resource: base,
      authorization_servers: [base],
      scopes_supported: [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported],
      bearer_methods_supported: ['header'],
      resource_name: 'CourtListener MCP',
    },
    apiRoute: ['/mcp', '/sse', '/api/usage'],
    apiHandler: {
      fetch(request: Request, env: TEnv, ctx: ExecutionContext) {
        const oauthProps = (ctx as ExecutionContext & { props?: Record<string, unknown> }).props;
        const oauthUserId =
          typeof oauthProps?.userId === 'string' && oauthProps.userId.trim().length > 0
            ? oauthProps.userId.trim()
            : null;
        const oauthAuthMethod =
          typeof oauthProps?.authMethod === 'string' && oauthProps.authMethod.trim().length > 0
            ? oauthProps.authMethod.trim()
            : null;

        const headers = new Headers(request.headers);
        if (oauthUserId) headers.set('x-oauth-user-id', oauthUserId);
        if (oauthAuthMethod) headers.set('x-oauth-auth-method', oauthAuthMethod);
        // Remove the Cloudflare OAuth bearer token — the provider already
        // validated it.  Forwarding it would confuse downstream auth layers.
        headers.delete('Authorization');
        const enrichedRequest = new Request(request, { headers });
        return deps.handleLegacyWorkerFetch(enrichedRequest, env, ctx, { skipGatewayAuth: true });
      },
    },
    defaultHandler: {
      async fetch(request: Request, env: TEnv, ctx: ExecutionContext) {
        const url = new URL(request.url);
        if (url.pathname === '/authorize' && env.OAUTH_PROVIDER) {
          return deps.handleAuthorizeRoute(request, env as TEnv & { OAUTH_PROVIDER: OAuthHelpers });
        }
        return deps.handleLegacyWorkerFetch(request, env, ctx);
      },
    },
    scopesSupported: [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported],
    allowImplicitFlow: false,
    allowPlainPKCE: false,
    // Disabled: ChatGPT interprets client_id_metadata_document_supported=true
    // as "use CIMD instead of DCR" and skips RFC 7591 registration.
    clientIdMetadataDocumentEnabled: false,
    onError: ({ code, description, status, headers }: {
      code: string;
      description: string;
      status: number;
      headers: Record<string, string>;
    }) => {
      const normalizedHeaders = new Headers(headers);
      const isAuthChallenge =
        status === 401 || (status === 403 && code === 'insufficient_scope');

      if (isAuthChallenge) {
        const origin = _currentRequestOrigin || base;
        const mcpResourceMetadataUrl =
          `${origin}/.well-known/oauth-protected-resource`;
        normalizedHeaders.set('WWW-Authenticate', `Bearer resource_metadata="${mcpResourceMetadataUrl}"`);
        normalizedHeaders.append(
          'Link',
          `<${mcpResourceMetadataUrl}>; rel="oauth-protected-resource"`,
        );
      }
      normalizedHeaders.set('content-type', 'application/json');
      normalizedHeaders.set('cache-control', 'no-store');

      return new Response(
        JSON.stringify({
          error: code,
          error_description: description,
        }),
        {
          status,
          headers: normalizedHeaders,
        },
      );
    },
    resolveExternalToken: async ({ token, env }: { token: string; env: TEnv }) => {
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
    },
  } satisfies ConstructorParameters<typeof OAuthProvider<TEnv>>[0];

  const provider = new OAuthProvider<TEnv>(options);

  function getOAuthHelpers(env: TEnv): OAuthHelpers {
    if (!env.OAUTH_PROVIDER) {
      env.OAUTH_PROVIDER = getOAuthApi(options, env);
    }
    return env.OAUTH_PROVIDER;
  }

  return {
    options,
    provider,
    getOAuthHelpers,
    /** Call before provider.fetch() so onError can derive origin-relative URLs. */
    setCurrentRequestOrigin(origin: string) {
      _currentRequestOrigin = origin;
    },
  };
}
