/// <reference types="@cloudflare/workers-types" />

/**
 * MCP worker — stateless `/mcp`, async tool queue.
 */

import { runWithPrincipalContext } from './infrastructure/principal-context.js';
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
import { createCourtListenerMcpV2Handler } from './worker/courtlistener-mcp-v2.js';
import { createWorkerPlatformRuntime } from './server/worker-platform-runtime.js';
import type { HandleWorkerCoreRoutesDeps } from './server/worker-core-routes.js';
import { isAllowedOrigin } from './server/worker-security.js';
import { createWorkerRuntime } from './server/worker-runtime-factory.js';
import {
  buildRuntimeReadinessPayload,
  runtimeReadinessStatusCode,
  type RuntimeReadinessCheck,
} from './infrastructure/runtime-readiness-contract.js';
import { parseBoolean } from './server/worker-security.js';

const MCP_V2_PROTOCOL_VERSION = '2026-07-28';
const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set([MCP_V2_PROTOCOL_VERSION]);
const platform = createWorkerPlatformRuntime<WorkerMcpEnv>();

function createMcpV2RequestHandler(env: WorkerMcpEnv) {
  return createCourtListenerMcpV2Handler(env);
}

const mcpStreamableHandler = {
  fetch: (request: Request, env: WorkerMcpEnv) => createMcpV2RequestHandler(env).fetch(request),
};
const workerMcpAiRuntime = createWorkerMcpAiRuntime<WorkerMcpEnv>({
  authorizeMcpGatewayRequest,
  runWithPrincipalContext,
  mcpStreamableFetch: (request, env) => mcpStreamableHandler.fetch(request, env),
  preferredMcpProtocolVersion: MCP_V2_PROTOCOL_VERSION,
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
  workerUiSessionRuntime: platform.workerUiSessionRuntime,
  workerDurableRuntime: platform.workerDurableRuntime,
  getWorkerLatencySnapshot: platform.workerObservabilityRuntime.getWorkerLatencySnapshot,
  getUsageSnapshot: platform.workerDurableRuntime.getUserUsageSnapshot,
  now: () => Date.now(),
  getClientIdentifier: platform.workerObservabilityRuntime.getClientIdentifier,
  recordTurnstileVerdict: platform.cloudflareTelemetryRuntime.recordTurnstileVerdict,
  recordUiEvent: platform.cloudflareTelemetryRuntime.recordUiEvent,
  workerRole: 'mcp',
  getReadinessResponse: async (_request: Request, _env: WorkerMcpEnv) => {
    const asyncQueueEnabled = parseBoolean(_env.MCP_ASYNC_QUEUE_ENABLED, false);
    const asyncQueueConfigured = Boolean(_env.ASYNC_TOOL_QUEUE && _env.ASYNC_JOBS_KV);
    const asyncQueueCheck: RuntimeReadinessCheck = {
      status: !asyncQueueEnabled || asyncQueueConfigured ? 'pass' : 'fail',
      message: !asyncQueueEnabled
        ? 'Async queue execution is disabled by configuration.'
        : asyncQueueConfigured
          ? 'Async queue and KV bindings are configured.'
          : 'Async queue execution is enabled but required bindings are missing.',
      details: {
        enabled: asyncQueueEnabled,
        queue_binding: Boolean(_env.ASYNC_TOOL_QUEUE),
        kv_binding: Boolean(_env.ASYNC_JOBS_KV),
      },
    };
    const payload = buildRuntimeReadinessPayload({
      workerRole: 'mcp',
      checks: {
        runtime: { status: 'pass', message: 'MCP Worker request runtime is available.' },
        mcp_v2: { status: 'pass', message: 'MCP SDK v2 stateless handler is configured.' },
        async_queue: asyncQueueCheck,
      },
    });
    return new Response(JSON.stringify(payload), {
      status: runtimeReadinessStatusCode(payload.status),
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  },
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
    withCors,
    getClientIdentifier: platform.workerObservabilityRuntime.getClientIdentifier,
    getAuthRateLimitedResponse: platform.workerDurableRuntime.getAuthRateLimitedResponse,
    probeAuthRateLimit: platform.workerDurableRuntime.probeAuthRateLimit,
    recordAuthFailure: platform.workerDurableRuntime.recordAuthFailure,
    clearAuthFailures: platform.workerDurableRuntime.clearAuthFailures,
    evaluateMcpBoundaryRequest: platform.workerDurableRuntime.evaluateMcpBoundaryRequest,
    onAuthorizedRequest: (request, env, principal) =>
      workerMcpAiRuntime.recordAuthorizedMcpUsage(request, env, principal),
  },
});

export default {
  async fetch(request: Request, env: WorkerMcpEnv, ctx: ExecutionContext): Promise<Response> {
    return handleMcpWorkerFetch(request, env, ctx);
  },
  async queue(batch: MessageBatch<AsyncJobMessage>, env: WorkerMcpEnv): Promise<void> {
    const runtime = createWorkerRuntime(env);
    const { logger, toolRegistry } = runtime;

    for (const message of batch.messages) {
      await processAsyncQueueMessage({
        // Cloudflare Queue, rather than application code, owns redelivery.
        env,
        logger,
        message: message.body,
        execute: async (request, requestId, userId) =>
          await toolRegistry.execute(request, {
            logger,
            requestId,
            ...(userId ? { userId } : {}),
          }),
        onAsyncJobUpdate: (telemetryEnv, status, toolName, attempts) =>
          platform.cloudflareTelemetryRuntime.recordAsyncJobUpdate(
            telemetryEnv as WorkerMcpEnv,
            status,
            toolName,
            attempts,
          ),
      })
        .then((disposition) => {
          if (disposition.action === 'retry') {
            message.retry(
              disposition.delaySeconds > 0 ? { delaySeconds: disposition.delaySeconds } : undefined,
            );
            return;
          }
          message.ack();
        })
        .catch((error: unknown) => {
          logger.error(
            'Async queue consumer failed before terminal disposition',
            error instanceof Error ? error : new Error(String(error)),
            { jobId: message.body.jobId, attempts: message.attempts },
          );
          message.retry();
        });
    }
  },
};
