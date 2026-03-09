import { HOSTED_MCP_OAUTH_CONTRACT } from '../auth/oauth-contract.js';

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
  // Standard discovery paths (/.well-known/oauth-authorization-server,
  // /.well-known/oauth-protected-resource, etc.) go through the OAuthProvider
  // so it can handle them natively — matching the architecture of working
  // MCP servers.
  //
  // MCP-scoped paths that start with /mcp/ MUST bypass the OAuthProvider
  // because it would treat them as authenticated API routes (the /mcp prefix
  // matches apiRoute).  Custom handlers in handleWorkerOAuthRoutes serve them.
  return (
    pathname === '/mcp/.well-known/oauth-authorization-server' ||
    pathname === '/mcp/.well-known/openid-configuration' ||
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
  if (!shouldInspectOAuthRoute(pathname)) {
    return deps.cloudflareOAuthProvider.fetch(request, env, ctx);
  }

  const requestSummary = await deps.summarizeOAuthRequest(request);
  const route = typeof requestSummary.route === 'string' && requestSummary.route.trim()
    ? requestSummary.route.trim()
    : 'unknown';
  const response = await deps.cloudflareOAuthProvider.fetch(request, env, ctx);
  deps.emitOAuthDiagnostic(env, `oauth.${route}.response`, {
    ...requestSummary,
    ...(await deps.summarizeOAuthResponse(response)),
  });
  return response;
}
