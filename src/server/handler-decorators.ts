/**
 * Handler decorators to eliminate repetitive patterns
 * Phase 2: Reduce Duplication
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext, TypedToolHandler } from './tool-handler.js';

/**
 * Configuration for caching behavior
 */
export interface CacheConfig {
  /** Cache key (defaults to handler name if not provided) */
  key?: string;
  /** Time-to-live in seconds */
  ttl?: number;
  /** Whether to enable caching (defaults to true) */
  enabled?: boolean;
}

/**
 * Configuration for timing/metrics behavior
 */
export interface TimingConfig {
  /** Metric name (defaults to handler name if not provided) */
  name?: string;
  /** Whether to enable timing (defaults to true) */
  enabled?: boolean;
}

/**
 * Decorator to add automatic caching to handler execute methods
 * 
 * @example
 * ```typescript
 * class MyHandler extends TypedToolHandler<typeof mySchema> {
 *   @withCache({ ttl: 3600 })
 *   async execute(input: MyInput, context: ToolContext): Promise<CallToolResult> {
 *     // Implementation - caching handled automatically!
 *   }
 * }
 * ```
 */
export function withCache(config: CacheConfig = {}) {
  return function <T extends TypedToolHandler<any>>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const ttl = config.ttl ?? 3600;
    const enabled = config.enabled ?? true;

    descriptor.value = async function (
      this: T,
      input: unknown,
      context: ToolContext
    ): Promise<CallToolResult> {
      if (!enabled || !context.cache) {
        return originalMethod.call(this, input, context);
      }

      const cacheKey = config.key ?? this.name;
      
      // Try to get from cache
      const cached = context.cache.get<Record<string, unknown>>(cacheKey, input as Record<string, unknown>);
      if (cached) {
        context.logger?.info(`${this.name} served from cache`, {
          requestId: context.requestId,
        });
        return this.success(cached);
      }

      // Execute original method
      const result = await originalMethod.call(this, input, context);

      // Cache successful results
      if (!result.isError && result.content) {
        const content = result.content[0];
        if (content?.type === 'text') {
          try {
            const data = JSON.parse(content.text) as Record<string, unknown>;
            context.cache.set(cacheKey, input as Record<string, unknown>, data, ttl);
          } catch {
            // Not JSON, skip caching
          }
        }
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Decorator to add automatic timing/metrics to handler execute methods
 * 
 * @example
 * ```typescript
 * class MyHandler extends TypedToolHandler<typeof mySchema> {
 *   @withTiming()
 *   async execute(input: MyInput, context: ToolContext): Promise<CallToolResult> {
 *     // Implementation - timing handled automatically!
 *   }
 * }
 * ```
 */
export function withTiming(config: TimingConfig = {}) {
  return function <T extends TypedToolHandler<any>>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const enabled = config.enabled ?? true;

    descriptor.value = async function (
      this: T,
      input: unknown,
      context: ToolContext
    ): Promise<CallToolResult> {
      if (!enabled || !context.logger) {
        return originalMethod.call(this, input, context);
      }

      const timerName = config.name ?? this.name;
      const timer = context.logger.startTimer(timerName);

      try {
        const result = await originalMethod.call(this, input, context);
        
        // Record success or failure based on result
        timer.end();
        if (result.isError) {
          // Error recorded in result
        } else {
          // Success recorded
        }

        return result;
      } catch (error) {
        timer.endWithError(error as Error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Decorator to add automatic error handling to handler execute methods
 * 
 * @example
 * ```typescript
 * class MyHandler extends TypedToolHandler<typeof mySchema> {
 *   @withErrorHandling()
 *   async execute(input: MyInput, context: ToolContext): Promise<CallToolResult> {
 *     // Implementation - errors handled automatically!
 *   }
 * }
 * ```
 */
export function withErrorHandling(errorMessage?: string) {
  return function <T extends TypedToolHandler<any>>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: T,
      input: unknown,
      context: ToolContext
    ): Promise<CallToolResult> {
      try {
        return await originalMethod.call(this, input, context);
      } catch (error) {
        const message = errorMessage ?? `${this.name} failed`;
        
        context.logger?.error(message, error as Error, {
          requestId: context.requestId,
          input,
        });

        return this.error(message, {
          message: (error as Error).message,
          name: (error as Error).name,
        });
      }
    };

    return descriptor;
  };
}

/**
 * Combine multiple decorators into one
 * Applies caching, timing, and error handling automatically
 * 
 * @example
 * ```typescript
 * class MyHandler extends TypedToolHandler<typeof mySchema> {
 *   @withDefaults({ cache: { ttl: 7200 } })
 *   async execute(input: MyInput, context: ToolContext): Promise<CallToolResult> {
 *     // Just implement the core logic!
 *     return this.success(result);
 *   }
 * }
 * ```
 */
export function withDefaults(config: {
  cache?: CacheConfig;
  timing?: TimingConfig;
  errorMessage?: string;
} = {}) {
  return function <T extends TypedToolHandler<any>>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    // Apply decorators in reverse order (they wrap from inside out)
    withErrorHandling(config.errorMessage)(target, propertyKey, descriptor);
    withTiming(config.timing)(target, propertyKey, descriptor);
    withCache(config.cache)(target, propertyKey, descriptor);
    
    return descriptor;
  };
}

