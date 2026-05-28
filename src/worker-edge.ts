/// <reference types="@cloudflare/workers-types" />

/**
 * Edge / portal worker — OAuth, hosted auth, SPA, UI API.
 * Does not bundle MCP tools, agents, or CourtListenerMCP.
 *
 * MCP protocol traffic is served by `worker-mcp.ts` (`courtlistener-mcp-mcp`).
 */

import { runWithPrincipalContext } from './infrastructure/principal-context.js';
import {
  PREFERRED_MCP_PROTOCOL_VERSION,
  SUPPORTED_MCP_PROTOCOL_VERSIONS as SUPPORTED_MCP_PROTOCOL_VERSION_LIST,
} from './infrastructure/protocol-constants.js';
import {
  buildLowCostSummary,
  buildMcpSystemPrompt,
  extractMcpContext,
} from './server/worker-ai-response-runtime.js';
import {
  aiToolArguments,
  aiToolFromPrompt,
  createWorkerMcpAiRuntime,
  hasValidMcpRpcShape,
  isPlainObject,
} from './server/worker-mcp-ai-runtime.js';
import { createWorkerEdgeFetchHandler } from './server/worker-edge-fetch-runtime.js';
import {
  handleWorkerOAuthEntrypoint,
  isWorkerManagedRegistrationPath,
  shouldBypassOAuthProvider,
} from './server/worker-oauth-entrypoint-runtime.js';
import { authorizeMcpGatewayRequest } from './server/mcp-gateway-auth.js';
import { handleWorkerOAuthAuthorizeRoute } from './server/worker-oauth-authorize.js';
import { handleWorkerDynamicClientRegistration } from './server/worker-oauth-registration.js';
import {
  createCloudflareOAuthProviderRuntime,
  getRegistrationAllowedOrigins,
  withRegistrationCors,
} from './server/worker-oauth-provider-runtime.js';
import {
  createRegistrationAccessToken,
  verifyRegistrationAccessToken,
} from './server/worker-oauth-registration-token.js';
import { extractBearerToken, isAllowedOrigin } from './server/worker-security.js';
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
import { SPA_BUILD_ID } from './web/spa-build-id.js';
import { renderSpaShellHtml } from './web/spa-shell.js';
import {
  type WorkerEdgeEnv,
  DEFAULT_CF_AI_MODEL_BALANCED,
  DEFAULT_CF_AI_MODEL_CHEAP,
  CHEAP_MODE_MAX_TOKENS,
  BALANCED_MODE_MAX_TOKENS,
} from './server/worker-runtime-contract.js';
import { buildHostedOAuthCompletionDetails } from './auth/oauth-authorization-completion.js';
import { resolveGrantedScopes } from './auth/oauth-scope-resolver.js';
import {
  createWorkerPlatformRuntime,
  isRemovedLegacyUiRoute,
} from './server/worker-platform-runtime.js';
import type { WorkerEdgeDelegatedRouteDeps } from './server/worker-route-composition.js';
import type { HandleWorkerCoreRoutesDeps } from './server/worker-core-routes.js';
import { fetchMcpWorkerService } from './server/worker-mcp-service-fetch.js';

const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set(SUPPORTED_MCP_PROTOCOL_VERSION_LIST);
const platform = createWorkerPlatformRuntime<WorkerEdgeEnv>();

const workerMcpAiRuntime = createWorkerMcpAiRuntime({
  authorizeMcpGatewayRequest,
  runWithPrincipalContext,
  mcpStreamableFetch: (request, env) => fetchMcpWorkerService(request, env as WorkerEdgeEnv),
  preferredMcpProtocolVersion: PREFERRED_MCP_PROTOCOL_VERSION,
  supportedMcpProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS,
  redactSecretsInText,
  incrementUserUsage: (env, userId, metadata) =>
    platform.workerDurableRuntime.incrementUserUsage(env as WorkerEdgeEnv, userId, metadata),
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

const workerEdgeDelegatedRouteDeps = {
  jsonError,
  jsonResponse,
  withCors,
  rejectDisallowedUiOrigin,
  requireCsrfToken: platform.workerUiSessionRuntime.requireCsrfToken,
  parseJsonBody: platform.parseJsonBody,
  authenticateUiApiRequest: platform.workerUiSessionRuntime.authenticateUiApiRequest,
  applyAiChatLifetimeQuota: platform.workerDurableRuntime.applyAiChatLifetimeQuota,
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
  getClientIdentifier: platform.workerObservabilityRuntime.getClientIdentifier,
  recordTurnstileVerdict: platform.cloudflareTelemetryRuntime.recordTurnstileVerdict,
  spaBuildId: SPA_BUILD_ID,
  fetchSpaAsset: (request: Request, env: WorkerEdgeEnv) => env.SPA_ASSETS.fetch(request),
  spaAssetResponse,
  generateCspNonce,
  getOrCreateCsrfCookieHeader: platform.workerUiSessionRuntime.getOrCreateCsrfCookieHeader,
  htmlResponse,
  renderSpaShellHtml,
  redirectResponse,
  workerUiSessionRuntime: platform.workerUiSessionRuntime,
  getOAuthHelpers: (env: WorkerEdgeEnv) => platform.getOAuthHelpersRef()(env),
  buildHostedOAuthCompletionDetails,
  resolveGrantedScopes,
  getAuthRouteRateLimitedResponse: platform.workerDurableRuntime.getAuthRouteRateLimitedResponse,
  now: () => Date.now(),
} satisfies WorkerEdgeDelegatedRouteDeps<WorkerEdgeEnv>;

const workerCoreRouteDeps = {
  isAllowedOrigin,
  buildCorsHeaders,
  withCors,
  jsonError,
  jsonResponse,
  isRemovedLegacyUiRoute,
  workerUiSessionRuntime: platform.workerUiSessionRuntime,
  workerDurableRuntime: platform.workerDurableRuntime,
  getCachedSessionTopology: platform.workerObservabilityRuntime.getCachedSessionTopology,
  getWorkerLatencySnapshot: platform.workerObservabilityRuntime.getWorkerLatencySnapshot,
  getUsageSnapshot: platform.workerDurableRuntime.getUserUsageSnapshot,
  now: () => Date.now(),
  getClientIdentifier: platform.workerObservabilityRuntime.getClientIdentifier,
  recordTurnstileVerdict: platform.cloudflareTelemetryRuntime.recordTurnstileVerdict,
  recordUiEvent: platform.cloudflareTelemetryRuntime.recordUiEvent,
} satisfies HandleWorkerCoreRoutesDeps<WorkerEdgeEnv>;

const handleEdgeWorkerFetch = createWorkerEdgeFetchHandler<WorkerEdgeEnv>({
  getRequestOrigin: platform.workerObservabilityRuntime.getRequestOrigin,
  getCachedAllowedOrigins: platform.workerObservabilityRuntime.getCachedAllowedOrigins,
  buildWorkerRouteMetricKey: platform.workerObservabilityRuntime.buildWorkerRouteMetricKey,
  recordRouteLatency: platform.workerObservabilityRuntime.recordRouteLatency,
  now: () => Date.now(),
  workerCoreRouteDeps,
  workerEdgeDelegatedRouteDeps,
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

const cloudflareOAuthProviderRuntime = createCloudflareOAuthProviderRuntime<WorkerEdgeEnv>({
  handleAuthorizeRoute: (request, env) =>
    handleWorkerOAuthAuthorizeRoute(request, env, {
      jsonError,
      redirectResponse,
      resolveCloudflareOAuthIdentity:
        platform.workerUiSessionRuntime.resolveCloudflareOAuthIdentity,
    }),
  handleLegacyWorkerFetch: handleEdgeWorkerFetch,
  getCachedAllowedOrigins: platform.workerObservabilityRuntime.getCachedAllowedOrigins,
  getRequestOrigin: platform.workerObservabilityRuntime.getRequestOrigin,
  buildCorsHeaders,
});

platform.setOAuthHelpers(cloudflareOAuthProviderRuntime.getOAuthHelpers);

export default {
  async fetch(request: Request, env: WorkerEdgeEnv, ctx: ExecutionContext): Promise<Response> {
    platform.cloudflareTelemetryRuntime.setCurrentEnv(env);
    const url = new URL(request.url);
    cloudflareOAuthProviderRuntime.setCurrentRequestOrigin(url.origin);

    if (shouldBypassOAuthProvider(url.pathname)) {
      return handleEdgeWorkerFetch(request, env, ctx);
    }
    if (isWorkerManagedRegistrationPath(url.pathname)) {
      return handleWorkerDynamicClientRegistration(request, env, {
        getRequestOrigin: platform.workerObservabilityRuntime.getRequestOrigin,
        getRegistrationAllowedOrigins: (runtimeEnv) =>
          getRegistrationAllowedOrigins(runtimeEnv, {
            getCachedAllowedOrigins: platform.workerObservabilityRuntime.getCachedAllowedOrigins,
          }),
        isAllowedOrigin,
        extractBearerToken,
        buildCorsHeaders,
        withRegistrationCors: (response, corsRequest, runtimeEnv) =>
          withRegistrationCors(response, corsRequest, runtimeEnv, {
            getRequestOrigin: platform.workerObservabilityRuntime.getRequestOrigin,
            buildCorsHeaders,
            getCachedAllowedOrigins: platform.workerObservabilityRuntime.getCachedAllowedOrigins,
          }),
        jsonRegistrationError,
        getOAuthHelpers: cloudflareOAuthProviderRuntime.getOAuthHelpers,
        createRegistrationAccessToken,
        verifyRegistrationAccessToken,
        getClientIdentifier: platform.workerObservabilityRuntime.getClientIdentifier,
        getAuthRouteRateLimitedResponse:
          platform.workerDurableRuntime.getAuthRouteRateLimitedResponse,
        now: () => Date.now(),
      });
    }
    return handleWorkerOAuthEntrypoint(request, env, ctx, {
      cloudflareOAuthProvider: cloudflareOAuthProviderRuntime.provider,
      summarizeOAuthRequest,
      summarizeOAuthResponse,
      emitOAuthDiagnostic,
      getClientIdentifier: platform.workerObservabilityRuntime.getClientIdentifier,
      getAuthRouteRateLimitedResponse:
        platform.workerDurableRuntime.getAuthRouteRateLimitedResponse,
      now: () => Date.now(),
    });
  },
};
