/// <reference types="@cloudflare/workers-types" />

/**
 * MCP worker — `/mcp`, `/sse`, CourtListenerMCP Durable Object, async tool queue.
 */

import { bootstrapServices } from './infrastructure/bootstrap.js';
import { container } from './infrastructure/container.js';
import { runWithPrincipalContext } from './infrastructure/principal-context.js';
import {
  PREFERRED_MCP_PROTOCOL_VERSION,
  SUPPORTED_MCP_PROTOCOL_VERSIONS as SUPPORTED_MCP_PROTOCOL_VERSION_LIST,
} from './infrastructure/protocol-constants.js';
import type { Logger } from './infrastructure/logger.js';
import { ToolHandlerRegistry } from './server/tool-handler.js';
import { authorizeMcpGatewayRequest } from './server/mcp-gateway-auth.js';
import { createWorkerMcpAiRuntime } from './server/worker-mcp-ai-runtime.js';
import { createWorkerMcpFetchHandler } from './server/worker-mcp-fetch-runtime.js';
import {
  processAsyncQueueMessage,
  type AsyncJobMessage,
} from './server/worker-async-queue-runtime.js';
import { buildCorsHeaders, jsonError, withCors } from './server/worker-response-runtime.js';
import { redactSecretsInText } from './infrastructure/secret-redaction.js';
import type { WorkerMcpEnv } from './server/worker-runtime-contract.js';
import {
  createWorkerPlatformRuntime,
  isRemovedLegacyUiRoute,
} from './server/worker-platform-runtime.js';
import { CourtListenerMCP } from './worker/courtlistener-mcp-agent.js';
import type { HandleWorkerCoreRoutesDeps } from './server/worker-core-routes.js';
import { isAllowedOrigin } from './server/worker-security.js';

const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set(SUPPORTED_MCP_PROTOCOL_VERSION_LIST);
const platform = createWorkerPlatformRuntime<WorkerMcpEnv>();

CourtListenerMCP.telemetry = {
  recordAsyncJobUpdate: platform.cloudflareTelemetryRuntime.recordAsyncJobUpdate,
};

const mcpStreamableHandler = CourtListenerMCP.serve('/mcp');
const mcpSseCompatibilityHandler = CourtListenerMCP.serve('/sse');

const workerMcpAiRuntime = createWorkerMcpAiRuntime({
  authorizeMcpGatewayRequest,
  runWithPrincipalContext,
  mcpStreamableFetch: (request, env, ctx) => mcpStreamableHandler.fetch(request, env, ctx),
  preferredMcpProtocolVersion: PREFERRED_MCP_PROTOCOL_VERSION,
  supportedMcpProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS,
  redactSecretsInText,
  incrementUserUsage: (env, userId, metadata) =>
    platform.workerDurableRuntime.incrementUserUsage(env as WorkerMcpEnv, userId, metadata),
});

const workerCoreRouteDeps = {
  isAllowedOrigin,
  buildCorsHeaders,
  withCors,
  jsonError,
  jsonResponse: (payload: unknown, status = 200, extraHeaders?: HeadersInit) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        'content-type': 'application/json',
        ...(extraHeaders ? Object.fromEntries(new Headers(extraHeaders).entries()) : {}),
      },
    }),
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
} satisfies HandleWorkerCoreRoutesDeps<WorkerMcpEnv>;

const handleMcpWorkerFetch = createWorkerMcpFetchHandler<WorkerMcpEnv>({
  getRequestOrigin: platform.workerObservabilityRuntime.getRequestOrigin,
  getCachedAllowedOrigins: platform.workerObservabilityRuntime.getCachedAllowedOrigins,
  buildWorkerRouteMetricKey: platform.workerObservabilityRuntime.buildWorkerRouteMetricKey,
  recordRouteLatency: platform.workerObservabilityRuntime.recordRouteLatency,
  now: () => Date.now(),
  workerCoreRouteDeps,
  mcpBoundaryPolicy: {
    supportedProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS,
    mcpStreamableHandler,
    mcpSseCompatibilityHandler,
    withCors,
    buildCorsHeaders,
    getClientIdentifier: platform.workerObservabilityRuntime.getClientIdentifier,
    getAuthRateLimitedResponse: platform.workerDurableRuntime.getAuthRateLimitedResponse,
    probeAuthRateLimit: platform.workerDurableRuntime.probeAuthRateLimit,
    recordAuthFailure: platform.workerDurableRuntime.recordAuthFailure,
    clearAuthFailures: platform.workerDurableRuntime.clearAuthFailures,
    evaluateMcpBoundaryRequest: platform.workerDurableRuntime.evaluateMcpBoundaryRequest,
    validateSessionRequest: platform.workerDurableRuntime.validateSessionRequest,
    finalizeSessionResponse: platform.workerDurableRuntime.finalizeSessionResponse,
    onAuthorizedRequest: (request, env, principal) =>
      workerMcpAiRuntime.recordAuthorizedMcpUsage(request, env, principal),
  },
});

export { CourtListenerMCP };

export default {
  async fetch(request: Request, env: WorkerMcpEnv, ctx: ExecutionContext): Promise<Response> {
    platform.cloudflareTelemetryRuntime.setCurrentEnv(env);
    return handleMcpWorkerFetch(request, env, ctx);
  },
  async queue(batch: MessageBatch<AsyncJobMessage>, env: WorkerMcpEnv): Promise<void> {
    platform.cloudflareTelemetryRuntime.setCurrentEnv(env);
    bootstrapServices();
    const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    const logger = container.get<Logger>('logger');

    for (const message of batch.messages) {
      await processAsyncQueueMessage({
        env,
        logger,
        message: message.body,
        execute: async (request, requestId, userId) =>
          await toolRegistry.execute(request, {
            logger,
            requestId,
            ...(userId ? { userId } : {}),
          }),
        onAsyncJobUpdate: platform.cloudflareTelemetryRuntime.recordAsyncJobUpdate,
      });
      message.ack();
    }
  },
};
