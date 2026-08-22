/**
 * Configuration Schema with Zod
 * Provides type-safe configuration validation with comprehensive schema definitions
 */

import { z } from '../common/zod.js';
import { ServerConfig } from '../types.js';

/**
 * Zod schema for CourtListener configuration
 */
export const CourtListenerConfigSchema = z.object({
  baseUrl: z.string().url('CourtListener base URL must be a valid URL'),
  version: z.string().min(1, 'API version is required'),
  timeout: z
    .number()
    .int()
    .min(1000, 'Timeout must be at least 1000ms')
    .max(60000, 'Timeout should not exceed 60s'),
  retryAttempts: z
    .number()
    .int()
    .min(0, 'Retry attempts cannot be negative')
    .max(10, 'Retry attempts should not exceed 10'),
  rateLimitPerMinute: z
    .number()
    .int()
    .positive('Rate limit must be positive')
    .max(1000, 'Rate limit is very high, verify API limits'),
  apiKey: z.string().min(1).optional(),
});

/**
 * Zod schema for Cache configuration
 */
export const CacheConfigSchema = z.object({
  enabled: z.boolean(),
  ttl: z.number().int().min(0, 'Cache TTL must be non-negative'),
  maxSize: z.number().int().positive('Cache max size must be positive'),
});

/**
 * Zod schema for Logging configuration
 */
export const LogConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error'], {
    message: 'Log level must be one of: debug, info, warn, error',
  }),
  format: z.enum(['json', 'text'], {
    message: 'Log format must be either json or text',
  }),
  enabled: z.boolean(),
});

/**
 * Zod schema for Security configuration
 */
export const SecurityConfigSchema = z.object({
  authEnabled: z.boolean(),
  apiKeys: z.array(z.string().min(1, 'API keys cannot be empty')).default([]),
});

/**
 * Zod schema for Sampling configuration
 */
export const SamplingConfigSchema = z.object({
  enabled: z.boolean(),
  maxTokens: z.number().int().positive('Max tokens must be positive'),
  defaultModel: z.string().optional(),
});

/**
 * Zod schema for OAuth configuration
 */
export const OAuthConfigSchema = z.object({
  enabled: z.boolean(),
  issuerUrl: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

/**
 * Zod schema for Async Execution configuration
 */
export const AsyncExecutionConfigSchema = z.object({
  enabled: z.boolean(),
  queueConcurrency: z.number().int().positive(),
  queueBatchSize: z.number().int().positive(),
  defaultMaxAttempts: z.number().int().positive(),
  defaultRetryDelayMs: z.number().int().min(0),
  defaultTtlSeconds: z.number().int().positive(),
  maxStoredJobs: z.number().int().positive(),
  maxQueueDepth: z.number().int().positive(),
  queueLatencyGuardrailMs: z.number().int().positive(),
  completionLatencyGuardrailMs: z.number().int().positive(),
});

/**
 * Complete Server Configuration Schema
 */
export const ServerConfigSchema = z.object({
  courtListener: CourtListenerConfigSchema,
  cache: CacheConfigSchema,
  logging: LogConfigSchema,
  security: SecurityConfigSchema,
  sampling: SamplingConfigSchema,
  oauth: OAuthConfigSchema.optional(),
  asyncExecution: AsyncExecutionConfigSchema.optional(),
});

/**
 * Type-safe configuration type inferred from Zod schema
 */
export type ValidatedServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * Validate configuration using Zod schema
 *
 * @param config - Configuration object to validate
 * @returns Validated configuration
 * @throws {z.ZodError} If configuration is invalid
 *
 * @example
 * ```typescript
 * try {
 *   const validated = validateConfigWithZod(rawConfig);
 *   // Use validated config safely
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     console.error('Configuration errors:', error.errors);
 *   }
 * }
 * ```
 */
export function validateConfigWithZod(config: unknown): ServerConfig {
  return ServerConfigSchema.parse(config) as ServerConfig;
}
