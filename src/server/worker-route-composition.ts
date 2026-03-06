import type { WorkerSecurityEnv } from './worker-security.js';
import {
  handleWorkerOAuthRoutes,
  type WorkerOAuthRouteDeps,
} from './worker-oauth-routes.js';
import { handleWorkerAiUiRoutes, type HandleWorkerAiUiRoutesDeps } from './worker-ai-ui-routes.js';
import {
  handleWorkerUiShellRoutes,
  type HandleWorkerUiShellRoutesDeps,
} from './worker-ui-shell-routes.js';
import {
  buildMcpGatewayRouteParams,
  handleMcpGatewayRoute,
  type McpGatewayBoundaryPolicyParams,
} from './worker-mcp-gateway.js';
export type WorkerRouteHandler = () => Promise<Response | null>;

type WorkerDelegatedRouteEnv = WorkerSecurityEnv & {
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  CLOUDFLARE_AI_MODEL?: string;
};

type WorkerDelegatedSharedDeps<TEnv extends WorkerDelegatedRouteEnv> = WorkerOAuthRouteDeps<TEnv> &
  HandleWorkerAiUiRoutesDeps<TEnv, ExecutionContext> &
  HandleWorkerUiShellRoutesDeps<TEnv>;

interface McpHandler<TEnv extends WorkerDelegatedRouteEnv> {
  fetch(request: Request, env: TEnv, ctx: ExecutionContext): Promise<Response>;
}

export interface WorkerDelegatedRouteContext<TEnv extends WorkerDelegatedRouteEnv> {
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

export interface WorkerDelegatedRouteDeps<TEnv extends WorkerDelegatedRouteEnv>
  extends WorkerDelegatedSharedDeps<TEnv> {
  mcpBoundaryPolicy: McpGatewayBoundaryPolicyParams<TEnv> & {
    mcpStreamableHandler: McpHandler<TEnv>;
    mcpSseCompatibilityHandler: McpHandler<TEnv>;
  };
}

export interface WorkerDelegatedRouteCompositionHandlers {
  oauth: WorkerRouteHandler;
  aiUi: WorkerRouteHandler;
  uiShell: WorkerRouteHandler;
  mcpGateway: WorkerRouteHandler;
}

export function composeWorkerDelegatedRouteHandlers(
  handlers: WorkerDelegatedRouteCompositionHandlers,
): readonly WorkerRouteHandler[] {
  return [
    handlers.oauth,
    handlers.aiUi,
    handlers.uiShell,
    handlers.mcpGateway,
  ].filter((handler): handler is WorkerRouteHandler => typeof handler === 'function');
}

export async function runWorkerRouteHandlers(
  handlers: readonly WorkerRouteHandler[],
): Promise<Response | null> {
  for (const handler of handlers) {
    const response = await handler();
    if (response) {
      return response;
    }
  }
  return null;
}

export async function handleDelegatedWorkerRoutes<TEnv extends WorkerDelegatedRouteEnv>(
  context: WorkerDelegatedRouteContext<TEnv>,
  deps: WorkerDelegatedRouteDeps<TEnv>,
): Promise<Response | null> {
  const { request, url, origin, allowedOrigins, env, ctx, pathname, requestMethod, mcpPath } = context;

  return runWorkerRouteHandlers(
    composeWorkerDelegatedRouteHandlers({
      oauth: async () => handleWorkerOAuthRoutes({ request, url, env }, deps),
      aiUi: async () =>
        handleWorkerAiUiRoutes({
          context: { request, url, origin, allowedOrigins, env, ctx },
          deps,
        }),
      uiShell: async () =>
        handleWorkerUiShellRoutes({
          request,
          url,
          env,
          deps,
        }),
      mcpGateway: async () =>
        handleMcpGatewayRoute(
          buildMcpGatewayRouteParams(
            {
              request,
              env,
              ctx,
              pathname,
              requestMethod,
              origin,
              allowedOrigins,
              mcpPath,
            },
            deps.mcpBoundaryPolicy,
          ),
        ),
    }),
  );
}
