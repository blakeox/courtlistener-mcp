/**
 * Resource Handler Strategy Pattern
 * Modular resource handlers that can be dynamically registered and executed
 */

import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../infrastructure/logger.js';

export interface ResourceHandler {
  readonly uriTemplate: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;

  /**
   * Check if this handler can handle the given URI
   */
  matches(uri: string): boolean;

  /**
   * Read the resource content
   */
  read(uri: string, context: ResourceContext): Promise<ReadResourceResult>;

  /**
   * List available resources (optional, for static lists or examples)
   */
  list(): Resource[];
}

export interface ResourceContext {
  logger: Logger;
  requestId: string;
}

export class ResourceHandlerRegistry {
  private handlers: ResourceHandler[] = [];

  /**
   * Register a resource handler
   */
  register(handler: ResourceHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Find a handler for the given URI
   */
  findHandler(uri: string): ResourceHandler | undefined {
    return this.handlers.find(h => h.matches(uri));
  }

  /**
   * Get all listed resources from all handlers
   */
  getAllResources(): Resource[] {
    return this.handlers.flatMap(h => h.list());
  }
}
