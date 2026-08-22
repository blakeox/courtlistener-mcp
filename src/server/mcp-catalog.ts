import { fromJsonSchema, McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';

import { generateId } from '../common/utils.js';
import type { Logger } from '../infrastructure/logger.js';
import { buildEnhancedMetadata, buildToolDefinitions } from './tool-builder.js';
import type { PromptHandlerRegistry } from './prompt-handler.js';
import type { ResourceHandlerRegistry } from './resource-handler.js';
import type { ToolHandlerRegistry } from './tool-handler.js';

export interface McpCatalogRegistrationDeps {
  server: McpServer;
  logger: Logger;
  toolRegistry: ToolHandlerRegistry;
  resourceRegistry: ResourceHandlerRegistry;
  promptRegistry: PromptHandlerRegistry;
  executeTool: (toolName: string, arguments_: unknown) => Promise<CallToolResult>;
}

/** Register the complete MCP catalog without coupling it to a transport runtime. */
export function registerMcpCatalog({
  server,
  logger,
  toolRegistry,
  resourceRegistry,
  promptRegistry,
  executeTool,
}: McpCatalogRegistrationDeps): void {
  for (const tool of buildToolDefinitions(toolRegistry, buildEnhancedMetadata())) {
    const inputSchema = fromJsonSchema(tool.inputSchema as Record<string, unknown>);
    const outputSchema = tool.outputSchema
      ? fromJsonSchema(tool.outputSchema as Record<string, unknown>)
      : undefined;

    server.registerTool(
      tool.name,
      {
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema,
        ...(outputSchema ? { outputSchema } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
        ...(tool.title ? { title: tool.title } : {}),
        ...(tool._meta ? { _meta: tool._meta } : {}),
      },
      (arguments_) => executeTool(tool.name, arguments_),
    );
  }

  for (const resource of resourceRegistry.getAllResources()) {
    const handler = resourceRegistry.findHandler(resource.uri);
    if (!handler) continue;

    server.registerResource(
      resource.name,
      resource.uri,
      {
        ...(resource.title || resource.name ? { title: resource.title ?? resource.name } : {}),
        ...(resource.description ? { description: resource.description } : {}),
        ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
      },
      async (uri) => handler.read(uri.href, { logger, requestId: generateId() }),
    );
  }

  for (const template of resourceRegistry.getAllResourceTemplates()) {
    const handler = resourceRegistry.getHandlerByTemplate(template.uriTemplate);
    if (!handler) continue;

    server.registerResource(
      template.name,
      new ResourceTemplate(template.uriTemplate, {
        list: async () => ({ resources: handler.list() }),
      }),
      {
        ...(template.title || template.name ? { title: template.title ?? template.name } : {}),
        ...(template.description ? { description: template.description } : {}),
        ...(template.mimeType ? { mimeType: template.mimeType } : {}),
      },
      async (uri) => handler.read(uri.href, { logger, requestId: generateId() }),
    );
  }

  for (const prompt of promptRegistry.getAllPrompts()) {
    const handler = promptRegistry.findHandler(prompt.name);
    if (!handler) continue;

    server.registerPrompt(
      prompt.name,
      {
        ...(prompt.title ? { title: prompt.title } : {}),
        ...(prompt.description ? { description: prompt.description } : {}),
        argsSchema: fromJsonSchema({
          type: 'object',
          properties: Object.fromEntries(
            (prompt.arguments ?? []).map((argument) => [argument.name, { type: 'string' }]),
          ),
          required: (prompt.arguments ?? [])
            .filter((argument) => argument.required)
            .map((argument) => argument.name),
        }),
      },
      async (arguments_) => handler.getMessages(arguments_ as Record<string, string>),
    );
  }
}
