import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { generateId } from '../common/utils.js';
import { Logger } from '../infrastructure/logger.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { ToolHandlerRegistry } from './tool-handler.js';
import { ResourceHandlerRegistry } from './resource-handler.js';
import { PromptHandlerRegistry } from './prompt-handler.js';
import { SubscriptionManager } from './subscription-manager.js';

export interface HandlerDependencies {
  server: Server;
  logger: Logger;
  metrics: MetricsCollector;
  toolRegistry: ToolHandlerRegistry;
  resourceRegistry: ResourceHandlerRegistry;
  promptRegistry: PromptHandlerRegistry;
  subscriptionManager: SubscriptionManager;
  isShuttingDown: () => boolean;
  activeRequests: Set<string>;
  buildToolDefinitions: () => Tool[];
  executeToolWithMiddleware: (
    request: CallToolRequest,
    requestId: string,
  ) => Promise<CallToolResult>;
}

/**
 * Register all MCP protocol handlers on the given server instance
 */
export function setupHandlers(deps: HandlerDependencies): void {
  const {
    server,
    logger,
    metrics,
    toolRegistry,
    resourceRegistry,
    promptRegistry,
    subscriptionManager,
    isShuttingDown,
    activeRequests,
    buildToolDefinitions,
    executeToolWithMiddleware,
  } = deps;

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const timer = logger.startTimer('list_tools');

    try {
      const tools = buildToolDefinitions();
      const duration = timer.end(true, { toolCount: tools.length });
      metrics.recordRequest(duration, false);

      return {
        tools,
        metadata: {
          categories: toolRegistry.getCategories(),
        },
      };
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration);
      throw error;
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const timer = logger.startTimer('list_resources');
    try {
      const resources = resourceRegistry.getAllResources();
      const duration = timer.end(true, { resourceCount: resources.length });
      metrics.recordRequest(duration, false);
      return { resources };
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration);
      throw error;
    }
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const timer = logger.startTimer('read_resource');
    const uri = request.params.uri;

    try {
      const handler = resourceRegistry.findHandler(uri);
      if (!handler) {
        throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${uri}`);
      }

      const result = await handler.read(uri, {
        logger,
        requestId: generateId(),
      });

      const duration = timer.end(true);
      metrics.recordRequest(duration, false);
      return result;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration);
      throw error;
    }
  });

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

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const timer = logger.startTimer('list_prompts');
    try {
      const prompts = promptRegistry.getAllPrompts();
      const duration = timer.end(true, { promptCount: prompts.length });
      metrics.recordRequest(duration, false);
      return { prompts };
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration);
      throw error;
    }
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const timer = logger.startTimer('get_prompt');
    const name = request.params.name;
    const args = request.params.arguments || {};

    try {
      const handler = promptRegistry.findHandler(name);
      if (!handler) {
        throw new McpError(ErrorCode.InvalidRequest, `Prompt not found: ${name}`);
      }

      // Convert arguments to Record<string, string> as expected by PromptHandler
      const stringArgs: Record<string, string> = {};
      for (const [key, value] of Object.entries(args)) {
        stringArgs[key] = String(value);
      }

      const result = await handler.getMessages(stringArgs);

      const duration = timer.end(true);
      metrics.recordRequest(duration, false);
      return result;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      metrics.recordFailure(duration);
      throw error;
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (isShuttingDown()) {
      throw new McpError(ErrorCode.InternalError, 'Server is shutting down');
    }

    const requestId = generateId();
    activeRequests.add(requestId);

    try {
      return await executeToolWithMiddleware(request, requestId);
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Error executing ${request.params.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      activeRequests.delete(requestId);
    }
  });
}
