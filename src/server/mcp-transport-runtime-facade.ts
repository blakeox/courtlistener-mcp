import { runWithPrincipalContext } from '../infrastructure/principal-context.js';
import { emitOAuthDiagnostic } from './oauth-diagnostics.js';
import { authorizeMcpGatewayRequest } from './mcp-gateway-auth.js';
import { createInvalidSessionLifecycleResponse } from './mcp-session-lifecycle-contract.js';
import type {
  McpRequestPrincipal,
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

function summarizeMcpTransportExchange(
  request: Request,
  response: Response,
  principal?: McpRequestPrincipal,
): Record<string, unknown> {
  return {
    method: request.method,
    pathname: new URL(request.url).pathname,
    user_agent: request.headers.get('user-agent'),
    accept: request.headers.get('accept'),
    request_content_type: request.headers.get('content-type'),
    request_protocol_version: request.headers.get('MCP-Protocol-Version'),
    request_capability_profile: request.headers.get('MCP-Capability-Profile'),
    request_session_id_present: Boolean(getMcpSessionIdFromRequest(request)),
    response_status: response.status,
    response_content_type: response.headers.get('content-type'),
    response_session_id_present: Boolean(getMcpSessionIdFromResponse(response)),
    auth_method: principal?.authMethod ?? null,
    user_present: Boolean(principal?.userId),
  };
}

function rewriteRequestPath(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

function createPassiveEventStreamResponse(): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  void writer.write(new TextEncoder().encode(': connected\n\n'));
  return new Response(readable, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
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

async function normalizePostMcpResponse(response: Response, requestMethod: string): Promise<Response> {
  if (requestMethod !== 'POST') {
    return response;
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() || '';
  if (!contentType.includes('text/event-stream')) {
    return response;
  }

  const bodyText = await response.text();
  const dataLines = bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (dataLines.length === 0) {
    return new Response(bodyText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');
  return new Response(dataLines.join('\n'), {
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
  skipGatewayAuth?: boolean;
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
  onAuthorizedRequest?: (
    request: Request,
    env: Env,
    principal: McpRequestPrincipal | undefined,
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
    skipGatewayAuth,
    evaluateMcpBoundaryRequest,
    validateSessionRequest,
    finalizeSessionResponse,
    onAuthorizedRequest,
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

  // -------------------------------------------------------------------------
  // Auth: two paths depending on whether the Cloudflare OAuth provider
  // already validated the bearer token (skipGatewayAuth=true) or we need
  // to run the full gateway auth check ourselves.
  // -------------------------------------------------------------------------

  let principal: McpRequestPrincipal | undefined;
  let protocolNegotiation: ProtocolHeaderNegotiationDiagnostics | undefined;
  const nowMs = Date.now();

  if (skipGatewayAuth) {
    // The Cloudflare OAuth provider already validated the bearer token and
    // injected identity headers. Trust those headers and skip every
    // secondary check (gateway auth, rate-limiter, protocol-version gate).
    // This matches the Happy Fox pattern: single auth point.
    const oauthUserId = request.headers.get('x-oauth-user-id')?.trim() || null;
    const oauthAuthMethod = request.headers.get('x-oauth-auth-method')?.trim() || 'oauth';
    principal = oauthUserId
      ? { authMethod: oauthAuthMethod as McpRequestPrincipal['authMethod'], userId: oauthUserId }
      : undefined;
  } else {
    // Standard direct-access path: validate credentials via gateway auth
    // with rate-limiting and protocol-version enforcement.
    const clientId = getClientIdentifier(request);
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
    principal = authResult.principal;
    protocolNegotiation = authResult.protocolNegotiation;
  }

  if (onAuthorizedRequest) {
    await onAuthorizedRequest(request, env, principal, nowMs);
  }

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
    const normalizedResponse = await normalizePostMcpResponse(response, requestMethod);
    if (finalizeSessionResponse) {
      await finalizeSessionResponse(request, normalizedResponse, env, nowMs);
    }
    const finalizedResponse = applyProtocolNegotiationHeaders(normalizedResponse, protocolNegotiation);
    emitOAuthDiagnostic(
      env as WorkerSecurityEnv & { MCP_OAUTH_DIAGNOSTICS?: string },
      'mcp.transport.response',
      summarizeMcpTransportExchange(request, finalizedResponse, principal),
    );
    return withCors(
      finalizedResponse,
      origin,
      allowedOrigins,
    );
  }

  if (pathname === '/sse') {
    const response = await runWithPrincipalContext(principal, () =>
      mcpSseCompatibilityHandler.fetch(request, env, ctx),
    );
    return withCors(
      applyProtocolNegotiationHeaders(response, protocolNegotiation),
      origin,
      allowedOrigins,
    );
  }

  return null;
}
