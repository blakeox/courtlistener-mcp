import { Tool, ToolAnnotations } from '@modelcontextprotocol/server';
import { getEnhancedToolDefinitions } from '../tool-definitions.js';
import {
  DEFAULT_QUEUE_OFFLOAD_TOOL_NAMES,
  MCP_ASYNC_CONTROL_TOOLS,
} from './async-tool-workflow.js';
import { ToolHandlerRegistry } from './tool-handler.js';
import { TOOL_OUTPUT_SCHEMAS } from './generated/tool-output-schemas.js';

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

export type ToolCapability = 'read_only' | 'external_mutation';

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

function resolveToolCapability(annotations?: ToolAnnotations): ToolCapability {
  return annotations?.readOnlyHint === true && annotations.destructiveHint !== true
    ? 'read_only'
    : 'external_mutation';
}

function buildToolUxMetadata(
  toolName: string,
  metadata: ToolMetadata | undefined,
  options: {
    asyncSupported: boolean;
    fallbackCategory: string;
    fallbackComplexity: 'simple' | 'intermediate' | 'advanced';
    capability: ToolCapability;
    asyncEligible: boolean;
  },
): {
  title: string;
  category: string;
  complexity: 'simple' | 'intermediate' | 'advanced';
  async: boolean;
  asyncEligible: boolean;
  capability: ToolCapability;
  costHint: 'low' | 'medium' | 'high';
  rateLimitWeight: number;
} {
  const rateLimitWeight = metadata?.rateLimitWeight ?? 1;
  return {
    title: metadata?.title ?? buildHumanTitle(toolName),
    category: metadata?.category ?? options.fallbackCategory,
    complexity: metadata?.complexity ?? options.fallbackComplexity,
    async: metadata?.asyncSupported ?? options.asyncSupported,
    asyncEligible: options.asyncEligible,
    capability: options.capability,
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
    if (!handler?.annotations) {
      throw new Error(`Tool ${tool.name} is missing explicit capability annotations.`);
    }
    const capability = resolveToolCapability(handler?.annotations);
    const uxMetadata = buildToolUxMetadata(tool.name, metadata, {
      asyncSupported: true,
      fallbackCategory: 'uncategorized',
      fallbackComplexity: 'intermediate',
      capability,
      asyncEligible: capability === 'read_only' && DEFAULT_QUEUE_OFFLOAD_TOOL_NAMES.has(tool.name),
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
      ...(TOOL_OUTPUT_SCHEMAS[tool.name] && {
        outputSchema: TOOL_OUTPUT_SCHEMAS[tool.name] as Tool['outputSchema'],
      }),
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
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Async job ID returned by async tool execution' },
        },
        required: ['jobId'],
      },
      outputSchema: TOOL_OUTPUT_SCHEMAS[MCP_ASYNC_CONTROL_TOOLS.status] as Tool['outputSchema'],
      execution: { taskSupport: 'forbidden' },
      _meta: {
        [TOOL_UX_META_KEY]: buildToolUxMetadata(
          MCP_ASYNC_CONTROL_TOOLS.status,
          {
            name: MCP_ASYNC_CONTROL_TOOLS.status,
            title: 'Async Job Status',
            category: 'async-control',
            complexity: 'simple',
          },
          {
            asyncSupported: false,
            fallbackCategory: 'async-control',
            fallbackComplexity: 'simple',
            capability: 'read_only',
            asyncEligible: false,
          },
        ),
      },
    },
    {
      name: MCP_ASYNC_CONTROL_TOOLS.result,
      title: 'Async Job Result',
      description: 'Get async job result payload by job ID',
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Async job ID returned by async tool execution' },
        },
        required: ['jobId'],
      },
      outputSchema: TOOL_OUTPUT_SCHEMAS[MCP_ASYNC_CONTROL_TOOLS.result] as Tool['outputSchema'],
      execution: { taskSupport: 'forbidden' },
      _meta: {
        [TOOL_UX_META_KEY]: buildToolUxMetadata(
          MCP_ASYNC_CONTROL_TOOLS.result,
          {
            name: MCP_ASYNC_CONTROL_TOOLS.result,
            title: 'Async Job Result',
            category: 'async-control',
            complexity: 'simple',
          },
          {
            asyncSupported: false,
            fallbackCategory: 'async-control',
            fallbackComplexity: 'simple',
            capability: 'read_only',
            asyncEligible: false,
          },
        ),
      },
    },
    {
      name: MCP_ASYNC_CONTROL_TOOLS.cancel,
      title: 'Async Job Cancel',
      description: 'Cancel async job execution by job ID',
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Async job ID returned by async tool execution' },
        },
        required: ['jobId'],
      },
      outputSchema: TOOL_OUTPUT_SCHEMAS[MCP_ASYNC_CONTROL_TOOLS.cancel] as Tool['outputSchema'],
      execution: { taskSupport: 'forbidden' },
      _meta: {
        [TOOL_UX_META_KEY]: buildToolUxMetadata(
          MCP_ASYNC_CONTROL_TOOLS.cancel,
          {
            name: MCP_ASYNC_CONTROL_TOOLS.cancel,
            title: 'Async Job Cancel',
            category: 'async-control',
            complexity: 'simple',
          },
          {
            asyncSupported: false,
            fallbackCategory: 'async-control',
            fallbackComplexity: 'simple',
            capability: 'external_mutation',
            asyncEligible: false,
          },
        ),
      },
    },
  ];

  return [...registeredToolDefinitions, ...asyncControlTools];
}
