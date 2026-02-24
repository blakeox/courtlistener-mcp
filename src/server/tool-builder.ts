import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getEnhancedToolDefinitions } from '../tool-definitions.js';
import { ToolHandlerRegistry } from './tool-handler.js';

export interface ToolMetadata {
  name: string;
  category?: string;
  complexity?: string;
  rateLimitWeight?: number;
  examples?: Array<{
    name: string;
    description: string;
    arguments: Record<string, unknown>;
  }>;
  description?: string;
  outputSchema?: {
    type: 'object';
    properties: Record<string, object>;
    required?: string[];
  };
}

/**
 * Build enhanced metadata map from tool definitions
 */
export function buildEnhancedMetadata(): Map<string, ToolMetadata> {
  const metadataMap = new Map<string, ToolMetadata>();

  for (const tool of getEnhancedToolDefinitions()) {
    metadataMap.set(tool.name, {
      name: tool.name,
      category: tool.category,
      complexity: tool.complexity,
      rateLimitWeight: tool.rateLimitWeight,
      description: tool.description,
      examples: tool.examples,
      outputSchema: tool.outputSchema,
    });
  }

  return metadataMap;
}

/**
 * Build MCP-compliant tool definitions with enhanced metadata and annotations
 */
export function buildToolDefinitions(
  toolRegistry: ToolHandlerRegistry,
  enhancedToolMetadata: Map<string, ToolMetadata>,
): Tool[] {
  const baseDefinitions = toolRegistry.getToolDefinitions();

  return baseDefinitions.map((tool) => {
    const metadata = enhancedToolMetadata.get(tool.name);
    const handler = toolRegistry.get(tool.name);
    // Ensure inputSchema has the required 'type' field for MCP Tool format
    const inputSchema =
      tool.inputSchema && typeof tool.inputSchema === 'object' && 'type' in tool.inputSchema
        ? tool.inputSchema
        : { type: 'object' as const, properties: tool.inputSchema || {} };

    return {
      name: tool.name,
      description: metadata?.description ?? tool.description,
      inputSchema: inputSchema as Tool['inputSchema'],
      ...(metadata?.outputSchema && { outputSchema: metadata.outputSchema }),
      ...(handler?.annotations && { annotations: handler.annotations }),
      ...(handler?.title && { title: handler.title }),
    } satisfies Tool;
  });
}
