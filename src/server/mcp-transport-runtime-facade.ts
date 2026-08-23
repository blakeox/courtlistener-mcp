import { runWithPrincipalContext } from '../infrastructure/principal-context.js';
import { emitOAuthDiagnostic } from './oauth-diagnostics.js';
import { getPrevalidatedOAuthIdentity } from './prevalidated-oauth-context.js';
import { authorizeMcpGatewayRequest } from './mcp-gateway-auth.js';
import type {
  McpRequestPrincipal,
  ProtocolHeaderNegotiationDiagnostics,
  WorkerSecurityEnv,
} from './worker-security.js';
import type { AuthRateLimitProbeResult } from './worker-runtime-contract.js';
import { isAllowedOrigin } from './worker-security.js';

export interface McpHandler<Env extends WorkerSecurityEnv> {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
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
    response_status: response.status,
    response_content_type: response.headers.get('content-type'),
    auth_method: principal?.authMethod ?? null,
    user_present: Boolean(principal?.userId),
  };
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
  withCors: (response: Response, origin: string | null, allowedOrigins: string[]) => Response;
  getClientIdentifier: (request: Request) => string;
  getAuthRateLimitedResponse: (
    clientId: string,
    env: Env,
    nowMs: number,
  ) => Promise<Response | null>;
  probeAuthRateLimit?: (
    clientId: string,
    env: Env,
    nowMs: number,
  ) => Promise<AuthRateLimitProbeResult>;
  recordAuthFailure: (clientId: string, env: Env, nowMs: number) => Promise<void>;
  clearAuthFailures: (
    clientId: string,
    env: Env,
    nowMs: number,
    hadFailureState?: boolean,
  ) => Promise<void>;
  skipGatewayAuth?: boolean;
  evaluateMcpBoundaryRequest?: (
    request: Request,
    env: Env,
    clientId: string,
    nowMs: number,
  ) => Promise<Response | null>;
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
    withCors,
    getClientIdentifier,
    getAuthRateLimitedResponse,
    probeAuthRateLimit,
    recordAuthFailure,
    clearAuthFailures,
    skipGatewayAuth,
    evaluateMcpBoundaryRequest,
    onAuthorizedRequest,
  } = params;

  if (!mcpPath) {
    return null;
  }

  if (requestMethod !== 'POST') {
    return withCors(
      new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'POST, OPTIONS' },
      }),
      origin,
      allowedOrigins,
    );
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
    // Only trust the explicit provider-owned ExecutionContext boundary for the
    // prevalidated OAuth fast path. Never reconstruct principal state from
    // user-controlled request headers here.
    const prevalidatedIdentity = getPrevalidatedOAuthIdentity(ctx);
    if (!prevalidatedIdentity) {
      return withCors(
        Response.json(
          {
            error: 'invalid_prevalidated_oauth_context',
            message: 'Validated OAuth context is required for the internal provider fast path.',
          },
          { status: 401 },
        ),
        origin,
        allowedOrigins,
      );
    }
    principal = prevalidatedIdentity;
  } else {
    // Standard direct-access path: validate credentials via gateway auth
    // with rate-limiting and protocol-version enforcement.
    const clientId = getClientIdentifier(request);
    const authRateLimitProbe = probeAuthRateLimit
      ? await probeAuthRateLimit(clientId, env, nowMs)
      : ({
          kind: 'allowed',
          hasFailureState: false,
        } satisfies AuthRateLimitProbeResult);
    if (authRateLimitProbe.kind !== 'allowed') {
      return withCors(authRateLimitProbe.response, origin, allowedOrigins);
    }
    const hadAuthFailureState = authRateLimitProbe.hasFailureState;

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
      return withCors(
        applyProtocolNegotiationHeaders(authError, authResult.protocolNegotiation),
        origin,
        allowedOrigins,
      );
    }

    await clearAuthFailures(clientId, env, nowMs, hadAuthFailureState);
    principal = authResult.principal;
    protocolNegotiation = authResult.protocolNegotiation;
  }

  if (onAuthorizedRequest) {
    await onAuthorizedRequest(request, env, principal, nowMs);
  }

  if (pathname === '/mcp') {
    const response = await runWithPrincipalContext(principal, () =>
      mcpStreamableHandler.fetch(request, env, ctx),
    );
    const finalizedResponse = applyProtocolNegotiationHeaders(response, protocolNegotiation);
    emitOAuthDiagnostic(
      env as WorkerSecurityEnv & { MCP_OAUTH_DIAGNOSTICS?: string },
      'mcp.transport.response',
      summarizeMcpTransportExchange(request, finalizedResponse, principal),
    );
    return withCors(finalizedResponse, origin, allowedOrigins);
  }

  return null;
}
