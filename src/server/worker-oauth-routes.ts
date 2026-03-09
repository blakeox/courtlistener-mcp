import {
  HOSTED_MCP_OAUTH_CONTRACT,
  buildHostedMcpAuthorizationServerMetadata,
  buildHostedMcpOpenIdConfiguration,
  buildHostedMcpProtectedResourceMetadata,
  buildHostedMcpProtectedResourceMetadataForPath,
} from '../auth/oauth-contract.js';
import { mergeHostedAiClientOrigins } from './oauth-client-origins.js';

interface WorkerOAuthRouteContext<TEnv> {
  request: Request;
  url: URL;
  origin: string | null;
  allowedOrigins: string[];
  env: TEnv;
}

export interface WorkerOAuthRouteDeps<TEnv> {
  jsonError: (message: string, status: number, errorCode: string) => Response;
  jsonResponse: (payload: unknown, status?: number, extraHeaders?: HeadersInit) => Response;
  withCors: (response: Response, origin: string | null, allowedOrigins: string[]) => Response;
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

function isAuthorizationServerMetadataPath(pathname: string): boolean {
  return (
    pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.authorizationServerMetadata ||
    pathname === '/mcp/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/oauth-authorization-server/mcp'
  );
}

function isOpenIdConfigurationPath(pathname: string): boolean {
  return (
    pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.openIdConfiguration ||
    pathname === '/mcp/.well-known/openid-configuration' ||
    pathname === '/.well-known/openid-configuration/mcp'
  );
}

export async function handleWorkerOAuthRoutes<TEnv>(
  context: WorkerOAuthRouteContext<TEnv>,
  deps: WorkerOAuthRouteDeps<TEnv>,
): Promise<Response | null> {
  const { request, url, origin, allowedOrigins } = context;
  const oauthAllowedOrigins = mergeHostedAiClientOrigins(allowedOrigins);
  const isHeadRequest = request.method === 'HEAD';
  const isMetadataRead = request.method === 'GET' || isHeadRequest;

  if (isAuthorizationServerMetadataPath(url.pathname)) {
    if (!isMetadataRead) {
      return deps.withCors(deps.jsonError('Method not allowed', 405, 'method_not_allowed'), origin, oauthAllowedOrigins);
    }
    const requestOrigin = getRequestOrigin(url);
    const response = deps.jsonResponse(
      buildHostedMcpAuthorizationServerMetadata(requestOrigin),
      200,
      { 'Cache-Control': 'no-store' },
    );
    return deps.withCors(
      isHeadRequest ? new Response(null, { status: response.status, headers: response.headers }) : response,
      origin,
      oauthAllowedOrigins,
    );
  }

  if (isOpenIdConfigurationPath(url.pathname)) {
    if (!isMetadataRead) {
      return deps.withCors(deps.jsonError('Method not allowed', 405, 'method_not_allowed'), origin, oauthAllowedOrigins);
    }
    const requestOrigin = getRequestOrigin(url);
    const response = deps.jsonResponse(
      buildHostedMcpOpenIdConfiguration(requestOrigin),
      200,
      { 'Cache-Control': 'no-store' },
    );
    return deps.withCors(
      isHeadRequest ? new Response(null, { status: response.status, headers: response.headers }) : response,
      origin,
      oauthAllowedOrigins,
    );
  }

  const scopedProtectedResourcePath = getScopedProtectedResourcePath(url.pathname);
  if (scopedProtectedResourcePath) {
    if (!isMetadataRead) {
      return deps.withCors(deps.jsonError('Method not allowed', 405, 'method_not_allowed'), origin, oauthAllowedOrigins);
    }
    const requestOrigin = getRequestOrigin(url);
    const metadata =
      scopedProtectedResourcePath === '/'
        ? buildHostedMcpProtectedResourceMetadata(requestOrigin)
        : buildHostedMcpProtectedResourceMetadataForPath(requestOrigin, scopedProtectedResourcePath);
    const response = deps.jsonResponse(
      metadata,
      200,
      { 'Cache-Control': 'no-store' },
    );
    return deps.withCors(
      isHeadRequest ? new Response(null, { status: response.status, headers: response.headers }) : response,
      origin,
      oauthAllowedOrigins,
    );
  }

  return null;
}
