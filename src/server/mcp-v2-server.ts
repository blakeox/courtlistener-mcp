import { McpServer } from '@modelcontextprotocol/server';
import type {
  CallToolRequest,
  CallToolResult,
  GetPromptResult,
  Prompt,
  ReadResourceResult,
  Resource,
  Tool,
} from '@modelcontextprotocol/server';
import { generateId } from '../common/utils.js';
import { MCP_SERVER_INSTRUCTIONS } from '../infrastructure/mcp-server-instructions.js';
import {
  SERVER_INFO,
  buildServerCapabilities,
  resolveProtocolFeatureFlags,
} from '../infrastructure/protocol-constants.js';
import { bootstrapServices } from '../infrastructure/bootstrap.js';
import { container } from '../infrastructure/container.js';
import type { Logger } from '../infrastructure/logger.js';
import type { ServerConfig } from '../types.js';
import { createDirectToolExecutionService } from './tool-execution-service.js';
import { AsyncToolWorkflowOrchestrator } from './async-tool-workflow.js';
import { buildEnhancedMetadata, buildToolDefinitions } from './tool-builder.js';
import { PromptHandlerRegistry } from './prompt-handler.js';
import { ResourceHandlerRegistry } from './resource-handler.js';
import { ToolHandlerRegistry } from './tool-handler.js';
import { registerMcpCatalog } from './mcp-catalog.js';

function ensureBootstrapped(): void {
  if (!container.has('logger') || !container.has('config')) {
    bootstrapServices(process.env);
  }
}

export function createLocalMcpV2Server(): McpServer {
  ensureBootstrapped();

  const logger = container.get<Logger>('logger');
  const config = container.get<ServerConfig>('config');
  const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
  const resourceRegistry = container.get<ResourceHandlerRegistry>('resourceRegistry');
  const promptRegistry = container.get<PromptHandlerRegistry>('promptRegistry');
  const asyncWorkflow = new AsyncToolWorkflowOrchestrator(logger, config.asyncExecution);
  const executionService = createDirectToolExecutionService({
    toolRegistry,
    logger,
    asyncWorkflow,
  });
  const flags = resolveProtocolFeatureFlags();
  const server = new McpServer(
    { name: SERVER_INFO.name, version: SERVER_INFO.version },
    {
      capabilities: buildServerCapabilities(flags),
      instructions: MCP_SERVER_INSTRUCTIONS,
    },
  );

  registerMcpCatalog({
    server,
    logger,
    toolRegistry,
    resourceRegistry,
    promptRegistry,
    executeTool: (toolName, arguments_) =>
      executionService.execute(
        {
          jsonrpc: '2.0',
          id: generateId(),
          method: 'tools/call',
          params: { name: toolName, arguments: arguments_ },
        } as never,
        generateId(),
        { nativeTasksEnabled: false },
      ) as Promise<CallToolResult>,
  });

  return server;
}

/**
 * Programmatic v2 runtime for callers that need direct catalog or tool access.
 *
 * This deliberately has no transport lifecycle. Stdio and HTTP own transport
 * startup separately, so embedding code cannot accidentally create a second
 * transport runtime.
 */
export class LocalMcpV2Runtime {
  private readonly toolRegistry: ToolHandlerRegistry;
  private readonly resourceRegistry: ResourceHandlerRegistry;
  private readonly promptRegistry: PromptHandlerRegistry;
  private readonly executionService: ReturnType<typeof createDirectToolExecutionService>;

  constructor() {
    ensureBootstrapped();
    const logger = container.get<Logger>('logger');
    const config = container.get<ServerConfig>('config');
    this.toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    this.resourceRegistry = container.get<ResourceHandlerRegistry>('resourceRegistry');
    this.promptRegistry = container.get<PromptHandlerRegistry>('promptRegistry');
    this.executionService = createDirectToolExecutionService({
      toolRegistry: this.toolRegistry,
      logger,
      asyncWorkflow: new AsyncToolWorkflowOrchestrator(logger, config.asyncExecution),
    });
  }

  async listTools(): Promise<{ tools: Tool[]; metadata: { categories: string[] } }> {
    return {
      tools: this.toolDefinitions(),
      metadata: { categories: this.toolRegistry.getCategories() },
    };
  }

  toolDefinitions(): Tool[] {
    return buildToolDefinitions(this.toolRegistry, buildEnhancedMetadata()) as Tool[];
  }

  async listResources(): Promise<{ resources: Resource[] }> {
    return { resources: this.resourceRegistry.getAllResources() as Resource[] };
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    const handler = this.resourceRegistry.findHandler(uri);
    if (!handler) throw new Error(`Resource not found: ${uri}`);
    const logger = container.get<Logger>('logger');
    return handler.read(uri, { logger, requestId: generateId() }) as Promise<ReadResourceResult>;
  }

  async listPrompts(): Promise<{ prompts: Prompt[] }> {
    return { prompts: this.promptRegistry.getAllPrompts() as Prompt[] };
  }

  async getPrompt(name: string, args: Record<string, string> = {}): Promise<GetPromptResult> {
    const handler = this.promptRegistry.findHandler(name);
    if (!handler) throw new Error(`Prompt not found: ${name}`);
    return handler.getMessages(args) as Promise<GetPromptResult>;
  }

  async handleToolCall(
    input: CallToolRequest | { name: string; arguments?: Record<string, unknown> },
  ): Promise<CallToolResult> {
    const request =
      'params' in input
        ? input
        : {
            jsonrpc: '2.0' as const,
            id: generateId(),
            method: 'tools/call' as const,
            params: { name: input.name, arguments: input.arguments ?? {} },
          };
    return this.executionService.execute(request as never, generateId(), {
      nativeTasksEnabled: false,
    }) as Promise<CallToolResult>;
  }
}
