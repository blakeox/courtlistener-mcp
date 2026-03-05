import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getEnhancedToolDefinitions } from '../tool-definitions.js';
import { MCP_ASYNC_CONTROL_TOOLS } from './async-tool-workflow.js';
import { ToolHandlerRegistry } from './tool-handler.js';

export interface ToolMetadata {
  name: string;
  title?: string;
  category?: string;
  complexity?: 'simple' | 'intermediate' | 'advanced';
  rateLimitWeight?: number;
  asyncSupported?: boolean;
  costHint?: 'low' | 'medium' | 'high';
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

const TOOL_UX_META_KEY = 'courtlistener/ux';

function buildHumanTitle(name: string): string {
  return name
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getCostHint(weight: number): 'low' | 'medium' | 'high' {
  if (weight <= 1) return 'low';
  if (weight <= 2) return 'medium';
  return 'high';
}

function buildToolUxMetadata(
  toolName: string,
  metadata: ToolMetadata | undefined,
  options: { asyncSupported: boolean; fallbackCategory: string; fallbackComplexity: 'simple' | 'intermediate' | 'advanced' },
): {
  title: string;
  category: string;
  complexity: 'simple' | 'intermediate' | 'advanced';
  async: boolean;
  costHint: 'low' | 'medium' | 'high';
  rateLimitWeight: number;
} {
  const rateLimitWeight = metadata?.rateLimitWeight ?? 1;
  return {
    title: metadata?.title ?? buildHumanTitle(toolName),
    category: metadata?.category ?? options.fallbackCategory,
    complexity: metadata?.complexity ?? options.fallbackComplexity,
    async: metadata?.asyncSupported ?? options.asyncSupported,
    costHint: metadata?.costHint ?? getCostHint(rateLimitWeight),
    rateLimitWeight,
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
      title: buildHumanTitle(tool.name),
      category: tool.category,
      complexity: tool.complexity,
      rateLimitWeight: tool.rateLimitWeight,
      asyncSupported: true,
      costHint: getCostHint(tool.rateLimitWeight),
      description: tool.description,
      ...(tool.examples !== undefined && { examples: tool.examples }),
      ...(tool.outputSchema !== undefined && { outputSchema: tool.outputSchema }),
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
  const registeredToolDefinitions = baseDefinitions.map((tool) => {
    const metadata = enhancedToolMetadata.get(tool.name);
    const handler = toolRegistry.get(tool.name);
    const uxMetadata = buildToolUxMetadata(tool.name, metadata, {
      asyncSupported: true,
      fallbackCategory: 'uncategorized',
      fallbackComplexity: 'intermediate',
    });
    const annotations = handler?.annotations
      ? {
          ...handler.annotations,
          ...(handler.annotations.title ? {} : { title: uxMetadata.title }),
        }
      : { title: uxMetadata.title };
    // Ensure inputSchema has the required 'type' field for MCP Tool format
    const inputSchema =
      tool.inputSchema && typeof tool.inputSchema === 'object' && 'type' in tool.inputSchema
        ? tool.inputSchema
        : { type: 'object' as const, properties: tool.inputSchema || {} };

    return {
      name: tool.name,
      description: metadata?.description ?? tool.description,
      inputSchema: inputSchema as Tool['inputSchema'],
      annotations,
      title: handler?.title ?? uxMetadata.title,
      execution: { taskSupport: 'optional' as const },
      _meta: {
        [TOOL_UX_META_KEY]: uxMetadata,
      },
    } satisfies Tool;
  });

  const asyncControlTools: Tool[] = [
    {
      name: MCP_ASYNC_CONTROL_TOOLS.status,
      title: 'Async Job Status',
      description: 'Get async job status by job ID',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Async job ID returned by async tool execution' },
        },
        required: ['jobId'],
      },
      execution: { taskSupport: 'forbidden' },
      _meta: {
        [TOOL_UX_META_KEY]: buildToolUxMetadata(
          MCP_ASYNC_CONTROL_TOOLS.status,
          { name: MCP_ASYNC_CONTROL_TOOLS.status, title: 'Async Job Status', category: 'async-control', complexity: 'simple' },
          { asyncSupported: false, fallbackCategory: 'async-control', fallbackComplexity: 'simple' },
        ),
      },
    },
    {
      name: MCP_ASYNC_CONTROL_TOOLS.result,
      title: 'Async Job Result',
      description: 'Get async job result payload by job ID',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Async job ID returned by async tool execution' },
        },
        required: ['jobId'],
      },
      execution: { taskSupport: 'forbidden' },
      _meta: {
        [TOOL_UX_META_KEY]: buildToolUxMetadata(
          MCP_ASYNC_CONTROL_TOOLS.result,
          { name: MCP_ASYNC_CONTROL_TOOLS.result, title: 'Async Job Result', category: 'async-control', complexity: 'simple' },
          { asyncSupported: false, fallbackCategory: 'async-control', fallbackComplexity: 'simple' },
        ),
      },
    },
    {
      name: MCP_ASYNC_CONTROL_TOOLS.cancel,
      title: 'Async Job Cancel',
      description: 'Cancel async job execution by job ID',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Async job ID returned by async tool execution' },
        },
        required: ['jobId'],
      },
      execution: { taskSupport: 'forbidden' },
      _meta: {
        [TOOL_UX_META_KEY]: buildToolUxMetadata(
          MCP_ASYNC_CONTROL_TOOLS.cancel,
          { name: MCP_ASYNC_CONTROL_TOOLS.cancel, title: 'Async Job Cancel', category: 'async-control', complexity: 'simple' },
          { asyncSupported: false, fallbackCategory: 'async-control', fallbackComplexity: 'simple' },
        ),
      },
    },
  ];

  return [...registeredToolDefinitions, ...asyncControlTools];
}
