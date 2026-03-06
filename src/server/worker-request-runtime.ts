import type { HandleWorkerCoreRoutesDeps } from './worker-core-routes.js';
import { handleWorkerCoreRoutes } from './worker-core-routes.js';
import type {
  WorkerDelegatedRouteContext,
  WorkerDelegatedRouteDeps,
} from './worker-route-composition.js';
import { handleDelegatedWorkerRoutes } from './worker-route-composition.js';

export interface WorkerRequestRuntimeEnv {
  MCP_ALLOWED_ORIGINS?: string;
  MCP_AUTH_UI_ORIGIN?: string;
}

interface WorkerLegacyFetchOptions {
  skipGatewayAuth?: boolean;
}

export interface CreateWorkerLegacyFetchHandlerDeps<TEnv extends WorkerRequestRuntimeEnv> {
  getRequestOrigin: (request: Request) => string | null;
  getCachedAllowedOrigins: (
    rawAllowedOrigins: string | undefined,
    authUiOriginRaw?: string,
  ) => string[];
  isMcpPath: (pathname: string) => boolean;
  buildWorkerRouteMetricKey: (method: string, pathname: string) => string;
  recordRouteLatency: (route: string, elapsedMs: number) => void;
  now: () => number;
  workerCoreRouteDeps: HandleWorkerCoreRoutesDeps<TEnv>;
  workerDelegatedRouteDeps: WorkerDelegatedRouteDeps<TEnv>;
}

function withOptionalGatewayAuthBypass<
  TDeps extends { mcpBoundaryPolicy: object },
>(
  deps: TDeps,
  skipGatewayAuth: boolean,
): TDeps {
  if (!skipGatewayAuth) {
    return deps;
  }

  return {
    ...deps,
    mcpBoundaryPolicy: {
      ...deps.mcpBoundaryPolicy,
      skipGatewayAuth: true,
    },
  } as TDeps;
}

export function createWorkerLegacyFetchHandler<TEnv extends WorkerRequestRuntimeEnv>(
  deps: CreateWorkerLegacyFetchHandlerDeps<TEnv>,
) {
  return async function handleLegacyWorkerFetch(
    request: Request,
    env: TEnv,
    ctx: ExecutionContext,
    options: WorkerLegacyFetchOptions = {},
  ): Promise<Response> {
    const url = new URL(request.url);
    const requestMethod = request.method;
    const pathname = url.pathname;
    const origin = deps.getRequestOrigin(request);
    const allowedOrigins = deps.getCachedAllowedOrigins(env.MCP_ALLOWED_ORIGINS, env.MCP_AUTH_UI_ORIGIN);
    const mcpPath = deps.isMcpPath(pathname);
    const requestStartedAt = deps.now();
    const routeMetricKey = deps.buildWorkerRouteMetricKey(requestMethod, pathname);

    const routeContext: WorkerDelegatedRouteContext<TEnv> = {
      request,
      url,
      origin,
      allowedOrigins,
      env,
      ctx,
      pathname,
      requestMethod,
      mcpPath,
    };

    try {
      const coreRouteResponse = await handleWorkerCoreRoutes(routeContext, deps.workerCoreRouteDeps);
      if (coreRouteResponse) {
        return coreRouteResponse;
      }

      const delegatedRouteResponse = await handleDelegatedWorkerRoutes(
        routeContext,
        withOptionalGatewayAuthBypass(
          deps.workerDelegatedRouteDeps,
          Boolean(options.skipGatewayAuth),
        ),
      );
      if (delegatedRouteResponse) {
        return delegatedRouteResponse;
      }

      return new Response('Not found', { status: 404 });
    } finally {
      deps.recordRouteLatency(routeMetricKey, deps.now() - requestStartedAt);
    }
  };
}
