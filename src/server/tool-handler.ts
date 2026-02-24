/**
 * Tool Handler Strategy Pattern
 * Modular tool handlers that can be dynamically registered and executed
 */

import {
  CallToolRequest,
  CallToolResult,
  ErrorCode,
  McpError,
  ToolAnnotations,
  EmbeddedResource,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Result, success, failure } from '../common/types.js';
import { CacheManager } from '../infrastructure/cache.js';
import { Logger } from '../infrastructure/logger.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { ServerConfig } from '../types.js';

export interface ToolHandler<TInput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly title?: string;
  readonly annotations?: ToolAnnotations;

  /**
   * Validate tool input parameters
   */
  validate(input: unknown): Result<TInput, Error>;

  /**
   * Execute the tool
   */
  execute(input: TInput, context: ToolContext): Promise<CallToolResult>;

  /**
   * Get tool schema definition for MCP
   */
  getSchema(): Record<string, unknown>;
}

import { SamplingService } from './sampling-service.js';

export interface ToolContext {
  logger: Logger;
  requestId: string;
  cache?: CacheManager;
  metrics?: MetricsCollector;
  config?: ServerConfig;
  userId?: string;
  sampling?: SamplingService;
}

export class ToolHandlerRegistry {
  private handlers = new Map<string, ToolHandler>();
  private categories = new Map<string, Set<string>>();

  /**
   * Register a tool handler
   */
  register(handler: ToolHandler): void {
    this.handlers.set(handler.name, handler);

    // Track categories
    let categorySet = this.categories.get(handler.category);
    if (!categorySet) {
      categorySet = new Set();
      this.categories.set(handler.category, categorySet);
    }
    categorySet.add(handler.name);
  }

  /**
   * Get a tool handler by name
   */
  get(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): ToolHandler[] {
    const toolNames = this.categories.get(category) || new Set();
    return Array.from(toolNames)
      .map((name) => this.handlers.get(name))
      .filter((handler): handler is ToolHandler => handler !== undefined);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get tool definitions for MCP
   * Phase 2: Enhanced with metadata from handlers
   */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    metadata?: {
      category?: string;
      complexity?: string;
      rateLimitWeight?: number;
      examples?: Array<{ name: string; description: string; arguments: Record<string, unknown> }>;
      tags?: string[];
      deprecated?: boolean;
      requiresAuth?: boolean;
    };
  }> {
    return Array.from(this.handlers.values()).map((handler) => {
      const baseDefinition = {
        name: handler.name,
        description: handler.description,
        inputSchema: handler.getSchema(),
      };

      // Add enriched metadata if handler is TypedToolHandler
      if (handler instanceof TypedToolHandler) {
        const handlerMetadata = handler.getMetadata();
        if (handlerMetadata) {
          return {
            ...baseDefinition,
            metadata: {
              category: handler.category,
              ...handlerMetadata,
            },
          };
        }
      }

      // Fallback: just category
      return {
        ...baseDefinition,
        metadata: {
          category: handler.category,
        },
      };
    });
  }

  /**
   * Execute a tool with proper error handling
   */
  async execute(request: CallToolRequest, context: ToolContext): Promise<CallToolResult> {
    const handler = this.handlers.get(request.params.name);

    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    // Validate input
    const validationResult = handler.validate(request.params.arguments);
    if (!validationResult.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        validationResult.error?.message ?? 'Invalid parameters',
      );
    }

    // Execute tool
    context.logger.info(`Executing tool: ${handler.name}`, {
      toolName: handler.name,
      category: handler.category,
      requestId: context.requestId,
    });

    return await handler.execute(validationResult.data, context);
  }
}

/**
 * Base class for tool handlers
 */
export abstract class BaseToolHandler<TInput = unknown, _TOutput = unknown>
  implements ToolHandler<TInput>
{
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: string;

  abstract validate(input: unknown): Result<TInput, Error>;
  abstract execute(input: TInput, context: ToolContext): Promise<CallToolResult>;
  abstract getSchema(): Record<string, unknown>;

  /**
   * Helper method to create success result
   */
  protected success(content: string | Record<string, unknown> | Array<unknown>): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
        },
      ],
    };
  }

  /**
   * Helper to create a success result with an embedded resource reference
   */
  protected successWithResource(
    content: string | Record<string, unknown> | Array<unknown>,
    resourceUri: string,
    resourceData: unknown,
  ): CallToolResult {
    const resource: EmbeddedResource = {
      type: 'resource' as const,
      resource: {
        uri: resourceUri,
        mimeType: 'application/json',
        text: JSON.stringify(resourceData),
      },
    };
    return {
      content: [
        {
          type: 'text',
          text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
        },
        resource,
      ],
    };
  }

  /**
   * Helper method to create error result
   */
  protected error(
    message: string,
    details?: Record<string, unknown> | string | number | boolean | null,
  ): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: message,
              details: details || null,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Typed Tool Handler with Automatic Validation and Schema Generation
 *
 * This class provides:
 * - Automatic input validation from Zod schemas
 * - Type inference for input/output
 * - Auto-generated JSON schemas
 * - Reduced boilerplate
 *
 * @example
 * ```typescript
 * const searchSchema = z.object({
 *   query: z.string().optional(),
 *   court: z.string().optional(),
 *   page: z.number().int().min(1).default(1),
 * });
 *
 * export class SearchHandler extends TypedToolHandler {
 *   readonly name = 'search';
 *   readonly description = 'Search cases';
 *   readonly category = 'search';
 *   protected readonly schema = searchSchema;
 *
 *   // Input is automatically typed!
 *   async execute(input: z.infer<typeof searchSchema>, context: ToolContext) {
 *     // TypeScript knows input has query, court, page properties
 *     const results = await this.apiClient.search(input);
 *     return this.success(results);
 *   }
 * }
 * ```
 */
export abstract class TypedToolHandler<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TInput = z.infer<TSchema>,
  TOutput = unknown,
> extends BaseToolHandler<TInput, TOutput> {
  /**
   * Zod schema for input validation
   * Define this in your subclass for automatic validation and type inference
   */
  protected abstract readonly schema: TSchema;

  /** MCP ToolAnnotations — defaults mark all tools as read-only, open-world */
  readonly annotations: ToolAnnotations = {
    readOnlyHint: true,
    openWorldHint: true,
  };

  /**
   * Optional: Tool metadata for enriched definitions
   * Phase 2: MCP Modernization
   */
  protected metadata?: {
    complexity?: 'simple' | 'moderate' | 'complex';
    rateLimitWeight?: number;
    examples?: Array<{
      name: string;
      description: string;
      arguments: Record<string, unknown>;
    }>;
    tags?: string[];
    deprecated?: boolean;
    requiresAuth?: boolean;
  };

  /**
   * Validate input using the defined Zod schema
   * This is automatically implemented - no need to override
   */
  validate(input: unknown): Result<TInput, Error> {
    try {
      const validated = this.schema.parse(input) as TInput;
      return success(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.issues
          .map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        return failure(new Error(`Validation failed: ${message}`));
      }
      return failure(error as Error);
    }
  }

  /**
   * Get JSON Schema from Zod schema
   * This is automatically implemented - no need to override
   */
  getSchema(): Record<string, unknown> {
    // Use explicit unknown to avoid deep type instantiation issues with zod-to-json-schema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return zodToJsonSchema(this.schema as any) as Record<string, unknown>;
  }

  /**
   * Get enriched tool metadata
   * Phase 2: MCP Modernization
   */
  getMetadata():
    | {
        complexity?: 'simple' | 'moderate' | 'complex';
        rateLimitWeight?: number;
        examples?: Array<{
          name: string;
          description: string;
          arguments: Record<string, unknown>;
        }>;
        tags?: string[];
        deprecated?: boolean;
        requiresAuth?: boolean;
      }
    | undefined {
    return this.metadata;
  }

  /**
   * Execute the tool
   * Override this in your subclass with your business logic
   */
  abstract execute(input: TInput, context: ToolContext): Promise<CallToolResult>;
}
