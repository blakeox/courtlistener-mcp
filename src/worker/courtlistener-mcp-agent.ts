/// <reference types="@cloudflare/workers-types" />

import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { generateId } from '../common/utils.js';
import {
  SERVER_INFO,
  buildServerCapabilities,
  resolveProtocolFeatureFlags,
} from '../infrastructure/protocol-constants.js';
import { MCP_SERVER_INSTRUCTIONS } from '../infrastructure/mcp-server-instructions.js';
import { SubscriptionManager } from '../server/subscription-manager.js';
import { wireCatalogListChangedNotifiers } from '../server/catalog-list-changed-wiring.js';
import { buildToolDefinitions, buildEnhancedMetadata } from '../server/tool-builder.js';
import { attachMcpLoggingBridge } from '../server/mcp-logging-bridge.js';
import { setupHandlers } from '../server/handler-registry.js';
import { createDirectToolExecutionService } from '../server/tool-execution-service.js';
import type { WorkerMcpEnv } from '../server/worker-runtime-contract.js';
import type { CloudflareTelemetryRuntime } from '../server/worker-cloudflare-telemetry-runtime.js';
import { createWorkerRuntime } from '../server/worker-runtime-factory.js';
import { createCloudflareAiParamGenerator } from '../server/cloudflare-ai-param-generator.js';
import { AsyncToolWorkflowOrchestrator } from '../server/async-tool-workflow.js';
import { AsyncWorkflowTaskStore } from '../server/async-workflow-task-store.js';
import { createOrchestratorPublicJobPort } from '../server/async-public-job-port.js';
import {
  CloudflareAsyncQueueWorkflow,
  createQueuePublicJobPort,
  type AsyncJobMessage,
} from '../server/worker-async-queue-runtime.js';

export type CourtListenerMcpAgentEnv = WorkerMcpEnv;

export interface CourtListenerMcpAgentTelemetry {
  recordAsyncJobUpdate: CloudflareTelemetryRuntime<WorkerMcpEnv>['recordAsyncJobUpdate'];
}

/**
 * MCP session Durable Object — one instance per connected MCP client.
 * Lives on the MCP worker script only (not the edge/portal worker).
 */
export class CourtListenerMCP extends (McpAgent as typeof McpAgent<CourtListenerMcpAgentEnv>) {
  static override options = {
    hibernate: true,
  };

  /** Set from `worker-mcp.ts` before handling requests. */
  static telemetry: CourtListenerMcpAgentTelemetry | null = null;

  private servicesInitialized = false;

  server = new McpServer(
    { name: SERVER_INFO.name, version: SERVER_INFO.version },
    {
      capabilities: buildServerCapabilities(resolveProtocolFeatureFlags({})),
      instructions: MCP_SERVER_INSTRUCTIONS,
    },
  ) as unknown as InstanceType<typeof McpAgent>['server'];

  async init(): Promise<void> {
    if (this.servicesInitialized) {
      return;
    }
    const env = (this as unknown as { env: CourtListenerMcpAgentEnv }).env;
    const runtime = createWorkerRuntime(env);
    const { logger, metrics, promptRegistry, protocolFlags, resourceRegistry, toolRegistry } =
      runtime;
    const enhancedMetadata = buildEnhancedMetadata();
    const queueBackedAsyncWorkflow =
      env.ASYNC_TOOL_QUEUE && env.ASYNC_JOBS_KV
        ? new CloudflareAsyncQueueWorkflow(env, {
            logger,
            isReadOnlyTool: (toolName) => {
              const annotations = toolRegistry.get(toolName)?.annotations;
              return annotations?.readOnlyHint === true && annotations.destructiveHint !== true;
            },
            recordLatencyMetric: (metric, durationMs) => {
              metrics.recordLatencyMetric(metric, durationMs);
            },
            recordCostGuardrail: (metric, value, threshold) => {
              metrics.recordCostGuardrail(`async.${metric}`, value, threshold);
            },
            onAsyncJobUpdate:
              CourtListenerMCP.telemetry?.recordAsyncJobUpdate ??
              (() => {
                /* optional — wired from worker-mcp entry */
              }),
          })
        : undefined;
    const inMemoryAsyncWorkflow =
      queueBackedAsyncWorkflow ?? new AsyncToolWorkflowOrchestrator(logger, { enabled: true });
    const taskStore = protocolFlags.NATIVE_TASKS
      ? new AsyncWorkflowTaskStore(
          queueBackedAsyncWorkflow
            ? createQueuePublicJobPort(queueBackedAsyncWorkflow)
            : createOrchestratorPublicJobPort(
                inMemoryAsyncWorkflow as AsyncToolWorkflowOrchestrator,
              ),
        )
      : undefined;

    const mcpServer = new McpServer(
      { name: SERVER_INFO.name, version: SERVER_INFO.version },
      {
        capabilities: buildServerCapabilities(protocolFlags),
        instructions: MCP_SERVER_INSTRUCTIONS,
        ...(taskStore ? { taskStore } : {}),
      },
    );
    this.server = mcpServer as unknown as InstanceType<typeof McpAgent>['server'];

    const llmParamGenerator = createCloudflareAiParamGenerator(env);
    const toolExecutionService = createDirectToolExecutionService({
      toolRegistry,
      logger,
      asyncWorkflow: inMemoryAsyncWorkflow,
      getToolContextExtras: () => (llmParamGenerator ? { llmParamGenerator } : {}),
    });

    const lowLevelServer = (this.server as unknown as McpServer).server;
    const subscriptionManager = new SubscriptionManager();
    subscriptionManager.setRefreshTtlResolver((uri) =>
      resourceRegistry.getSubscriptionRefreshTtlMs(uri),
    );
    const listChangedNotifier = wireCatalogListChangedNotifiers({
      enabled: protocolFlags.LIST_CHANGED,
      toolRegistry,
      resourceRegistry,
      promptRegistry,
    });

    attachMcpLoggingBridge(lowLevelServer, logger, {
      enabled: protocolFlags.LOGGING,
    });

    setupHandlers({
      server: lowLevelServer,
      logger,
      metrics,
      subscriptionManager,
      listChangedNotifier,
      listTools: async () => ({
        tools: buildToolDefinitions(toolRegistry, enhancedMetadata),
        metadata: { categories: toolRegistry.getCategories() },
      }),
      listResources: async () => ({ resources: resourceRegistry.getAllResources() }),
      listResourceTemplates: async () => ({
        resourceTemplates: resourceRegistry.getAllResourceTemplates(),
      }),
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
      executeTool: async (req, context) => {
        try {
          return (await toolExecutionService.execute(req, generateId(), {
            ...(context?.progress ? { progress: context.progress } : {}),
            nativeTasksEnabled: Boolean(taskStore),
            ...(taskStore ? { taskStore } : {}),
          })) as CallToolResult;
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
    this.servicesInitialized = true;
  }
}

export type { AsyncJobMessage };
