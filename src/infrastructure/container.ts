/**
 * Dependency Injection Container
 * Manages service dependencies and provides clean separation of concerns
 */

export interface ServiceDefinition<T = any> {
  factory: (...deps: any[]) => T;
  dependencies?: string[];
  singleton?: boolean;
}

export class DIContainer {
  private services = new Map<string, ServiceDefinition>();
  private instances = new Map<string, any>();

  /**
   * Register a service with its dependencies
   */
  register<T>(name: string, definition: ServiceDefinition<T>): void {
    this.services.set(name, definition);
  }

  /**
   * Get a service instance, creating it if needed
   */
  get<T>(name: string): T {
    // Return cached singleton if exists
    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    const definition = this.services.get(name);
    if (!definition) {
      throw new Error(`Service '${name}' is not registered`);
    }

    // Resolve dependencies
    const deps = definition.dependencies?.map(dep => this.get(dep)) || [];
    
    // Create instance
    const instance = definition.factory(...deps);

    // Cache if singleton
    if (definition.singleton !== false) {
      this.instances.set(name, instance);
    }

    return instance;
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Clear all instances (useful for testing)
   */
  clear(): void {
    this.instances.clear();
  }

  /**
   * Get dependency graph for debugging
   */
  getDependencyGraph(): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const [name, definition] of this.services) {
      graph[name] = definition.dependencies || [];
    }
    return graph;
  }
}

export const container = new DIContainer();