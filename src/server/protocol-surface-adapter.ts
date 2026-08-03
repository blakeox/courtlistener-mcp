import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  CallToolResult,
  CreateTaskResult,
  GetPromptRequestSchema,
  GetPromptResult,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  Prompt,
  ReadResourceResult,
  ReadResourceRequestSchema,
  Resource,
  ResourceTemplate,
  SubscribeRequestSchema,
  Tool,
  UnsubscribeRequestSchema,
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { Logger } from '../infrastructure/logger.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { resolveMcpSessionId } from './mcp-session-context.js';
import { registerMcpSessionCleanup } from './mcp-session-cleanup.js';
import { createMcpProgressReporter, type McpProgressReporter } from './mcp-progress-reporter.js';
import { SubscriptionManager } from './subscription-manager.js';
import type { AsyncWorkflowTaskStore } from './async-workflow-task-store.js';
import { ProtocolListChangedNotifier } from './protocol-list-changed-notifier.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';

interface BaseHandlerDependencies {
  server: Server;
  logger: Logger;
  metrics: MetricsCollector;
  subscriptionManager: SubscriptionManager;
  listChangedNotifier: ProtocolListChangedNotifier;
}

interface ProtocolSurfaceOperations {
  listTools: () => Promise<{ tools: Tool[]; metadata: { categories: string[] } }>;
  listResources: () => Promise<{ resources: Resource[] }>;
  listResourceTemplates: () => Promise<{ resourceTemplates: ResourceTemplate[] }>;
  readResource: (uri: string) => Promise<ReadResourceResult>;
  listPrompts: () => Promise<{ prompts: Prompt[] }>;
  getPrompt: (name: string, args?: Record<string, string>) => Promise<GetPromptResult>;
  executeTool: (
    request: CallToolRequest,
    context?: {
      extra?: RequestHandlerExtra<ServerRequest, ServerNotification>;
      progress?: McpProgressReporter;
      nativeTasksEnabled?: boolean;
      taskStore?: AsyncWorkflowTaskStore;
    },
  ) => Promise<CallToolResult | CreateTaskResult>;
}

export type HandlerDependencies = BaseHandlerDependencies & ProtocolSurfaceOperations;

export function registerProtocolSurfaceHandlers(deps: HandlerDependencies): void {
  deps.subscriptionManager.bindServer(deps.server);
  deps.listChangedNotifier.bindServer(deps.server);
  registerMcpSessionCleanup(deps.server, (sessionId) => {
    deps.subscriptionManager.removeSession(sessionId);
  });
  registerDiscoveryHandlers(deps, deps);
  registerResourceHandlers(deps, deps);
  registerSubscriptionHandlers(deps);
  registerPromptHandlers(deps, deps);
  registerToolExecutionHandler(deps, deps);
}

function registerDiscoveryHandlers(
  { server, logger, metrics }: BaseHandlerDependencies,
  operations: ProtocolSurfaceOperations,
): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const timer = logger.startTimer('list_tools');

    try {
      const result = await operations.listTools();
      const duration = timer.end(true, { toolCount: result.tools.length });
      metrics.recordRequest(duration, false, 'mcp.list_tools');

      return result;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration, 'mcp.list_tools');
      throw error;
    }
  });
}

function registerResourceHandlers(
  { server, logger, metrics, subscriptionManager }: BaseHandlerDependencies,
  operations: ProtocolSurfaceOperations,
): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const timer = logger.startTimer('list_resources');
    try {
      const result = await operations.listResources();
      const duration = timer.end(true, { resourceCount: result.resources.length });
      metrics.recordRequest(duration, false, 'mcp.list_resources');
      return result;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration, 'mcp.list_resources');
      throw error;
    }
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    const timer = logger.startTimer('list_resource_templates');
    try {
      const result = await operations.listResourceTemplates();
      const duration = timer.end(true, {
        resourceTemplateCount: result.resourceTemplates.length,
      });
      metrics.recordRequest(duration, false, 'mcp.list_resource_templates');
      return result;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration, 'mcp.list_resource_templates');
      throw error;
    }
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
    const timer = logger.startTimer('read_resource');
    const uri = request.params.uri;

    try {
      const result = await operations.readResource(uri);

      const duration = timer.end(true);
      metrics.recordRequest(duration, false, 'mcp.read_resource');

      const sessionId = resolveMcpSessionId(extra);
      if (subscriptionManager.getSubscribers(uri).has(sessionId)) {
        await subscriptionManager.notifyResourceUpdated(uri);
        subscriptionManager.markResourceActivity(uri);
      }

      return result;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration, 'mcp.read_resource');
      throw error;
    }
  });
}

function registerSubscriptionHandlers({
  server,
  logger,
  subscriptionManager,
}: BaseHandlerDependencies): void {
  server.setRequestHandler(SubscribeRequestSchema, async (request, extra) => {
    const uri = request.params.uri;
    const sessionId = resolveMcpSessionId(extra);
    subscriptionManager.subscribe(uri, sessionId);
    logger.info('Client subscribed to resource', { uri, sessionId });
    return {};
  });

  server.setRequestHandler(UnsubscribeRequestSchema, async (request, extra) => {
    const uri = request.params.uri;
    const sessionId = resolveMcpSessionId(extra);
    subscriptionManager.unsubscribe(uri, sessionId);
    logger.info('Client unsubscribed from resource', { uri, sessionId });
    return {};
  });
}

function registerPromptHandlers(
  { server, logger, metrics }: BaseHandlerDependencies,
  operations: ProtocolSurfaceOperations,
): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const timer = logger.startTimer('list_prompts');
    try {
      const result = await operations.listPrompts();
      const duration = timer.end(true, { promptCount: result.prompts.length });
      metrics.recordRequest(duration, false, 'mcp.list_prompts');
      return result;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration, 'mcp.list_prompts');
      throw error;
    }
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request, extra) => {
    const timer = logger.startTimer('get_prompt');
    const name = request.params.name;
    const args = request.params.arguments || {};

    try {
      const stringArgs: Record<string, string> = {};
      for (const [key, value] of Object.entries(args)) {
        stringArgs[key] = String(value);
      }

      const result = await operations.getPrompt(name, stringArgs);

      const duration = timer.end(true, { sessionId: resolveMcpSessionId(extra) });
      metrics.recordRequest(duration, false, 'mcp.get_prompt');
      return result;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration, 'mcp.get_prompt');
      throw error;
    }
  });
}

function registerToolExecutionHandler(
  { server }: BaseHandlerDependencies,
  operations: ProtocolSurfaceOperations,
): void {
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const progress = createMcpProgressReporter(extra);
    return operations.executeTool(request, { extra, progress });
  });
}
