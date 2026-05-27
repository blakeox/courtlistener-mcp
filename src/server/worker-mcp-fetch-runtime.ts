import type { HandleWorkerCoreRoutesDeps } from './worker-core-routes.js';
import { handleWorkerCoreRoutes } from './worker-core-routes.js';
import type { WorkerDurableRuntimeEnv } from './worker-durable-runtime.js';
import type { WorkerUiSessionRuntimeEnv } from './worker-ui-session-runtime.js';
import {
  buildMcpGatewayRouteParams,
  handleMcpGatewayRoute,
  type McpGatewayBoundaryPolicyParams,
} from './worker-mcp-gateway.js';
import { isMcpPath } from './worker-platform-runtime.js';

export interface WorkerMcpFetchRuntimeEnv
  extends WorkerUiSessionRuntimeEnv, WorkerDurableRuntimeEnv {
  MCP_ALLOWED_ORIGINS?: string;
  MCP_REQUIRE_PROTOCOL_VERSION?: string;
}

export interface CreateWorkerMcpFetchHandlerDeps<TEnv extends WorkerMcpFetchRuntimeEnv> {
  getRequestOrigin: (request: Request) => string | null;
  getCachedAllowedOrigins: (rawAllowedOrigins: string | undefined) => string[];
  buildWorkerRouteMetricKey: (method: string, pathname: string) => string;
  recordRouteLatency: (route: string, elapsedMs: number) => void;
  now: () => number;
  workerCoreRouteDeps: HandleWorkerCoreRoutesDeps<TEnv>;
  mcpBoundaryPolicy: McpGatewayBoundaryPolicyParams<TEnv>;
}

export function createWorkerMcpFetchHandler<TEnv extends WorkerMcpFetchRuntimeEnv>(
  deps: CreateWorkerMcpFetchHandlerDeps<TEnv>,
) {
  return async function handleMcpWorkerFetch(
    request: Request,
    env: TEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const requestMethod = request.method;
    const pathname = url.pathname;

    if (!isMcpPath(pathname)) {
      return new Response('Not found', { status: 404 });
    }

    const origin = deps.getRequestOrigin(request);
    const allowedOrigins = deps.getCachedAllowedOrigins(env.MCP_ALLOWED_ORIGINS);
    const requestStartedAt = deps.now();
    const routeMetricKey = deps.buildWorkerRouteMetricKey(requestMethod, pathname);

    try {
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
          mcpPath: true,
        },
        deps.workerCoreRouteDeps,
      );
      if (coreRouteResponse) {
        return coreRouteResponse;
      }

      const mcpResponse = await handleMcpGatewayRoute(
        buildMcpGatewayRouteParams(
          {
            request,
            env,
            ctx,
            pathname,
            requestMethod,
            origin,
            allowedOrigins,
            mcpPath: true,
          },
          deps.mcpBoundaryPolicy,
        ),
      );
      if (mcpResponse) {
        return mcpResponse;
      }

      return new Response('Not found', { status: 404 });
    } finally {
      deps.recordRouteLatency(routeMetricKey, deps.now() - requestStartedAt);
    }
  };
}
