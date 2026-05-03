import { OAuthProvider, getOAuthApi, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { HOSTED_MCP_OAUTH_CONTRACT } from '../auth/oauth-contract.js';
import {
  buildOAuthProviderErrorResponse,
  handleOAuthProviderApiRequest,
  handleOAuthProviderDefaultRequest,
  hostedOAuthScopesSupported,
  resolveExternalOAuthToken,
} from './worker-oauth-provider-runtime-helpers.js';
import {
  createRegistrationAccessToken as createRegistrationAccessTokenImpl,
  verifyRegistrationAccessToken as verifyRegistrationAccessTokenImpl,
} from './worker-oauth-registration-token.js';

// Captured per-request so onError can build resource_metadata URLs relative
// to the origin the client actually connected to (workers.dev vs custom domain).
let _currentRequestOrigin = '';

interface OAuthRuntimeEnv {
  MCP_ALLOWED_ORIGINS?: string;
  MCP_UI_SESSION_SECRET?: string;
  COURTLISTENER_API_KEY?: string;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  OIDC_JWKS_URL?: string;
  OIDC_REQUIRED_SCOPE?: string;
  OAUTH_PROVIDER?: OAuthHelpers;
  MCP_OAUTH_DIAGNOSTICS?: string;
  MCP_OAUTH_REGISTRATION_TOKEN_SECRET?: string;
  MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS?: string;
}

interface OAuthProviderRuntimeDeps<TEnv extends OAuthRuntimeEnv> {
  /** Base origin used as a static default for OAuthProvider config URLs.
   *  Per-request dynamic origin is handled by setCurrentRequestOrigin +
   *  custom discovery handlers. Defaults to 'https://courtlistenermcp.blakeoxford.com'. */
  baseOrigin?: string;
  handleAuthorizeRoute: (
    request: Request,
    env: TEnv & { OAUTH_PROVIDER: OAuthHelpers },
  ) => Promise<Response>;
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
export {
  getRegistrationAllowedOrigins,
  withRegistrationCors,
} from './worker-oauth-provider-runtime-helpers.js';
export {
  createRegistrationAccessTokenImpl as createRegistrationAccessToken,
  verifyRegistrationAccessTokenImpl as verifyRegistrationAccessToken,
};

export function createCloudflareOAuthProviderRuntime<TEnv extends OAuthRuntimeEnv>(
  deps: OAuthProviderRuntimeDeps<TEnv>,
) {
  const base = deps.baseOrigin ?? 'https://courtlistenermcp.blakeoxford.com';
  // Use RELATIVE paths for OAuth endpoints — the OAuthProvider library
  // resolves them against the request origin.  Happy-fox (working ChatGPT
  // reference) uses this same pattern.  Absolute URLs caused the library's
  // matchEndpoint() to compare hostnames, which can fail when the request
  // arrives on an unexpected origin.
  const options = {
    authorizeEndpoint: HOSTED_MCP_OAUTH_CONTRACT.paths.authorize,
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
    resourceMetadata: {
      resource: base,
      authorization_servers: [base],
      scopes_supported: hostedOAuthScopesSupported,
      bearer_methods_supported: ['header'],
      resource_name: 'CourtListener MCP',
    },
    apiRoute: ['/mcp', '/sse', '/api/usage'],
    apiHandler: {
      fetch(request: Request, env: TEnv, ctx: ExecutionContext) {
        return handleOAuthProviderApiRequest(request, env, ctx, deps);
      },
    },
    defaultHandler: {
      async fetch(request: Request, env: TEnv, ctx: ExecutionContext) {
        return handleOAuthProviderDefaultRequest(
          request,
          env as TEnv & { OAUTH_PROVIDER?: OAuthHelpers },
          ctx,
          {
            handleAuthorizeRoute: (authorizeRequest, authorizeEnv) =>
              deps.handleAuthorizeRoute(
                authorizeRequest,
                authorizeEnv as TEnv & { OAUTH_PROVIDER: OAuthHelpers },
              ),
            handleLegacyWorkerFetch: deps.handleLegacyWorkerFetch,
          },
        );
      },
    },
    scopesSupported: hostedOAuthScopesSupported,
    allowImplicitFlow: false,
    allowPlainPKCE: false,
    // Disabled: ChatGPT interprets client_id_metadata_document_supported=true
    // as "use CIMD instead of DCR" and skips RFC 7591 registration.
    clientIdMetadataDocumentEnabled: false,
    onError: ({
      code,
      description,
      status,
      headers,
    }: {
      code: string;
      description: string;
      status: number;
      headers: Record<string, string>;
    }) =>
      buildOAuthProviderErrorResponse({
        code,
        description,
        status,
        headers,
        currentRequestOrigin: _currentRequestOrigin,
        baseOrigin: base,
      }),
    resolveExternalToken: async ({ token, env }: { token: string; env: TEnv }) => {
      return resolveExternalOAuthToken(token, env);
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
