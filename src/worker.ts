/// <reference types="@cloudflare/workers-types" />

/**
 * CourtListener MCP Server — Cloudflare Workers Entrypoint
 *
 * Deploys the full MCP server on Cloudflare's edge network using the
 * `agents` SDK with Durable Objects for per-session state management.
 *
 * End users connect by adding a single URL to their MCP client:
 *   { "url": "https://courtlistener-mcp.<subdomain>.workers.dev/mcp" }
 *
 * Secrets (set via `wrangler secret put`):
 *   COURTLISTENER_API_KEY  — CourtListener API token (required)
 *   MCP_AUTH_TOKEN          — Optional service token for x-mcp-service-token only
 *   OIDC_ISSUER             — Optional OIDC issuer URL for JWT validation
 *   OIDC_AUDIENCE           — Optional OIDC audience
 *   OIDC_JWKS_URL           — Optional explicit JWKS URL
 *   OIDC_REQUIRED_SCOPE     — Optional required scope
 *   MCP_OAUTH_DEV_USER_ID   — Optional controlled dev fallback identity for /authorize
 *   MCP_UI_PUBLIC_ORIGIN    — Optional canonical UI origin used for email confirmation redirects
 */

import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { generateId } from './common/utils.js';
import { bootstrapServices } from './infrastructure/bootstrap.js';
import { container } from './infrastructure/container.js';
import { runWithPrincipalContext } from './infrastructure/principal-context.js';
import {
  PREFERRED_MCP_PROTOCOL_VERSION,
  SERVER_CAPABILITIES,
  SUPPORTED_MCP_PROTOCOL_VERSIONS as SUPPORTED_MCP_PROTOCOL_VERSION_LIST,
} from './infrastructure/protocol-constants.js';
import type { Logger } from './infrastructure/logger.js';
import type { MetricsCollector } from './infrastructure/metrics.js';
import { ToolHandlerRegistry } from './server/tool-handler.js';
import { ResourceHandlerRegistry } from './server/resource-handler.js';
import { PromptHandlerRegistry } from './server/prompt-handler.js';
import { SubscriptionManager } from './server/subscription-manager.js';
import { buildToolDefinitions, buildEnhancedMetadata } from './server/tool-builder.js';
import { setupHandlers } from './server/handler-registry.js';
import { createDirectToolExecutionService } from './server/tool-execution-service.js';
import {
  type WorkerDelegatedRouteDeps,
} from './server/worker-route-composition.js';
import type { HandleWorkerCoreRoutesDeps } from './server/worker-core-routes.js';
import {
  buildLowCostSummary,
  buildMcpSystemPrompt,
  extractMcpContext,
} from './server/worker-ai-response-runtime.js';
import {
  createWorkerObservabilityRuntime,
  type WorkerObservabilityRuntime,
} from './server/worker-observability-runtime.js';
import {
  aiToolArguments,
  aiToolFromPrompt,
  createWorkerMcpAiRuntime,
  hasValidMcpRpcShape,
  isPlainObject,
  type WorkerMcpAiRuntime,
} from './server/worker-mcp-ai-runtime.js';
import { createWorkerLegacyFetchHandler } from './server/worker-request-runtime.js';
import {
  handleWorkerOAuthEntrypoint,
  shouldBypassOAuthProvider,
} from './server/worker-oauth-entrypoint-runtime.js';
import { authorizeMcpGatewayRequest } from './server/mcp-gateway-auth.js';
import { handleWorkerOAuthAuthorizeRoute } from './server/worker-oauth-authorize.js';
import { handleWorkerDynamicClientRegistration } from './server/worker-oauth-registration.js';
import {
  createCloudflareOAuthProviderRuntime,
  createRegistrationAccessToken,
  getRegistrationAllowedOrigins,
  verifyRegistrationAccessToken,
  withRegistrationCors,
} from './server/worker-oauth-provider-runtime.js';
import {
  createWorkerUiSessionRuntime,
  type WorkerUiSessionRuntime,
} from './server/worker-ui-session-runtime.js';
import {
  extractBearerToken,
  isAllowedOrigin,
} from './server/worker-security.js';
import {
  emitOAuthDiagnostic,
  summarizeOAuthRequest,
  summarizeOAuthResponse,
} from './server/oauth-diagnostics.js';
import {
  buildCorsHeaders,
  generateCspNonce,
  htmlResponse,
  jsonError,
  jsonResponse,
  redirectResponse,
  spaAssetResponse,
  withCors,
} from './server/worker-response-runtime.js';
import { redactSecretsInText } from './infrastructure/secret-redaction.js';
import { SPA_BUILD_ID, SPA_CSS, SPA_JS } from './web/spa-assets.js';
import { renderSpaShellHtml } from './web/spa-shell.js';
import { resolveWorkerMcpSessionTopologyV2 } from './server/worker-mcp-session-topology.js';
import {
  type Env,
  DEFAULT_CF_AI_MODEL_BALANCED,
  DEFAULT_CF_AI_MODEL_CHEAP,
  WORKER_DO_OUTLIER_MIN_SAMPLES,
  WORKER_DO_OUTLIER_SCORE_THRESHOLD,
  WORKER_EXPORT_TOP_SLOW_OPERATION_LIMIT,
  WORKER_ROUTE_LATENCY_MAX_ROUTES,
  WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE,
  CHEAP_MODE_MAX_TOKENS,
  BALANCED_MODE_MAX_TOKENS,
} from './server/worker-runtime-contract.js';
import { AuthFailureLimiterDO, createWorkerDurableRuntime } from './server/worker-durable-runtime.js';
import { HOSTED_MCP_OAUTH_CONTRACT } from './auth/oauth-contract.js';

// ---------------------------------------------------------------------------
// MCP Agent — one Durable Object instance per client session
// ---------------------------------------------------------------------------

// SDK version bridge: agents@0.5 bundles SDK 1.26, our project uses 1.27.
// The APIs are compatible at runtime; casts bridge the type-level gap.

export class CourtListenerMCP extends (McpAgent as typeof McpAgent<Env>) {
  static override options = {
    hibernate: true,
  };

  server = new McpServer(
    { name: 'courtlistener-mcp', version: '0.1.0' },
    { capabilities: SERVER_CAPABILITIES },
  ) as unknown as InstanceType<typeof McpAgent>['server'];

  async init(): Promise<void> {
    // Propagate Cloudflare secrets into process.env so our existing
    // config system (getConfig()) picks them up unchanged.
    const env = (this as unknown as { env: Env }).env;
    if (env.COURTLISTENER_API_KEY) {
      process.env.COURTLISTENER_API_KEY = env.COURTLISTENER_API_KEY;
    }

    // Bootstrap the full DI container (config, logger, cache, API client,
    // tool / resource / prompt registries, circuit breakers, etc.)
    bootstrapServices();

    const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    const resourceRegistry = container.get<ResourceHandlerRegistry>('resourceRegistry');
    const promptRegistry = container.get<PromptHandlerRegistry>('promptRegistry');
    const logger = container.get<Logger>('logger');
    const metrics = container.get<MetricsCollector>('metrics');
    const enhancedMetadata = buildEnhancedMetadata();
    const toolExecutionService = createDirectToolExecutionService({ toolRegistry, logger });

    // Wire all existing MCP protocol handlers onto the low-level Server
    // that lives inside McpServer.  Because we never call
    // this.server.tool() / .resource() / .prompt(), the high-level
    // McpServer won't register conflicting handlers.
    const lowLevelServer = (this.server as unknown as McpServer).server;

    setupHandlers({
      server: lowLevelServer,
      logger,
      metrics,
      subscriptionManager: new SubscriptionManager(),
      listTools: async () => ({
        tools: buildToolDefinitions(toolRegistry, enhancedMetadata),
        metadata: { categories: toolRegistry.getCategories() },
      }),
      listResources: async () => ({ resources: resourceRegistry.getAllResources() }),
      readResource: async (uri) => {
        const handler = resourceRegistry.findHandler(uri);
        if (!handler) {
          throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${uri}`);
        }
        return handler.read(uri, {
          logger,
          requestId: generateId(),
        });
      },
      listPrompts: async () => ({ prompts: promptRegistry.getAllPrompts() }),
      getPrompt: async (name, args = {}) => {
        const handler = promptRegistry.findHandler(name);
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
        }
        return handler.getMessages(args);
      },
      executeTool: async (req: CallToolRequest): Promise<CallToolResult> => {
        try {
          return await toolExecutionService.execute(req, generateId());
        } catch (error) {
          if (error instanceof McpError) {
            throw error;
          }
          throw new McpError(
            ErrorCode.InternalError,
            `Error executing ${req.params.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    });
  }
}

export { AuthFailureLimiterDO };

// ---------------------------------------------------------------------------
// Workers fetch handler — thin wrapper around McpAgent.serve()
// ---------------------------------------------------------------------------

const mcpStreamableHandler = CourtListenerMCP.serve('/mcp');
const mcpSseCompatibilityHandler = CourtListenerMCP.serve('/sse');
const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set(SUPPORTED_MCP_PROTOCOL_VERSION_LIST);

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function isMcpPath(pathname: string): boolean {
  return pathname === '/mcp' || pathname === '/sse';
}

function isRemovedLegacyUiRoute(pathname: string): boolean {
  return (
    pathname === '/oauth/consent' ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/logout') ||
    pathname.startsWith('/api/signup') ||
    pathname.startsWith('/api/password') ||
    pathname.startsWith('/api/keys')
  );
}

const workerObservabilityRuntime: WorkerObservabilityRuntime<Env> = createWorkerObservabilityRuntime<Env>({
  routeLatencyMaxRoutes: WORKER_ROUTE_LATENCY_MAX_ROUTES,
  routeLatencyOverflowRoute: WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE,
  exportTopSlowOperationLimit: WORKER_EXPORT_TOP_SLOW_OPERATION_LIMIT,
  doOutlierScoreThreshold: WORKER_DO_OUTLIER_SCORE_THRESHOLD,
  doOutlierMinSamples: WORKER_DO_OUTLIER_MIN_SAMPLES,
  resolveWorkerMcpSessionTopologyV2,
});

const workerDurableRuntime = createWorkerDurableRuntime<Env>({
  now: () => Date.now(),
  recordDurableObjectLatency: workerObservabilityRuntime.recordDurableObjectLatency,
  getCachedSessionTopology: workerObservabilityRuntime.getCachedSessionTopology,
  jsonError,
});

const workerMcpAiRuntime: WorkerMcpAiRuntime = createWorkerMcpAiRuntime({
  authorizeMcpGatewayRequest,
  runWithPrincipalContext,
  mcpStreamableFetch: (request, env, ctx) => mcpStreamableHandler.fetch(request, env, ctx),
  preferredMcpProtocolVersion: PREFERRED_MCP_PROTOCOL_VERSION,
  supportedMcpProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS,
  redactSecretsInText,
  incrementUserUsage: workerDurableRuntime.incrementUserUsage,
});

const workerUiSessionRuntime: WorkerUiSessionRuntime<Env> = createWorkerUiSessionRuntime<Env>({
  jsonError,
  getClientIdentifier: workerObservabilityRuntime.getClientIdentifier,
  isUiSessionRevoked: workerDurableRuntime.isUiSessionRevoked,
  recordSessionBootstrapRateLimit: workerDurableRuntime.recordSessionBootstrapRateLimit,
});

function rejectDisallowedUiOrigin(
  origin: string | null,
  allowedOrigins: string[],
): Response | null {
  if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
    return jsonError('Forbidden origin', 403, 'forbidden_origin');
  }
  return null;
}

const workerDelegatedRouteDeps = {
  jsonError,
  jsonResponse,
  withCors,
  rejectDisallowedUiOrigin,
  requireCsrfToken: workerUiSessionRuntime.requireCsrfToken,
  parseJsonBody,
  authenticateUiApiRequest: workerUiSessionRuntime.authenticateUiApiRequest,
  applyAiChatLifetimeQuota: workerDurableRuntime.applyAiChatLifetimeQuota,
  isPlainObject,
  aiToolFromPrompt,
  callMcpJsonRpc: workerMcpAiRuntime.callMcpJsonRpc,
  hasValidMcpRpcShape,
  aiToolArguments,
  buildLowCostSummary,
  buildMcpSystemPrompt,
  extractMcpContext,
  preferredMcpProtocolVersion: PREFERRED_MCP_PROTOCOL_VERSION,
  defaultCfAiModelBalanced: DEFAULT_CF_AI_MODEL_BALANCED,
  defaultCfAiModelCheap: DEFAULT_CF_AI_MODEL_CHEAP,
  cheapModeMaxTokens: CHEAP_MODE_MAX_TOKENS,
  balancedModeMaxTokens: BALANCED_MODE_MAX_TOKENS,
  spaJs: SPA_JS,
  spaCss: SPA_CSS,
  spaBuildId: SPA_BUILD_ID,
  spaAssetResponse,
  generateCspNonce,
  getOrCreateCsrfCookieHeader: workerUiSessionRuntime.getOrCreateCsrfCookieHeader,
  htmlResponse,
  renderSpaShellHtml,
  redirectResponse,
  mcpBoundaryPolicy: {
    supportedProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS,
    mcpStreamableHandler,
    mcpSseCompatibilityHandler,
    withCors,
    buildCorsHeaders,
    getClientIdentifier: workerObservabilityRuntime.getClientIdentifier,
    getAuthRateLimitedResponse: workerDurableRuntime.getAuthRateLimitedResponse,
    recordAuthFailure: workerDurableRuntime.recordAuthFailure,
    clearAuthFailures: workerDurableRuntime.clearAuthFailures,
    evaluateMcpBoundaryRequest: workerDurableRuntime.evaluateMcpBoundaryRequest,
    validateSessionRequest: workerDurableRuntime.validateSessionRequest,
    finalizeSessionResponse: workerDurableRuntime.finalizeSessionResponse,
    onAuthorizedRequest: (request: Request, env: Env, principal) =>
      workerMcpAiRuntime.recordAuthorizedMcpUsage(request, env, principal),
  },
} satisfies WorkerDelegatedRouteDeps<Env>;

let getOAuthHelpersRef: (env: Env) => OAuthHelpers = () => {
  throw new Error('OAuth helpers are not initialized.');
};

const workerCoreRouteDeps = {
  isAllowedOrigin,
  buildCorsHeaders,
  withCors,
  jsonError,
  jsonResponse,
  getOAuthHelpers: (env: Env) => getOAuthHelpersRef(env),
  isRemovedLegacyUiRoute,
  workerUiSessionRuntime,
  getCachedSessionTopology: workerObservabilityRuntime.getCachedSessionTopology,
  getWorkerLatencySnapshot: workerObservabilityRuntime.getWorkerLatencySnapshot,
  getUsageSnapshot: workerDurableRuntime.getUserUsageSnapshot,
  now: () => Date.now(),
} satisfies HandleWorkerCoreRoutesDeps<Env>;

const handleLegacyWorkerFetch = createWorkerLegacyFetchHandler<Env>({
  getRequestOrigin: workerObservabilityRuntime.getRequestOrigin,
  getCachedAllowedOrigins: workerObservabilityRuntime.getCachedAllowedOrigins,
  isMcpPath,
  buildWorkerRouteMetricKey: workerObservabilityRuntime.buildWorkerRouteMetricKey,
  recordRouteLatency: workerObservabilityRuntime.recordRouteLatency,
  now: () => Date.now(),
  workerCoreRouteDeps,
  workerDelegatedRouteDeps,
});

function jsonRegistrationError(error: string, errorDescription: string, status = 400): Response {
  return new Response(
    JSON.stringify({
      error,
      error_description: errorDescription,
    }),
    {
      status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    },
  );
}
const cloudflareOAuthProviderRuntime = createCloudflareOAuthProviderRuntime<Env>({
  handleAuthorizeRoute: (request, env) =>
    handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthUserId: workerUiSessionRuntime.resolveCloudflareOAuthUserId,
    }),
  handleLegacyWorkerFetch,
  getCachedAllowedOrigins: workerObservabilityRuntime.getCachedAllowedOrigins,
  getRequestOrigin: workerObservabilityRuntime.getRequestOrigin,
  buildCorsHeaders,
});

const cloudflareOAuthProvider = cloudflareOAuthProviderRuntime.provider;
const getOAuthHelpers = cloudflareOAuthProviderRuntime.getOAuthHelpers;
getOAuthHelpersRef = getOAuthHelpers;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // Capture the request origin so the OAuthProvider's onError callback
    // builds resource_metadata URLs relative to the domain the client used
    // (workers.dev vs custom domain).
    cloudflareOAuthProviderRuntime.setCurrentRequestOrigin(url.origin);

    if (shouldBypassOAuthProvider(url.pathname)) {
      return handleLegacyWorkerFetch(request, env, ctx);
    }
    // Let the OAuthProvider handle base /register (RFC 7591 DCR) natively.
    // Only intercept /register/{clientId} for client management (RFC 7592).
    if (url.pathname.startsWith(`${HOSTED_MCP_OAUTH_CONTRACT.paths.register}/`)) {
      return handleWorkerDynamicClientRegistration(request, env, {
        getRequestOrigin: workerObservabilityRuntime.getRequestOrigin,
        getRegistrationAllowedOrigins: (runtimeEnv) =>
          getRegistrationAllowedOrigins(runtimeEnv, {
            getCachedAllowedOrigins: workerObservabilityRuntime.getCachedAllowedOrigins,
          }),
        isAllowedOrigin,
        extractBearerToken,
        buildCorsHeaders,
        withRegistrationCors: (response, corsRequest, runtimeEnv) =>
          withRegistrationCors(response, corsRequest, runtimeEnv, {
            getRequestOrigin: workerObservabilityRuntime.getRequestOrigin,
            buildCorsHeaders,
            getCachedAllowedOrigins: workerObservabilityRuntime.getCachedAllowedOrigins,
          }),
        jsonRegistrationError,
        getOAuthHelpers,
        createRegistrationAccessToken,
        verifyRegistrationAccessToken,
      });
    }
    return handleWorkerOAuthEntrypoint(request, env, ctx, {
      cloudflareOAuthProvider,
      summarizeOAuthRequest,
      summarizeOAuthResponse,
      emitOAuthDiagnostic,
    });
  },
};
