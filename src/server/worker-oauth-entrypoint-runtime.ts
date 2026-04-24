import { HOSTED_MCP_OAUTH_CONTRACT } from '../auth/oauth-contract.js';
import type { OAuthFrontdoorRateLimitDeps } from './worker-oauth-frontdoor-rate-limit.js';
import { getOAuthFrontdoorRateLimitedResponse } from './worker-oauth-frontdoor-rate-limit.js';

interface OAuthEntrypointEnv {
  MCP_OAUTH_DIAGNOSTICS?: string;
}

interface OAuthFetchProvider<TEnv> {
  fetch(request: Request, env: TEnv, ctx: ExecutionContext): Promise<Response>;
}

export interface HandleWorkerOAuthEntrypointDeps<TEnv extends OAuthEntrypointEnv> {
  cloudflareOAuthProvider: OAuthFetchProvider<TEnv>;
  summarizeOAuthRequest: (request: Request) => Promise<Record<string, unknown>>;
  summarizeOAuthResponse: (response: Response) => Promise<Record<string, unknown>>;
  emitOAuthDiagnostic: (env: TEnv, event: string, metadata: Record<string, unknown>) => void;
  getClientIdentifier?: OAuthFrontdoorRateLimitDeps<TEnv>['getClientIdentifier'];
  getAuthRouteRateLimitedResponse?: OAuthFrontdoorRateLimitDeps<TEnv>['getAuthRouteRateLimitedResponse'];
  now?: OAuthFrontdoorRateLimitDeps<TEnv>['now'];
}

export function shouldInspectOAuthRoute(pathname: string): boolean {
  return (
    pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.token ||
    pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.authorizationServerMetadata ||
    pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.openIdConfiguration ||
    pathname === '/mcp/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/oauth-authorization-server/mcp' ||
    pathname === '/mcp/.well-known/openid-configuration' ||
    pathname === '/.well-known/openid-configuration/mcp' ||
    pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata ||
    pathname === '/.well-known/oauth-protected-resource/mcp' ||
    pathname === '/mcp/.well-known/oauth-protected-resource'
  );
}

export function shouldBypassOAuthProvider(pathname: string): boolean {
  // Metadata discovery routes are served by handleWorkerOAuthRoutes so every
  // canonical and MCP-scoped alias follows the same response path.
  return (
    pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.authorizationServerMetadata ||
    pathname === '/mcp/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/oauth-authorization-server/mcp' ||
    pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.openIdConfiguration ||
    pathname === '/mcp/.well-known/openid-configuration' ||
    pathname === '/.well-known/openid-configuration/mcp' ||
    pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata ||
    pathname === '/.well-known/oauth-protected-resource/mcp' ||
    pathname === '/mcp/.well-known/oauth-protected-resource'
  );
}

export async function handleWorkerOAuthEntrypoint<TEnv extends OAuthEntrypointEnv>(
  request: Request,
  env: TEnv,
  ctx: ExecutionContext,
  deps: HandleWorkerOAuthEntrypointDeps<TEnv>,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const rateLimitKey =
    pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.authorize
      ? 'authorize'
      : pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.token
        ? 'token'
        : pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.register
          ? 'register'
          : null;
  if (rateLimitKey) {
    const rateLimited = await getOAuthFrontdoorRateLimitedResponse(
      request,
      env,
      rateLimitKey,
      deps,
    );
    if (rateLimited) {
      return rateLimited;
    }
  }
  if (!shouldInspectOAuthRoute(pathname)) {
    return deps.cloudflareOAuthProvider.fetch(request, env, ctx);
  }

  const requestSummary = await deps.summarizeOAuthRequest(request);
  const route =
    typeof requestSummary.route === 'string' && requestSummary.route.trim()
      ? requestSummary.route.trim()
      : 'unknown';
  const response = await deps.cloudflareOAuthProvider.fetch(request, env, ctx);
  deps.emitOAuthDiagnostic(env, `oauth.${route}.response`, {
    ...requestSummary,
    ...(await deps.summarizeOAuthResponse(response)),
  });
  return response;
}
