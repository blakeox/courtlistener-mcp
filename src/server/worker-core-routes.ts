import { HOSTED_MCP_OAUTH_CONTRACT } from '../auth/oauth-contract.js';
import {
  buildRuntimeReadinessPayload,
  runtimeReadinessStatusCode,
  type RuntimeReadinessCheck,
  type RuntimeWorkerRole,
} from '../infrastructure/runtime-readiness-contract.js';
import { buildWorkerHealthPayload } from './worker-health-runtime.js';
import type { WorkerDurableRuntime, WorkerDurableRuntimeEnv } from './worker-durable-runtime.js';
import { resolveWorkerUsage } from './worker-usage-runtime.js';
import type {
  WorkerUiSessionRuntime,
  WorkerUiSessionRuntimeEnv,
} from './worker-ui-session-runtime.js';
import { getTurnstileSiteKey, verifyTurnstileForRoute } from './worker-turnstile.js';

function parseCsv(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

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

const ALLOWED_UI_TELEMETRY_EVENTS = new Set([
  'browser_session_bootstrap_attempted',
  'browser_session_bootstrap_succeeded',
  'browser_session_bootstrap_failed',
  'browser_session_bootstrap_turnstile_refreshed',
]);

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
  getClientIdentifier?: (request: Request) => string;
  recordTurnstileVerdict?: (routeId: string, outcome: 'passed' | 'failed' | 'not_enforced') => void;
  workerRole?: RuntimeWorkerRole;
  getReadinessResponse?: (
    request: Request,
    env: TEnv,
    ctx: ExecutionContext,
  ) => Promise<Response | null>;
  recordUiEvent?: (
    eventName: string,
    userId: string | null,
    route: string,
    outcome: string,
  ) => void;
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
      pathname === '/api/usage' ||
      pathname === '/api/telemetry')
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

  if (pathname === '/ready') {
    if (requestMethod !== 'GET') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }

    try {
      const delegatedResponse = await deps.getReadinessResponse?.(request, env, ctx);
      if (delegatedResponse) {
        return delegatedResponse;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const payload = buildRuntimeReadinessPayload({
        workerRole: deps.workerRole ?? 'unknown',
        checks: {
          runtime: { status: 'fail', message: `Readiness probe failed: ${message}` },
        },
      });
      return deps.jsonResponse(payload, runtimeReadinessStatusCode(payload.status));
    }

    const payload = buildRuntimeReadinessPayload({
      workerRole: deps.workerRole ?? 'unknown',
      checks: {
        runtime: { status: 'pass', message: 'Worker request runtime is available.' },
      } satisfies Record<string, RuntimeReadinessCheck>,
    });
    return deps.jsonResponse(payload, runtimeReadinessStatusCode(payload.status));
  }

  if (pathname === '/health') {
    const sessionTopology = deps.getCachedSessionTopology(env);
    return deps.jsonResponse(
      buildWorkerHealthPayload(sessionTopology, deps.getWorkerLatencySnapshot(), {
        analyticsEnabled:
          (env as { MCP_CF_ANALYTICS_ENABLED?: string }).MCP_CF_ANALYTICS_ENABLED === 'true',
        asyncQueueConfigured: Boolean('ASYNC_TOOL_QUEUE' in env && env.ASYNC_TOOL_QUEUE),
        asyncJobsKvConfigured: Boolean('ASYNC_JOBS_KV' in env && env.ASYNC_JOBS_KV),
        turnstileEnforcedRoutes: parseCsv(
          (env as { MCP_TURNSTILE_ENFORCED_ROUTES?: string }).MCP_TURNSTILE_ENFORCED_ROUTES,
        ),
      }),
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
        turnstile_site_key: getTurnstileSiteKey(env as Parameters<typeof getTurnstileSiteKey>[0]),
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

    const turnstile = await verifyTurnstileForRoute(
      request,
      env as Parameters<typeof verifyTurnstileForRoute>[1],
      'session_bootstrap',
      deps.getClientIdentifier ? deps.getClientIdentifier(request) : null,
    );
    deps.recordTurnstileVerdict?.(
      'session_bootstrap',
      turnstile.enforced ? (turnstile.success ? 'passed' : 'failed') : 'not_enforced',
    );
    if (!turnstile.success) {
      return deps.withCors(
        deps.jsonError(
          turnstile.reason || 'Turnstile verification failed.',
          turnstile.errorCode === 'turnstile_verification_unavailable' ? 503 : 403,
          turnstile.errorCode || 'turnstile_verification_failed',
        ),
        origin,
        allowedOrigins,
      );
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

    return deps.withCors(
      deps.jsonResponse(
        {
          ok: true,
          userId: identity.userId,
          expiresInSeconds: sessionState.expiresInSeconds,
        },
        200,
        sessionState.headers,
      ),
      origin,
      allowedOrigins,
    );
  }

  if (pathname === '/api/telemetry') {
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

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return deps.withCors(
        deps.jsonError('Telemetry payload must be valid JSON.', 400, 'invalid_json'),
        origin,
        allowedOrigins,
      );
    }

    if (!payload || typeof payload !== 'object') {
      return deps.withCors(
        deps.jsonError('Telemetry payload must be an object.', 400, 'invalid_payload'),
        origin,
        allowedOrigins,
      );
    }

    const eventName =
      typeof (payload as { name?: unknown }).name === 'string'
        ? (payload as { name: string }).name.trim()
        : '';
    const route =
      typeof (payload as { route?: unknown }).route === 'string'
        ? (payload as { route: string }).route.trim()
        : '';
    const outcome =
      typeof (payload as { outcome?: unknown }).outcome === 'string'
        ? (payload as { outcome: string }).outcome.trim()
        : '';

    if (!eventName || !ALLOWED_UI_TELEMETRY_EVENTS.has(eventName)) {
      return deps.withCors(
        deps.jsonError('Telemetry event is not allowed.', 400, 'invalid_event_name'),
        origin,
        allowedOrigins,
      );
    }

    if (!route || route.length > 128 || !outcome || outcome.length > 64) {
      return deps.withCors(
        deps.jsonError('Telemetry route or outcome is invalid.', 400, 'invalid_event_payload'),
        origin,
        allowedOrigins,
      );
    }

    const sessionState = await deps.workerUiSessionRuntime.resolveUiSession(request, env);
    const userId = sessionState.kind === 'authenticated' ? sessionState.userId : null;
    deps.recordUiEvent?.(eventName, userId, route, outcome);
    if (userId) {
      await deps.workerDurableRuntime.recordUserUiEvent(env, userId, eventName, outcome);
    }

    return deps.withCors(deps.jsonResponse({ ok: true }), origin, allowedOrigins);
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
