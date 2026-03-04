/// <reference types="@cloudflare/workers-types" />

import type { WorkerSecurityEnv } from './worker-security.js';
import {
  isAllowedOrigin,
} from './worker-security.js';
import { authorizeMcpGatewayRequest } from './mcp-gateway-auth.js';
import { runWithPrincipalContext } from '../infrastructure/principal-context.js';

interface McpHandler<Env extends WorkerSecurityEnv> {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
}

export interface HandleMcpGatewayRouteParams<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
> {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  pathname: string;
  requestMethod: string;
  origin: string | null;
  allowedOrigins: string[];
  mcpPath: boolean;
  supportedProtocolVersions: ReadonlySet<string>;
  mcpStreamableHandler: McpHandler<Env>;
  mcpSseCompatibilityHandler: McpHandler<Env>;
  withCors: (response: Response, origin: string | null, allowedOrigins: string[]) => Response;
  buildCorsHeaders: (origin: string | null, allowedOrigins: string[]) => Headers;
  getClientIdentifier: (request: Request) => string;
  getAuthRateLimitedResponse: (clientId: string, env: Env, nowMs: number) => Promise<Response | null>;
  recordAuthFailure: (clientId: string, env: Env, nowMs: number) => Promise<void>;
  clearAuthFailures: (clientId: string, env: Env, nowMs: number) => Promise<void>;
}

export async function handleMcpGatewayRoute<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
>(params: HandleMcpGatewayRouteParams<Env>): Promise<Response | null> {
  const {
    request,
    env,
    ctx,
    pathname,
    requestMethod,
    origin,
    allowedOrigins,
    mcpPath,
    supportedProtocolVersions,
    mcpStreamableHandler,
    mcpSseCompatibilityHandler,
    withCors,
    buildCorsHeaders,
    getClientIdentifier,
    getAuthRateLimitedResponse,
    recordAuthFailure,
    clearAuthFailures,
  } = params;

  if (mcpPath) {
    if (!['GET', 'POST', 'DELETE'].includes(requestMethod)) {
      return withCors(new Response('Method not allowed', { status: 405 }), origin, allowedOrigins);
    }

    if (!isAllowedOrigin(origin, allowedOrigins)) {
      return withCors(new Response('Forbidden origin', { status: 403 }), origin, allowedOrigins);
    }
  }

  if (mcpPath) {
    const clientId = getClientIdentifier(request);
    const nowMs = Date.now();
    const rateLimited = await getAuthRateLimitedResponse(clientId, env, nowMs);
    if (rateLimited) {
      return withCors(rateLimited, origin, allowedOrigins);
    }

    const authResult = await authorizeMcpGatewayRequest({
      request,
      env,
      supportedProtocolVersions,
    });
    const authError = authResult.authError;
    if (authError) {
      if (authError.status === 401 || authError.status === 403) {
        await recordAuthFailure(clientId, env, nowMs);
        const postFailureRateLimited = await getAuthRateLimitedResponse(clientId, env, nowMs);
        if (postFailureRateLimited) {
          return withCors(postFailureRateLimited, origin, allowedOrigins);
        }
      }
      return withCors(authError, origin, allowedOrigins);
    }

    const principal = authResult.principal;
    await clearAuthFailures(clientId, env, nowMs);

    if (pathname === '/sse') {
      const accept = request.headers.get('Accept') ?? '';
      if (!accept.includes('text/event-stream')) {
        return Response.json(
          {
            error: 'Not Acceptable',
            message: 'Client must include Accept: application/json, text/event-stream',
            example:
              'curl -i https://courtlistenermcp.blakeoxford.com/sse -H \'Accept: application/json, text/event-stream\' -H \'Content-Type: application/json\' -d \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}\'',
          },
          { status: 406, headers: buildCorsHeaders(origin, allowedOrigins) },
        );
      }
    }

    if (pathname === '/mcp') {
      const response = await runWithPrincipalContext(principal, () =>
        mcpStreamableHandler.fetch(request, env, ctx),
      );
      return withCors(response, origin, allowedOrigins);
    }

    if (pathname === '/sse') {
      const response = await runWithPrincipalContext(principal, () =>
        mcpSseCompatibilityHandler.fetch(request, env, ctx),
      );
      return withCors(response, origin, allowedOrigins);
    }
  }

  return null;
}
