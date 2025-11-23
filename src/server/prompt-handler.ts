import {
  GetPromptResult,
  Prompt,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Interface for individual prompt handlers
 */
export interface PromptHandler {
  /**
   * The name of the prompt
   */
  name: string;

  /**
   * A description of what the prompt does
   */
  description?: string;

  /**
   * Arguments required by the prompt
   */
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;

  /**
   * Execute the prompt logic to return messages
   */
  getMessages(args: Record<string, string>): Promise<GetPromptResult>;
}

/**
 * Registry for managing prompt handlers
 */
export class PromptHandlerRegistry {
  private handlers = new Map<string, PromptHandler>();

  /**
   * Register a new prompt handler
   */
  register(handler: PromptHandler): void {
    if (this.handlers.has(handler.name)) {
      throw new Error(`Prompt handler already registered for: ${handler.name}`);
    }
    this.handlers.set(handler.name, handler);
  }

  /**
   * Get all registered prompts for listing
   */
  getAllPrompts(): Prompt[] {
    return Array.from(this.handlers.values()).map((handler) => ({
      name: handler.name,
      description: handler.description,
      arguments: handler.arguments,
    }));
  }

  /**
   * Find a handler by name
   */
  findHandler(name: string): PromptHandler | undefined {
    return this.handlers.get(name);
  }
}
