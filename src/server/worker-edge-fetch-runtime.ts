import type { HandleWorkerCoreRoutesDeps } from './worker-core-routes.js';
import { handleWorkerCoreRoutes } from './worker-core-routes.js';
import type { WorkerDurableRuntimeEnv } from './worker-durable-runtime.js';
import type { WorkerUiSessionRuntimeEnv } from './worker-ui-session-runtime.js';
import {
  handleDelegatedEdgeWorkerRoutes,
  type WorkerEdgeDelegatedRouteDeps,
} from './worker-route-composition.js';

export interface WorkerEdgeFetchRuntimeEnv
  extends WorkerUiSessionRuntimeEnv, WorkerDurableRuntimeEnv {
  MCP_ALLOWED_ORIGINS?: string;
}

export interface CreateWorkerEdgeFetchHandlerDeps<TEnv extends WorkerEdgeFetchRuntimeEnv> {
  getRequestOrigin: (request: Request) => string | null;
  getCachedAllowedOrigins: (rawAllowedOrigins: string | undefined) => string[];
  buildWorkerRouteMetricKey: (method: string, pathname: string) => string;
  recordRouteLatency: (route: string, elapsedMs: number) => void;
  now: () => number;
  /** Forward authenticated public MCP traffic to the private MCP Worker. */
  forwardMcpRequest?: (request: Request, env: TEnv, ctx: ExecutionContext) => Promise<Response>;
  workerCoreRouteDeps: HandleWorkerCoreRoutesDeps<TEnv>;
  workerEdgeDelegatedRouteDeps: WorkerEdgeDelegatedRouteDeps<TEnv>;
}

export function createWorkerEdgeFetchHandler<TEnv extends WorkerEdgeFetchRuntimeEnv>(
  deps: CreateWorkerEdgeFetchHandlerDeps<TEnv>,
) {
  return async function handleEdgeWorkerFetch(
    request: Request,
    env: TEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const requestMethod = request.method;
    const pathname = url.pathname;
    const origin = deps.getRequestOrigin(request);
    const allowedOrigins = deps.getCachedAllowedOrigins(env.MCP_ALLOWED_ORIGINS);
    const requestStartedAt = deps.now();
    const routeMetricKey = deps.buildWorkerRouteMetricKey(requestMethod, pathname);

    try {
      if ((pathname === '/mcp' || pathname === '/sse') && deps.forwardMcpRequest) {
        return await deps.forwardMcpRequest(request, env, ctx);
      }

      const coreRouteResponse = await handleWorkerCoreRoutes(
        {
          request,
          url,
          origin,
          allowedOrigins,
          env,
          ctx,
          pathname,
          requestMethod,
          mcpPath: false,
        },
        deps.workerCoreRouteDeps,
      );
      if (coreRouteResponse) {
        return coreRouteResponse;
      }

      const delegatedRouteResponse = await handleDelegatedEdgeWorkerRoutes(
        {
          request,
          url,
          origin,
          allowedOrigins,
          env,
          ctx,
          pathname,
          requestMethod,
          mcpPath: false,
        },
        deps.workerEdgeDelegatedRouteDeps,
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
