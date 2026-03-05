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
  title?: string;

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
  tags?: string[];
  examples?: Array<{
    description: string;
    arguments: Record<string, string>;
  }>;

  /**
   * Execute the prompt logic to return messages
   */
  getMessages(args: Record<string, string>): Promise<GetPromptResult>;
}

function toPromptTitle(name: string): string {
  return name
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function derivePromptTags(handler: PromptHandler): string[] {
  const fromName = handler.name
    .split(/[_-]+/)
    .filter((token) => token.length > 2);
  const fromArgs = (handler.arguments ?? [])
    .map((argument) => argument.name)
    .filter((name) => name.length > 2);
  return [...new Set(['prompt', ...fromName, ...fromArgs])].slice(0, 8);
}

function derivePromptExamples(handler: PromptHandler): Array<{ description: string; arguments: Record<string, string> }> {
  const argumentTemplate = Object.fromEntries(
    (handler.arguments ?? []).map((argument) => [argument.name, `<${argument.name}>`]),
  );
  return [
    {
      description: `Run ${handler.name} with starter arguments`,
      arguments: argumentTemplate,
    },
  ];
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
    return Array.from(this.handlers.values()).map((handler) => {
      const tags = handler.tags ?? derivePromptTags(handler);
      const examples = handler.examples ?? derivePromptExamples(handler);
      return {
        name: handler.name,
        title: handler.title ?? toPromptTitle(handler.name),
        description: handler.description,
        arguments: handler.arguments,
        _meta: {
          'courtlistener/discoverability': {
            tags,
            examples,
            descriptors: {
              argumentCount: handler.arguments?.length ?? 0,
              requiredArguments:
                handler.arguments?.filter((argument) => argument.required).map((argument) => argument.name) ?? [],
            },
          },
        },
      };
    });
  }

  /**
   * Find a handler by name
   */
  findHandler(name: string): PromptHandler | undefined {
    return this.handlers.get(name);
  }
}
