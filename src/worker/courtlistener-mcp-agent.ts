/// <reference types="@cloudflare/workers-types" />

import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { generateId } from '../common/utils.js';
import { bootstrapServices } from '../infrastructure/bootstrap.js';
import { container } from '../infrastructure/container.js';
import { SERVER_CAPABILITIES, SERVER_INFO } from '../infrastructure/protocol-constants.js';
import type { Logger } from '../infrastructure/logger.js';
import type { MetricsCollector } from '../infrastructure/metrics.js';
import { ToolHandlerRegistry } from '../server/tool-handler.js';
import { ResourceHandlerRegistry } from '../server/resource-handler.js';
import { PromptHandlerRegistry } from '../server/prompt-handler.js';
import { SubscriptionManager } from '../server/subscription-manager.js';
import { buildToolDefinitions, buildEnhancedMetadata } from '../server/tool-builder.js';
import { setupHandlers } from '../server/handler-registry.js';
import { createDirectToolExecutionService } from '../server/tool-execution-service.js';
import type { WorkerMcpEnv } from '../server/worker-runtime-contract.js';
import { createCloudflareAiParamGenerator } from '../server/cloudflare-ai-param-generator.js';
import {
  CloudflareAsyncQueueWorkflow,
  type AsyncJobMessage,
} from '../server/worker-async-queue-runtime.js';
import type { CloudflareTelemetryRuntime } from '../server/worker-cloudflare-telemetry-runtime.js';

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
    { capabilities: SERVER_CAPABILITIES },
  ) as unknown as InstanceType<typeof McpAgent>['server'];

  async init(): Promise<void> {
    if (this.servicesInitialized) {
      return;
    }
    const env = (this as unknown as { env: CourtListenerMcpAgentEnv }).env;
    if (env.COURTLISTENER_API_KEY) {
      process.env.COURTLISTENER_API_KEY = env.COURTLISTENER_API_KEY;
    }

    bootstrapServices();

    const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    const resourceRegistry = container.get<ResourceHandlerRegistry>('resourceRegistry');
    const promptRegistry = container.get<PromptHandlerRegistry>('promptRegistry');
    const logger = container.get<Logger>('logger');
    const metrics = container.get<MetricsCollector>('metrics');
    const enhancedMetadata = buildEnhancedMetadata();
    const queueBackedAsyncWorkflow =
      env.ASYNC_TOOL_QUEUE && env.ASYNC_JOBS_KV
        ? new CloudflareAsyncQueueWorkflow(env, {
            logger,
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
    const llmParamGenerator = createCloudflareAiParamGenerator(env);
    const toolExecutionService = createDirectToolExecutionService({
      toolRegistry,
      logger,
      ...(queueBackedAsyncWorkflow ? { asyncWorkflow: queueBackedAsyncWorkflow } : {}),
      getToolContextExtras: () => (llmParamGenerator ? { llmParamGenerator } : {}),
    });

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
    this.servicesInitialized = true;
  }
}

export type { AsyncJobMessage };
