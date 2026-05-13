import { HOSTED_MCP_OAUTH_CONTRACT } from '../auth/oauth-contract.js';
import { buildWorkerHealthPayload } from './worker-health-runtime.js';
import type { WorkerDurableRuntime, WorkerDurableRuntimeEnv } from './worker-durable-runtime.js';
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
  ctx: ExecutionContext;
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

export interface HandleWorkerCoreRoutesDeps<
  TEnv extends WorkerUiSessionRuntimeEnv & WorkerDurableRuntimeEnv,
> {
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
  isRemovedLegacyUiRoute: (pathname: string) => boolean;
  workerUiSessionRuntime: WorkerUiSessionRuntime<TEnv>;
  getCachedSessionTopology: (env: TEnv) => SessionSnapshot;
  getWorkerLatencySnapshot: () => unknown;
  getUsageSnapshot: (env: TEnv, userId: string) => Promise<unknown | null>;
  workerDurableRuntime: WorkerDurableRuntime<TEnv>;
  now: () => number;
}

export async function handleWorkerCoreRoutes<
  TEnv extends WorkerUiSessionRuntimeEnv & WorkerDurableRuntimeEnv,
>(
  context: WorkerCoreRouteContext<TEnv>,
  deps: HandleWorkerCoreRoutesDeps<TEnv>,
): Promise<Response | null> {
  const { request, origin, allowedOrigins, env, ctx, pathname, requestMethod, mcpPath } = context;

  if (
    requestMethod === 'OPTIONS' &&
    (mcpPath ||
      pathname === '/api/session' ||
      pathname === '/api/session/bootstrap' ||
      pathname === '/api/logout' ||
      pathname === '/api/usage')
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
        `Allow: ${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}`,
        'Allow: /token',
        '',
        'User-agent: GPTBot',
        'Allow: /',
        '',
        'User-agent: ChatGPT-User',
        'Allow: /',
        '',
      ].join('\n'),
      {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        },
      },
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
      return deps.withCors(
        deps.jsonError('Method not allowed', 405, 'method_not_allowed'),
        origin,
        allowedOrigins,
      );
    }
    const sessionState = await deps.workerUiSessionRuntime.resolveUiSession(request, env);
    if (sessionState.kind === 'revocation_unavailable') {
      return deps.withCors(
        deps.jsonError(
          'Unable to validate session revocation.',
          503,
          'session_revocation_unavailable',
        ),
        origin,
        allowedOrigins,
      );
    }
    const sessionUser = sessionState.kind === 'authenticated' ? sessionState : null;
    const bearerUserId = await deps.workerUiSessionRuntime.resolveCloudflareOAuthUserId(
      request,
      env,
    );
    return deps.withCors(
      deps.jsonResponse({
        authenticated: Boolean(sessionUser),
        user: sessionUser
          ? {
              id: sessionUser.userId,
              ...(sessionUser.email ? { email: sessionUser.email } : {}),
              ...(sessionUser.displayName ? { displayName: sessionUser.displayName } : {}),
            }
          : null,
        auth_backend: 'cloudflare_oauth',
        session_authenticated: Boolean(sessionUser),
        bearer_authenticated: Boolean(bearerUserId),
      }),
      origin,
      allowedOrigins,
    );
  }

  if (pathname === '/api/session/bootstrap') {
    if (requestMethod !== 'POST') {
      return deps.withCors(
        deps.jsonError('Method not allowed', 405, 'method_not_allowed'),
        origin,
        allowedOrigins,
      );
    }

    const bootstrapRateLimited =
      await deps.workerUiSessionRuntime.getSessionBootstrapRateLimitedResponse(
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

    const bootstrapVerification =
      await deps.workerUiSessionRuntime.verifyBootstrapUserIdFromAuthorization(request, env);
    if (!bootstrapVerification.identity) {
      return deps.withCors(
        buildInvalidBootstrapAssertionResponse(deps, bootstrapVerification.error),
        origin,
        allowedOrigins,
      );
    }
    const identity = bootstrapVerification.identity;

    const sessionState = await deps.workerUiSessionRuntime.createUiSessionState(
      request,
      env,
      identity,
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
        userId: identity.userId,
        expiresInSeconds: sessionState.expiresInSeconds,
      },
      200,
      headers,
    );
  }

  if (pathname === '/api/logout') {
    if (requestMethod !== 'POST') {
      return deps.withCors(
        deps.jsonError('Method not allowed', 405, 'method_not_allowed'),
        origin,
        allowedOrigins,
      );
    }

    const csrfError = deps.workerUiSessionRuntime.requireCsrfToken(request);
    if (csrfError) {
      return deps.withCors(csrfError, origin, allowedOrigins);
    }

    return deps.withCors(
      deps.jsonResponse(
        { ok: true },
        200,
        deps.workerUiSessionRuntime.buildUiSessionLogoutHeaders(request, env),
      ),
      origin,
      allowedOrigins,
    );
  }

  if (pathname === '/api/usage') {
    if (requestMethod !== 'GET') {
      return deps.withCors(
        deps.jsonError('Method not allowed', 405, 'method_not_allowed'),
        origin,
        allowedOrigins,
      );
    }

    const usageResolution = await resolveWorkerUsage({
      request,
      env,
      ctx,
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

function buildInvalidBootstrapAssertionResponse<
  TEnv extends WorkerUiSessionRuntimeEnv & WorkerDurableRuntimeEnv,
>(
  deps: Pick<HandleWorkerCoreRoutesDeps<TEnv>, 'jsonError'>,
  bootstrapError: string | null,
): Response {
  return deps.jsonError('Valid OIDC bearer token is required.', 401, 'invalid_bootstrap_token', {
    bootstrap_error: bootstrapError || 'Bootstrap bearer token verification failed.',
  });
}
