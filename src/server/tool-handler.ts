/**
 * Tool Handler Strategy Pattern
 * Modular tool handlers that can be dynamically registered and executed
 */

import { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../infrastructure/logger.js';
import { Result } from '../common/types.js';

export interface ToolHandler {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  
  /**
   * Validate tool input parameters
   */
  validate(input: any): Result<any, Error>;
  
  /**
   * Execute the tool
   */
  execute(input: any, context: ToolContext): Promise<CallToolResult>;
  
  /**
   * Get tool schema definition
   */
  getSchema(): any;
}

export interface ToolContext {
  logger: Logger;
  requestId: string;
  userId?: string;
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
    if (!this.categories.has(handler.category)) {
      this.categories.set(handler.category, new Set());
    }
    this.categories.get(handler.category)!.add(handler.name);
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
    return Array.from(toolNames).map(name => this.handlers.get(name)!);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get tool definitions for MCP
   */
  getToolDefinitions(): any[] {
    return Array.from(this.handlers.values()).map(handler => ({
      name: handler.name,
      description: handler.description,
      inputSchema: handler.getSchema()
    }));
  }

  /**
   * Execute a tool with proper error handling
   */
  async execute(
    request: CallToolRequest,
    context: ToolContext
  ): Promise<CallToolResult> {
    const handler = this.handlers.get(request.params.name);
    
    if (!handler) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    // Validate input
    const validationResult = handler.validate(request.params.arguments);
    if (!validationResult.success) {
      throw validationResult.error;
    }

    // Execute tool
    context.logger.info(`Executing tool: ${handler.name}`, {
      toolName: handler.name,
      category: handler.category,
      requestId: context.requestId
    });

    return await handler.execute(validationResult.data, context);
  }
}

/**
 * Base class for tool handlers
 */
export abstract class BaseToolHandler implements ToolHandler {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: string;

  abstract validate(input: any): Result<any, Error>;
  abstract execute(input: any, context: ToolContext): Promise<CallToolResult>;
  abstract getSchema(): any;

  /**
   * Helper method to create success result
   */
  protected success(content: any): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
        }
      ]
    };
  }

  /**
   * Helper method to create error result
   */
  protected error(message: string, details?: any): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: message,
            details: details || null
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}