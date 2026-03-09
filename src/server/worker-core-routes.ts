import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { buildHostedOAuthCompletionDetails } from '../auth/oauth-authorization-completion.js';
import { HOSTED_MCP_OAUTH_CONTRACT } from '../auth/oauth-contract.js';
import { resolveGrantedScopes } from '../auth/oauth-scope-resolver.js';
import { buildWorkerHealthPayload } from './worker-health-runtime.js';
import { resolveWorkerUsage } from './worker-usage-runtime.js';
import type {
  WorkerUiSessionRuntime,
  WorkerUiSessionRuntimeEnv,
} from './worker-ui-session-runtime.js';

interface WorkerCoreRouteContext<TEnv> {
  request: Request;
  url: URL;
  origin: string | null;
  allowedOrigins: string[];
  env: TEnv;
  pathname: string;
  requestMethod: string;
  mcpPath: boolean;
}

interface SessionSnapshot {
  version: string;
  shardCount: number;
  idleTtlMs: number;
  absoluteTtlMs: number;
  evictionSweepLimit: number;
}

export interface HandleWorkerCoreRoutesDeps<TEnv extends WorkerUiSessionRuntimeEnv> {
  isAllowedOrigin: (origin: string | null, allowedOrigins: string[]) => boolean;
  buildCorsHeaders: (origin: string | null, allowedOrigins: string[]) => Headers;
  withCors: (response: Response, origin: string | null, allowedOrigins: string[]) => Response;
  jsonError: (
    message: string,
    status: number,
    errorCode: string,
    extra?: Record<string, unknown>,
    extraHeaders?: HeadersInit,
  ) => Response;
  jsonResponse: (payload: unknown, status?: number, extraHeaders?: HeadersInit) => Response;
  getOAuthHelpers: (env: TEnv) => OAuthHelpers;
  isRemovedLegacyUiRoute: (pathname: string) => boolean;
  workerUiSessionRuntime: WorkerUiSessionRuntime<TEnv>;
  getCachedSessionTopology: (env: TEnv) => SessionSnapshot;
  getWorkerLatencySnapshot: () => unknown;
  getUsageSnapshot: (env: TEnv, userId: string) => Promise<unknown | null>;
  now: () => number;
}

export async function handleWorkerCoreRoutes<TEnv extends WorkerUiSessionRuntimeEnv>(
  context: WorkerCoreRouteContext<TEnv>,
  deps: HandleWorkerCoreRoutesDeps<TEnv>,
): Promise<Response | null> {
  const { request, origin, allowedOrigins, env, pathname, requestMethod, mcpPath } = context;

  if (
    requestMethod === 'OPTIONS'
    && (
      mcpPath
      || pathname === '/api/session'
      || pathname === '/api/session/bootstrap'
      || pathname === '/api/session/oauth-complete'
      || pathname === '/api/usage'
    )
  ) {
    if (!deps.isAllowedOrigin(origin, allowedOrigins)) {
      return new Response('Forbidden origin', { status: 403 });
    }
    return new Response(null, { headers: deps.buildCorsHeaders(origin, allowedOrigins) });
  }

  // Serve a permissive robots.txt so ChatGPT (GPTBot / ChatGPT-User) can
  // discover and register via MCP OAuth.  Cloudflare's managed robots.txt
  // injects "GPTBot Disallow: /" which prevents ChatGPT from connecting.
  if (pathname === '/robots.txt') {
    return new Response(
      [
        'User-agent: *',
        'Allow: /.well-known/',
        'Allow: /register',
        'Allow: /mcp',
        'Allow: /authorize',
        'Allow: /token',
        '',
        'User-agent: GPTBot',
        'Allow: /',
        '',
        'User-agent: ChatGPT-User',
        'Allow: /',
        '',
      ].join('\n'),
      { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } },
    );
  }

  if (pathname === '/health') {
    const sessionTopology = deps.getCachedSessionTopology(env);
    return deps.jsonResponse(
      buildWorkerHealthPayload(sessionTopology, deps.getWorkerLatencySnapshot()),
    );
  }

  if (pathname === '/api/session') {
    if (requestMethod !== 'GET') {
      return deps.withCors(deps.jsonError('Method not allowed', 405, 'method_not_allowed'), origin, allowedOrigins);
    }
    const sessionUserId = await deps.workerUiSessionRuntime.resolveUiSessionUserId(request, env);
    const bearerUserId = await deps.workerUiSessionRuntime.resolveCloudflareOAuthUserId(request, env);
    return deps.withCors(
      deps.jsonResponse({
        authenticated: Boolean(sessionUserId),
        user: sessionUserId ? { id: sessionUserId } : null,
        auth_backend: 'cloudflare_oauth',
        session_authenticated: Boolean(sessionUserId),
        bearer_authenticated: Boolean(bearerUserId),
      }),
      origin,
      allowedOrigins,
    );
  }

  if (pathname === '/api/session/bootstrap') {
    if (requestMethod !== 'POST') {
      return deps.withCors(deps.jsonError('Method not allowed', 405, 'method_not_allowed'), origin, allowedOrigins);
    }

    const bootstrapRateLimited = await deps.workerUiSessionRuntime.getSessionBootstrapRateLimitedResponse(
      request,
      env,
      deps.now(),
    );
    if (bootstrapRateLimited) {
      return deps.withCors(bootstrapRateLimited, origin, allowedOrigins);
    }

    const sessionSecret = deps.workerUiSessionRuntime.getUiSessionSecret(env);
    if (!sessionSecret) {
      return deps.withCors(
        deps.jsonError('Session signing secret is not configured.', 503, 'session_secret_missing'),
        origin,
        allowedOrigins,
      );
    }

    const bootstrapVerification = await deps.workerUiSessionRuntime.verifyBootstrapUserIdFromAuthorization(request, env);
    if (!bootstrapVerification.userId) {
      return deps.withCors(
        buildInvalidBootstrapAssertionResponse(deps, bootstrapVerification.error),
        origin,
        allowedOrigins,
      );
    }
    const userId = bootstrapVerification.userId;

    const sessionState = await deps.workerUiSessionRuntime.createUiSessionState(
      request,
      env,
      userId,
      sessionSecret,
    );
    if (!sessionState) {
      return deps.withCors(
        deps.jsonError('Unable to create a valid UI session.', 500, 'session_creation_failed'),
        origin,
        allowedOrigins,
      );
    }

    const headers = sessionState.headers;
    if (origin && deps.isAllowedOrigin(origin, allowedOrigins)) {
      const corsHeaders = deps.buildCorsHeaders(origin, allowedOrigins);
      for (const [key, value] of corsHeaders.entries()) {
        headers.set(key, value);
      }
    }

    return deps.jsonResponse(
      {
        ok: true,
        userId,
        expiresInSeconds: sessionState.expiresInSeconds,
      },
      200,
      headers,
    );
  }

  if (pathname === '/api/session/oauth-complete') {
    if (requestMethod !== 'POST') {
      return deps.withCors(deps.jsonError('Method not allowed', 405, 'method_not_allowed'), origin, allowedOrigins);
    }

    const body = await parseOauthCompletionRequest(request);
    if (!body?.returnTo) {
      return deps.withCors(
        deps.jsonError('return_to is required.', 400, 'invalid_oauth_completion_request'),
        origin,
        allowedOrigins,
      );
    }

    const authorizationUrl = validateOauthCompletionReturnTo(body.returnTo, request.url);
    if (!authorizationUrl) {
      return deps.withCors(
        deps.jsonError(
          'return_to must be a valid /authorize URL on this worker origin.',
          400,
          'invalid_oauth_completion_request',
        ),
        origin,
        allowedOrigins,
      );
    }

    const bootstrapVerification = await deps.workerUiSessionRuntime.verifyBootstrapUserIdFromAuthorization(request, env);
    if (!bootstrapVerification.userId) {
      return deps.withCors(
        buildInvalidBootstrapAssertionResponse(deps, bootstrapVerification.error),
        origin,
        allowedOrigins,
      );
    }

    const oauthHelpers = deps.getOAuthHelpers(env);
    let authRequest;
    try {
      authRequest = await oauthHelpers.parseAuthRequest(new Request(authorizationUrl.toString()));
    } catch {
      return deps.withCors(
        deps.jsonError('Invalid OAuth authorization request.', 400, 'invalid_authorization_request'),
        origin,
        allowedOrigins,
      );
    }

    const grantedScopes = resolveGrantedScopes(authRequest);

    try {
      const completionDetails = buildHostedOAuthCompletionDetails(
        'browser_oauth_complete',
        bootstrapVerification.userId,
      );
      const completion = await oauthHelpers.completeAuthorization({
        request: authRequest,
        userId: bootstrapVerification.userId,
        metadata: completionDetails.metadata,
        scope: grantedScopes,
        props: completionDetails.props,
      });
      return deps.withCors(
        deps.jsonResponse({
          ok: true,
          userId: bootstrapVerification.userId,
          redirectTo: completion.redirectTo,
        }),
        origin,
        allowedOrigins,
      );
    } catch (error) {
      return deps.withCors(
        deps.jsonError(
          error instanceof Error && error.message
            ? error.message
            : 'OAuth authorization could not be completed.',
          400,
          'authorization_completion_failed',
        ),
        origin,
        allowedOrigins,
      );
    }
  }

  if (pathname === '/api/usage') {
    if (requestMethod !== 'GET') {
      return deps.withCors(deps.jsonError('Method not allowed', 405, 'method_not_allowed'), origin, allowedOrigins);
    }

    const usageResolution = await resolveWorkerUsage({
      request,
      env,
      workerUiSessionRuntime: deps.workerUiSessionRuntime,
      getUsageSnapshot: deps.getUsageSnapshot,
    });
    if (usageResolution.kind === 'unauthenticated') {
      return deps.withCors(
        deps.jsonError('Authentication required.', 401, 'authentication_required'),
        origin,
        allowedOrigins,
      );
    }
    if (usageResolution.kind === 'unavailable') {
      return deps.withCors(
        deps.jsonError('Unable to load usage snapshot.', 503, 'usage_unavailable'),
        origin,
        allowedOrigins,
      );
    }
    return deps.withCors(deps.jsonResponse(usageResolution.snapshot), origin, allowedOrigins);
  }

  if (deps.isRemovedLegacyUiRoute(pathname)) {
    return deps.jsonError(
      'Legacy UI auth/key routes were removed in the Cloudflare OAuth hard cutover. Use OAuth endpoints (/authorize, /token, /register) and MCP bearer tokens.',
      410,
      'legacy_routes_removed',
    );
  }

  return null;
}

async function parseOauthCompletionRequest(
  request: Request,
): Promise<{ returnTo: string | null } | null> {
  try {
    const body = (await request.json()) as { return_to?: unknown };
    const returnTo =
      typeof body?.return_to === 'string' && body.return_to.trim().length > 0
        ? body.return_to.trim()
        : null;
    return { returnTo };
  } catch {
    return null;
  }
}

function validateOauthCompletionReturnTo(returnTo: string, requestUrl: string): URL | null {
  try {
    const requestOrigin = new URL(requestUrl).origin;
    const url = new URL(returnTo);
    if (url.origin !== requestOrigin || url.pathname !== HOSTED_MCP_OAUTH_CONTRACT.paths.authorize) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function buildInvalidBootstrapAssertionResponse<TEnv extends WorkerUiSessionRuntimeEnv>(
  deps: Pick<HandleWorkerCoreRoutesDeps<TEnv>, 'jsonError'>,
  bootstrapError: string | null,
): Response {
  return deps.jsonError(
    'Valid OIDC bearer token is required.',
    401,
    'invalid_bootstrap_token',
    { bootstrap_error: bootstrapError || 'Bootstrap bearer token verification failed.' },
  );
}
