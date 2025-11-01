/**
 * Dependency Injection Container
 * Manages service dependencies and provides clean separation of concerns
 */

export interface ServiceDefinition<T = unknown> {
  factory: (...deps: unknown[]) => T;
  dependencies?: readonly string[];
  singleton?: boolean;
}

export class DIContainer {
  private readonly services = new Map<string, ServiceDefinition>();
  private readonly instances = new Map<string, unknown>();

  /**
   * Register a service with its dependencies
   */
  register<T>(name: string, definition: ServiceDefinition<T>): void {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }
    this.services.set(name, definition);
  }

  /**
   * Register or replace a service (useful for testing)
   */
  registerOrReplace<T>(name: string, definition: ServiceDefinition<T>): void {
    if (this.services.has(name)) {
      this.services.delete(name);
      this.instances.delete(name);
    }
    this.services.set(name, definition);
  }

  /**
   * Get a service instance, creating it if needed
   */
  get<T>(name: string): T {
    // Return cached singleton if exists
    const cached = this.instances.get(name);
    if (cached !== undefined) {
      return cached as T;
    }

    const definition = this.services.get(name);
    if (!definition) {
      throw new Error(`Service '${name}' is not registered`);
    }

    // Resolve dependencies
    const deps = definition.dependencies?.map((dep) => this.get(dep)) ?? [];

    // Create instance
    const instance = definition.factory(...deps) as T;

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
   * Clear all registrations and instances (useful for testing)
   */
  clearAll(): void {
    this.services.clear();
    this.instances.clear();
  }

  /**
   * Unregister a service
   */
  unregister(name: string): void {
    this.services.delete(name);
    this.instances.delete(name);
  }

  /**
   * Get dependency graph for debugging
   */
  getDependencyGraph(): Readonly<Record<string, readonly string[]>> {
    const graph: Record<string, string[]> = {};
    for (const [name, definition] of this.services) {
      graph[name] = [...(definition.dependencies ?? [])];
    }
    return graph;
  }

  /**
   * Check for circular dependencies
   */
  validateDependencies(): { valid: boolean; cycles: string[][] } {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const visit = (serviceName: string, path: string[]): void => {
      visited.add(serviceName);
      recursionStack.add(serviceName);
      const currentPath = [...path, serviceName];

      const definition = this.services.get(serviceName);
      if (definition?.dependencies) {
        for (const dep of definition.dependencies) {
          if (!visited.has(dep)) {
            visit(dep, currentPath);
          } else if (recursionStack.has(dep)) {
            // Found a cycle
            const cycleStart = currentPath.indexOf(dep);
            cycles.push([...currentPath.slice(cycleStart), dep]);
          }
        }
      }

      recursionStack.delete(serviceName);
    };

    for (const serviceName of this.services.keys()) {
      if (!visited.has(serviceName)) {
        visit(serviceName, []);
      }
    }

    return {
      valid: cycles.length === 0,
      cycles,
    };
  }
}

export const container = new DIContainer();
