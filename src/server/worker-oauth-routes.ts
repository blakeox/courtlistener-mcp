import {
  HOSTED_MCP_OAUTH_CONTRACT,
  buildHostedMcpAuthorizationServerMetadata,
  buildHostedMcpProtectedResourceMetadata,
  buildHostedMcpProtectedResourceMetadataForPath,
} from '../auth/oauth-contract.js';

interface WorkerOAuthRouteContext<TEnv> {
  request: Request;
  url: URL;
  env: TEnv;
}

export interface WorkerOAuthRouteDeps<TEnv> {
  jsonError: (message: string, status: number, errorCode: string) => Response;
  jsonResponse: (payload: unknown, status?: number, extraHeaders?: HeadersInit) => Response;
}

function getRequestOrigin(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function getScopedProtectedResourcePath(pathname: string): string | null {
  if (pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata) {
    return '/';
  }
  if (pathname === '/mcp/.well-known/oauth-protected-resource') {
    return '/mcp';
  }
  if (pathname === '/.well-known/oauth-protected-resource/mcp') {
    return '/mcp';
  }
  return null;
}

export async function handleWorkerOAuthRoutes<TEnv>(
  context: WorkerOAuthRouteContext<TEnv>,
  deps: WorkerOAuthRouteDeps<TEnv>,
): Promise<Response | null> {
  const { request, url } = context;

  if (url.pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.authorizationServerMetadata) {
    if (request.method !== 'GET') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const origin = getRequestOrigin(url);
    return deps.jsonResponse(
      buildHostedMcpAuthorizationServerMetadata(origin),
      200,
      { 'Cache-Control': 'no-store' },
    );
  }

  const scopedProtectedResourcePath = getScopedProtectedResourcePath(url.pathname);
  if (scopedProtectedResourcePath) {
    if (request.method !== 'GET') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const origin = getRequestOrigin(url);
    const metadata =
      scopedProtectedResourcePath === '/'
        ? buildHostedMcpProtectedResourceMetadata(origin)
        : buildHostedMcpProtectedResourceMetadataForPath(origin, scopedProtectedResourcePath);
    return deps.jsonResponse(
      metadata,
      200,
      { 'Cache-Control': 'no-store' },
    );
  }

  return null;
}
