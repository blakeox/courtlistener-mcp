import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  CallToolResult,
  GetPromptRequestSchema,
  GetPromptResult,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  Prompt,
  ReadResourceResult,
  ReadResourceRequestSchema,
  Resource,
  SubscribeRequestSchema,
  Tool,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Logger } from '../infrastructure/logger.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { SubscriptionManager } from './subscription-manager.js';

interface BaseHandlerDependencies {
  server: Server;
  logger: Logger;
  metrics: MetricsCollector;
  subscriptionManager: SubscriptionManager;
}

interface ProtocolSurfaceOperations {
  listTools: () => Promise<{ tools: Tool[]; metadata: { categories: string[] } }>;
  listResources: () => Promise<{ resources: Resource[] }>;
  readResource: (uri: string) => Promise<ReadResourceResult>;
  listPrompts: () => Promise<{ prompts: Prompt[] }>;
  getPrompt: (name: string, args?: Record<string, string>) => Promise<GetPromptResult>;
  executeTool: (request: CallToolRequest) => Promise<CallToolResult>;
}

export type HandlerDependencies = BaseHandlerDependencies & ProtocolSurfaceOperations;

export function registerProtocolSurfaceHandlers(deps: HandlerDependencies): void {
  registerDiscoveryHandlers(deps, deps);
  registerResourceHandlers(deps, deps);
  registerSubscriptionHandlers(deps);
  registerPromptHandlers(deps, deps);
  registerToolExecutionHandler(deps, deps);
}

function registerDiscoveryHandlers({
  server,
  logger,
  metrics,
}: BaseHandlerDependencies, operations: ProtocolSurfaceOperations): void {
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

function registerResourceHandlers({
  server,
  logger,
  metrics,
}: BaseHandlerDependencies, operations: ProtocolSurfaceOperations): void {
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

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const timer = logger.startTimer('read_resource');
    const uri = request.params.uri;

    try {
      const result = await operations.readResource(uri);

      const duration = timer.end(true);
      metrics.recordRequest(duration, false, 'mcp.read_resource');
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
  server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    const uri = request.params.uri;
    subscriptionManager.subscribe(uri, 'default');
    logger.info('Client subscribed to resource', { uri });
    return {};
  });

  server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    const uri = request.params.uri;
    subscriptionManager.unsubscribe(uri, 'default');
    logger.info('Client unsubscribed from resource', { uri });
    return {};
  });
}

function registerPromptHandlers({
  server,
  logger,
  metrics,
}: BaseHandlerDependencies, operations: ProtocolSurfaceOperations): void {
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

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const timer = logger.startTimer('get_prompt');
    const name = request.params.name;
    const args = request.params.arguments || {};

    try {
      const stringArgs: Record<string, string> = {};
      for (const [key, value] of Object.entries(args)) {
        stringArgs[key] = String(value);
      }

      const result = await operations.getPrompt(name, stringArgs);

      const duration = timer.end(true);
      metrics.recordRequest(duration, false, 'mcp.get_prompt');
      return result;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration, 'mcp.get_prompt');
      throw error;
    }
  });
}

function registerToolExecutionHandler({
  server,
}: BaseHandlerDependencies, operations: ProtocolSurfaceOperations): void {
  server.setRequestHandler(CallToolRequestSchema, operations.executeTool);
}
