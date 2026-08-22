/**
 * Resource Handler Strategy Pattern
 * Modular resource handlers that can be dynamically registered and executed
 */

import {
  ReadResourceResult,
  Resource,
  type ResourceTemplateType as ResourceTemplateDefinition,
} from '@modelcontextprotocol/server';
import { Logger } from '../infrastructure/logger.js';

export interface ResourceHandler {
  readonly uriTemplate: string;
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly mimeType?: string;
  readonly tags?: string[];
  readonly examples?: string[];

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

  /**
   * When set, subscribed clients receive proactive resources/updated notifications
   * on this interval while the subscription remains active.
   */
  readonly subscriptionRefreshTtlMs?: number;
}

export interface ResourceContext {
  logger: Logger;
  requestId: string;
}

export class ResourceHandlerRegistry {
  private handlers: ResourceHandler[] = [];
  private onCatalogListChanged: (() => void) | undefined;

  setOnCatalogListChanged(callback: (() => void) | undefined): void {
    this.onCatalogListChanged = callback;
  }

  /**
   * Register a resource handler
   */
  register(handler: ResourceHandler): void {
    this.handlers.push(handler);
    this.onCatalogListChanged?.();
  }

  /**
   * Find a handler for the given URI
   */
  findHandler(uri: string): ResourceHandler | undefined {
    return this.handlers.find((h) => h.matches(uri));
  }

  /**
   * Get all listed resources from all handlers
   */
  getAllResources(): Resource[] {
    return this.handlers.flatMap((handler) =>
      handler.list().map((resource) => {
        const tags = handler.tags ?? [
          'resource',
          ...handler.name.toLowerCase().split(/\s+/).filter(Boolean),
        ];
        const examples = handler.examples ?? [resource.uri];
        return {
          ...resource,
          title: resource.title ?? handler.title ?? resource.name,
          _meta: {
            ...(resource._meta ?? {}),
            'courtlistener/discoverability': {
              tags: [...new Set(tags)].slice(0, 8),
              examples,
              descriptors: {
                uriTemplate: handler.uriTemplate,
                dynamic: handler.uriTemplate.includes('{'),
              },
            },
          },
        };
      }),
    );
  }

  /**
   * List URI templates for dynamic resource discovery (resources/templates/list).
   */
  getAllResourceTemplates(): ResourceTemplateDefinition[] {
    return this.handlers.map((handler) => ({
      uriTemplate: handler.uriTemplate,
      name: handler.name,
      title: handler.title ?? handler.name,
      description: handler.description,
      mimeType: handler.mimeType,
    }));
  }

  getHandlerByTemplate(uriTemplate: string): ResourceHandler | undefined {
    return this.handlers.find((handler) => handler.uriTemplate === uriTemplate);
  }

  getSubscriptionRefreshTtlMs(uri: string): number | undefined {
    return this.findHandler(uri)?.subscriptionRefreshTtlMs;
  }
}
