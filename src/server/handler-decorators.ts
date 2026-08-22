/**
 * Handler decorators to eliminate repetitive patterns
 * Phase 2: Reduce Duplication
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { CallToolResult } from '@modelcontextprotocol/server';
import { ToolContext, TypedToolHandler } from './tool-handler.js';

export interface CacheConfig {
  key?: string;
  ttl?: number;
  enabled?: boolean;
}

export interface TimingConfig {
  name?: string;
  enabled?: boolean;
}

export function withCache(config: CacheConfig = {}) {
  return function <T extends TypedToolHandler<any>>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const ttl = config.ttl ?? 3600;
    const enabled = config.enabled ?? true;

    descriptor.value = async function (
      this: T,
      input: unknown,
      context: ToolContext,
    ): Promise<CallToolResult> {
      if (!enabled || !context.cache) return originalMethod.call(this, input, context);

      const cacheKey = config.key ?? this.name;
      const cached = context.cache.get<Record<string, unknown>>(
        cacheKey,
        input as Record<string, unknown>,
      );
      if (cached) {
        context.logger?.info(`${this.name} served from cache`, {
          requestId: context.requestId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }],
          structuredContent: cached,
        };
      }

      const result = await originalMethod.call(this, input, context);
      if (!result.isError) {
        if (
          result.structuredContent &&
          typeof result.structuredContent === 'object' &&
          !Array.isArray(result.structuredContent)
        ) {
          context.cache.set(
            cacheKey,
            input as Record<string, unknown>,
            result.structuredContent as Record<string, unknown>,
            ttl,
          );
        } else if (result.content) {
          const content = result.content[0];
          if (content?.type === 'text') {
            try {
              const data = JSON.parse(content.text) as Record<string, unknown>;
              context.cache.set(cacheKey, input as Record<string, unknown>, data, ttl);
            } catch {
              // Not JSON, skip caching.
            }
          }
        }
      }
      return result;
    };

    return descriptor;
  };
}

export function withTiming(config: TimingConfig = {}) {
  return function <T extends TypedToolHandler<any>>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const enabled = config.enabled ?? true;

    descriptor.value = async function (
      this: T,
      input: unknown,
      context: ToolContext,
    ): Promise<CallToolResult> {
      if (!enabled || !context.logger) return originalMethod.call(this, input, context);

      const timer = context.logger.startTimer(config.name ?? this.name);
      try {
        const result = await originalMethod.call(this, input, context);
        timer.end();
        return result;
      } catch (error) {
        timer.endWithError(error as Error);
        throw error;
      }
    };

    return descriptor;
  };
}

export function withErrorHandling(errorMessage?: string) {
  return function <T extends TypedToolHandler<any>>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: T,
      input: unknown,
      context: ToolContext,
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

export function withDefaults(
  config: {
    cache?: CacheConfig;
    timing?: TimingConfig;
    errorMessage?: string;
  } = {},
) {
  return function <T extends TypedToolHandler<any>>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    withErrorHandling(config.errorMessage)(target, propertyKey, descriptor);
    withTiming(config.timing)(target, propertyKey, descriptor);
    withCache(config.cache)(target, propertyKey, descriptor);
    return descriptor;
  };
}
