/**
 * MCP Resource Provider Infrastructure
 * Phase 3: Surface Expansion
 * 
 * Provides access to static resources like schemas, sample data, and documentation
 */

import { Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';

/**
 * Base interface for resource providers
 */
export interface ResourceProvider {
  /**
   * List available resources
   */
  listResources(): Promise<Resource[]>;

  /**
   * Read a specific resource by URI
   */
  readResource(uri: string): Promise<{
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    }>;
  }>;

  /**
   * Get resource templates for dynamic resources
   */
  getTemplates?(): ResourceTemplate[];
}

/**
 * Base resource provider with common functionality
 */
export abstract class BaseResourceProvider implements ResourceProvider {
  constructor(protected readonly name: string) {}

  abstract listResources(): Promise<Resource[]>;
  abstract readResource(uri: string): Promise<{
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    }>;
  }>;

  /**
   * Helper to create resource URI
   */
  protected createUri(path: string): string {
    return `${this.name}://${path}`;
  }

  /**
   * Helper to create text resource
   */
  protected createTextResource(uri: string, text: string, mimeType: string = 'text/plain'): {
    uri: string;
    mimeType: string;
    text: string;
  } {
    return { uri, mimeType, text };
  }
}

/**
 * Registry for managing multiple resource providers
 */
export class ResourceProviderRegistry {
  private providers = new Map<string, ResourceProvider>();

  /**
   * Register a resource provider
   */
  register(name: string, provider: ResourceProvider): void {
    this.providers.set(name, provider);
  }

  /**
   * Get all providers
   */
  getProviders(): ResourceProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * List all resources from all providers
   */
  async listAllResources(): Promise<Resource[]> {
    const allResources = await Promise.all(
      Array.from(this.providers.values()).map((provider) => provider.listResources())
    );

    return allResources.flat();
  }

  /**
   * Read a resource by URI
   * Routes to the appropriate provider based on URI scheme
   */
  async readResource(uri: string): Promise<{
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    }>;
  }> {
    // Extract scheme from URI (e.g., "schema://..." -> "schema")
    const scheme = uri.split('://')[0];
    const provider = this.providers.get(scheme);

    if (!provider) {
      throw new Error(`No resource provider found for URI: ${uri}`);
    }

    return provider.readResource(uri);
  }

  /**
   * Get all resource templates
   */
  getTemplates(): ResourceTemplate[] {
    const templates: ResourceTemplate[] = [];

    for (const provider of this.providers.values()) {
      if (provider.getTemplates) {
        templates.push(...provider.getTemplates());
      }
    }

    return templates;
  }
}

