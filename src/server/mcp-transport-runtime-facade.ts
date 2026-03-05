import { runWithPrincipalContext } from '../infrastructure/principal-context.js';
import { authorizeMcpGatewayRequest } from './mcp-gateway-auth.js';
import { createInvalidSessionLifecycleResponse } from './mcp-session-lifecycle-contract.js';
import type {
  ProtocolHeaderNegotiationDiagnostics,
  WorkerSecurityEnv,
} from './worker-security.js';
import { isAllowedOrigin } from './worker-security.js';

export interface McpHandler<Env extends WorkerSecurityEnv> {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
}

export interface McpSessionValidationOptions {
  methods?: readonly string[];
}

export function getMcpSessionIdFromHeaders(headers: Pick<Headers, 'get'>): string | null {
  const sessionId = headers.get('mcp-session-id')?.trim();
  return sessionId || null;
}

export function getMcpSessionIdFromRequest(request: Request): string | null {
  return getMcpSessionIdFromHeaders(request.headers);
}

export function getMcpSessionIdFromResponse(response: Response): string | null {
  return getMcpSessionIdFromHeaders(response.headers);
}

export function setProtocolNegotiationHeaders(
  headers: Headers,
  diagnostics?: ProtocolHeaderNegotiationDiagnostics,
): void {
  if (!diagnostics) {
    return;
  }
  if (diagnostics.acceptedProtocolVersion) {
    headers.set('MCP-Protocol-Version', diagnostics.acceptedProtocolVersion);
  }
  if (diagnostics.acceptedCapabilityProfile) {
    headers.set('MCP-Capability-Profile', diagnostics.acceptedCapabilityProfile);
  }
  const reason = diagnostics.profileReason
    ? `${diagnostics.reason}:${diagnostics.profileReason}`
    : diagnostics.reason;
  headers.set('X-MCP-Protocol-Negotiation-Reason', reason);
}

export function applyProtocolNegotiationHeaders(
  response: Response,
  diagnostics?: ProtocolHeaderNegotiationDiagnostics,
): Response {
  if (!diagnostics) {
    return response;
  }
  const headers = new Headers(response.headers);
  setProtocolNegotiationHeaders(headers, diagnostics);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function validateSessionLifecycleRequest<Env>(
  request: Request,
  env: Env,
  nowMs: number,
  validateSession: (sessionId: string, request: Request, env: Env, nowMs: number) => Promise<boolean | null>,
  options: McpSessionValidationOptions = {},
): Promise<Response | null> {
  const methods = options.methods ?? ['POST', 'DELETE'];
  if (!methods.includes(request.method)) {
    return null;
  }
  const sessionId = getMcpSessionIdFromRequest(request);
  if (!sessionId) {
    return null;
  }
  const active = await validateSession(sessionId, request, env, nowMs);
  if (active === null || active) {
    return null;
  }
  return createInvalidSessionLifecycleResponse();
}

export async function finalizeSessionLifecycleResponse<Env>(
  request: Request,
  response: Response,
  env: Env,
  nowMs: number,
  callbacks: {
    registerSession?: (sessionId: string, request: Request, response: Response, env: Env, nowMs: number) => Promise<void>;
    closeSession?: (sessionId: string, request: Request, response: Response, env: Env, nowMs: number) => Promise<void>;
  },
): Promise<void> {
  if (request.method === 'POST') {
    const sessionId = getMcpSessionIdFromResponse(response);
    if (sessionId && callbacks.registerSession) {
      await callbacks.registerSession(sessionId, request, response, env, nowMs);
    }
    return;
  }

  if (request.method !== 'DELETE') {
    return;
  }

  const sessionId = getMcpSessionIdFromRequest(request);
  if (!sessionId || !callbacks.closeSession) {
    return;
  }
  await callbacks.closeSession(sessionId, request, response, env, nowMs);
}

export interface HandleMcpTransportBoundaryParams<
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
  evaluateMcpBoundaryRequest?: (
    request: Request,
    env: Env,
    clientId: string,
    nowMs: number,
  ) => Promise<Response | null>;
  validateSessionRequest?: (request: Request, env: Env, nowMs: number) => Promise<Response | null>;
  finalizeSessionResponse?: (
    request: Request,
    response: Response,
    env: Env,
    nowMs: number,
  ) => Promise<void>;
}

export async function handleMcpTransportBoundary<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
>(params: HandleMcpTransportBoundaryParams<Env>): Promise<Response | null> {
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
    evaluateMcpBoundaryRequest,
    validateSessionRequest,
    finalizeSessionResponse,
  } = params;

  if (!mcpPath) {
    return null;
  }

  if (!['GET', 'POST', 'DELETE'].includes(requestMethod)) {
    return withCors(new Response('Method not allowed', { status: 405 }), origin, allowedOrigins);
  }

  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return withCors(new Response('Forbidden origin', { status: 403 }), origin, allowedOrigins);
  }

  const clientId = getClientIdentifier(request);
  const nowMs = Date.now();
  const rateLimited = await getAuthRateLimitedResponse(clientId, env, nowMs);
  if (rateLimited) {
    return withCors(rateLimited, origin, allowedOrigins);
  }

  if (evaluateMcpBoundaryRequest) {
    const abuseError = await evaluateMcpBoundaryRequest(request, env, clientId, nowMs);
    if (abuseError) {
      return withCors(abuseError, origin, allowedOrigins);
    }
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
    return withCors(applyProtocolNegotiationHeaders(authError, authResult.protocolNegotiation), origin, allowedOrigins);
  }

  await clearAuthFailures(clientId, env, nowMs);
  const principal = authResult.principal;

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
    if (validateSessionRequest) {
      const sessionError = await validateSessionRequest(request, env, nowMs);
      if (sessionError) {
        return withCors(sessionError, origin, allowedOrigins);
      }
    }

    const response = await runWithPrincipalContext(principal, () =>
      mcpStreamableHandler.fetch(request, env, ctx),
    );
    if (finalizeSessionResponse) {
      await finalizeSessionResponse(request, response, env, nowMs);
    }
    return withCors(
      applyProtocolNegotiationHeaders(response, authResult.protocolNegotiation),
      origin,
      allowedOrigins,
    );
  }

  if (pathname === '/sse') {
    const response = await runWithPrincipalContext(principal, () =>
      mcpSseCompatibilityHandler.fetch(request, env, ctx),
    );
    return withCors(
      applyProtocolNegotiationHeaders(response, authResult.protocolNegotiation),
      origin,
      allowedOrigins,
    );
  }

  return null;
}
