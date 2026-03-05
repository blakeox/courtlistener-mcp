import type { WorkerSecurityEnv } from './worker-security.js';
import type { SupabaseAuthConfig } from './supabase-auth.js';
import type {
  SupabaseOAuthAuthorizationDetails,
  SupabaseSignupConfig,
} from './supabase-management.js';
import {
  handleWorkerOAuthRoutes,
  type WorkerOAuthRouteDeps,
} from './worker-oauth-routes.js';
import {
  handleWorkerOAuthConsentRoutes,
  type OAuthConsentRouteDeps,
} from './worker-oauth-consent-routes.js';
import { handleWorkerAuthRoutes } from './worker-auth-routes.js';
import { handleUiKeysRoutes, type HandleUiKeysRoutesDeps } from './worker-ui-keys-route.js';
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
import { runWorkerRouteHandlers, type WorkerRouteHandler } from './worker-route-orchestration.js';

type WorkerDelegatedRouteEnv = WorkerSecurityEnv & {
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  CLOUDFLARE_AI_MODEL?: string;
};

type WorkerAuthRouteDeps<TEnv extends WorkerDelegatedRouteEnv> = Parameters<
  typeof handleWorkerAuthRoutes<TEnv, SupabaseAuthConfig, SupabaseSignupConfig>
>[1];

type WorkerOAuthRouteDepsShared<TEnv extends WorkerDelegatedRouteEnv> = WorkerOAuthRouteDeps<
  TEnv,
  SupabaseSignupConfig
>;

type WorkerOAuthConsentDeps<TEnv extends WorkerDelegatedRouteEnv> = OAuthConsentRouteDeps<
  TEnv,
  SupabaseSignupConfig,
  SupabaseOAuthAuthorizationDetails
>;

type WorkerDelegatedSharedDeps<TEnv extends WorkerDelegatedRouteEnv> = WorkerOAuthRouteDepsShared<TEnv> &
  WorkerAuthRouteDeps<TEnv> &
  WorkerOAuthConsentDeps<TEnv> &
  HandleUiKeysRoutesDeps<TEnv> &
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
  oauthConsent: WorkerRouteHandler;
  auth: WorkerRouteHandler;
  uiKeys: WorkerRouteHandler;
  aiUi: WorkerRouteHandler;
  uiShell: WorkerRouteHandler;
  mcpGateway: WorkerRouteHandler;
}

export function composeWorkerDelegatedRouteHandlers(
  handlers: WorkerDelegatedRouteCompositionHandlers,
): readonly WorkerRouteHandler[] {
  return [
    handlers.oauth,
    handlers.oauthConsent,
    handlers.auth,
    handlers.uiKeys,
    handlers.aiUi,
    handlers.uiShell,
    handlers.mcpGateway,
  ];
}

export async function handleDelegatedWorkerRoutes<TEnv extends WorkerDelegatedRouteEnv>(
  context: WorkerDelegatedRouteContext<TEnv>,
  deps: WorkerDelegatedRouteDeps<TEnv>,
): Promise<Response | null> {
  const { request, url, origin, allowedOrigins, env, ctx, pathname, requestMethod, mcpPath } = context;

  return runWorkerRouteHandlers(
    composeWorkerDelegatedRouteHandlers({
      oauth: async () => handleWorkerOAuthRoutes({ request, url, env }, deps),
      oauthConsent: async () =>
        handleWorkerOAuthConsentRoutes({ request, url, origin, allowedOrigins, env }, deps),
      auth: async () => handleWorkerAuthRoutes({ request, url, origin, allowedOrigins, env }, deps),
      uiKeys: async () =>
        handleUiKeysRoutes({
          request,
          url,
          origin,
          allowedOrigins,
          env,
          deps,
        }),
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
