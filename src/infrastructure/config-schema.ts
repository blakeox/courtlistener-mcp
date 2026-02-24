/**
 * Configuration Schema with Zod
 * Provides type-safe configuration validation with comprehensive schema definitions
 */

import { z } from 'zod';
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
 * Zod schema for Metrics configuration
 */
export const MetricsConfigSchema = z.object({
  enabled: z.boolean(),
  port: z
    .number()
    .int()
    .min(1024, 'Port must be at least 1024')
    .max(65535, 'Port must not exceed 65535')
    .optional(),
});

/**
 * Zod schema for Security configuration
 */
export const SecurityConfigSchema = z.object({
  authEnabled: z.boolean(),
  apiKeys: z.array(z.string().min(1, 'API keys cannot be empty')).default([]),
  allowAnonymous: z.boolean(),
  headerName: z.string().default('x-api-key'),
  corsEnabled: z.boolean(),
  corsOrigins: z.array(z.string()).default(['*']),
  rateLimitEnabled: z.boolean(),
  maxRequestsPerMinute: z.number().int().positive('Max requests per minute must be positive'),
  sanitizationEnabled: z.boolean(),
});

/**
 * Zod schema for Audit configuration
 */
export const AuditConfigSchema = z.object({
  enabled: z.boolean(),
  logLevel: z.string().default('info'),
  includeRequestBody: z.boolean(),
  includeResponseBody: z.boolean(),
  maxBodyLength: z.number().int().min(0, 'Max body length must be non-negative'),
  sensitiveFields: z.array(z.string()).default(['password', 'token', 'secret', 'key', 'auth']),
});

/**
 * Zod schema for Circuit Breaker configuration
 */
export const CircuitBreakerConfigSchema = z.object({
  enabled: z.boolean(),
  failureThreshold: z.number().int().positive('Failure threshold must be positive'),
  successThreshold: z.number().int().positive('Success threshold must be positive'),
  timeout: z.number().int().positive('Timeout must be positive'),
  resetTimeout: z.number().int().positive('Reset timeout must be positive'),
});

/**
 * Zod schema for Compression configuration
 */
export const CompressionConfigSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().int().min(0, 'Compression threshold must be non-negative'),
  level: z
    .number()
    .int()
    .min(1, 'Compression level must be at least 1')
    .max(9, 'Compression level must not exceed 9'),
  types: z
    .array(z.string())
    .default(['application/json', 'text/plain', 'text/html', 'application/javascript']),
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
 * Zod schema for Correlation configuration
 */
export const CorrelationConfigSchema = z.object({
  enabled: z.boolean(),
  headerName: z.string().default('x-correlation-id'),
  generateId: z.boolean(),
});

/**
 * Zod schema for Sanitization configuration
 */
export const SanitizationConfigSchema = z.object({
  enabled: z.boolean(),
  maxStringLength: z.number().int().positive(),
  maxArrayLength: z.number().int().positive(),
  maxObjectDepth: z.number().int().positive(),
});

/**
 * Zod schema for Rate Limit configuration
 */
export const RateLimitConfigSchema = z.object({
  enabled: z.boolean(),
  maxRequestsPerMinute: z.number().int().positive(),
  maxRequestsPerHour: z.number().int().positive(),
  maxRequestsPerDay: z.number().int().positive(),
  windowSizeMs: z.number().int().positive(),
  clientIdentification: z.string().default('ip'),
  identificationHeader: z.string().default('x-client-id'),
  whitelistedClients: z.array(z.string()).default([]),
  penaltyMultiplier: z.number().min(0),
  persistStorage: z.boolean(),
});

/**
 * Zod schema for Graceful Shutdown configuration
 */
export const GracefulShutdownConfigSchema = z.object({
  enabled: z.boolean(),
  timeout: z.number().int().positive(),
  forceTimeout: z.number().int().positive(),
  signals: z.array(z.string()).default(['SIGTERM', 'SIGINT', 'SIGUSR2']),
});

/**
 * Zod schema for HTTP Transport configuration
 */
export const HttpTransportConfigSchema = z.object({
  port: z.number().int().min(1024).max(65535),
  host: z.string().default('0.0.0.0'),
  enableJsonResponse: z.boolean(),
  enableSessions: z.boolean(),
  enableResumability: z.boolean(),
  enableDnsRebindingProtection: z.boolean(),
  allowedOrigins: z.array(z.string()).optional(),
  allowedHosts: z.array(z.string()).optional(),
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
 * Complete Server Configuration Schema
 */
export const ServerConfigSchema = z.object({
  courtListener: CourtListenerConfigSchema,
  cache: CacheConfigSchema,
  logging: LogConfigSchema,
  metrics: MetricsConfigSchema,
  security: SecurityConfigSchema,
  audit: AuditConfigSchema,
  circuitBreaker: CircuitBreakerConfigSchema,
  sampling: SamplingConfigSchema,
  compression: CompressionConfigSchema,
  correlation: CorrelationConfigSchema.optional(),
  sanitization: SanitizationConfigSchema.optional(),
  rateLimit: RateLimitConfigSchema.optional(),
  gracefulShutdown: GracefulShutdownConfigSchema.optional(),
  httpTransport: HttpTransportConfigSchema.optional(),
  oauth: OAuthConfigSchema.optional(),
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

/**
 * Safe configuration validation that returns a Result type
 *
 * @param config - Configuration object to validate
 * @returns Result with either validated config or validation errors
 *
 * @example
 * ```typescript
 * const result = validateConfigSafe(rawConfig);
 * if (result.success) {
 *   useConfig(result.data);
 * } else {
 *   handleErrors(result.error);
 * }
 * ```
 */
export function validateConfigSafe(
  config: unknown,
): { success: true; data: ServerConfig } | { success: false; error: z.ZodError } {
  const result = ServerConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data as ServerConfig };
  }

  return { success: false, error: result.error };
}

/**
 * Format Zod validation errors for user-friendly display
 *
 * @param error - Zod error to format
 * @returns Formatted error messages
 */
export function formatValidationErrors(error: z.ZodError): string[] {
  return error.issues.map((err: z.ZodIssue) => {
    const path = err.path.join('.');
    const message = err.message;
    return path ? `[${path}] ${message}` : message;
  });
}

/**
 * Get validation errors as a single formatted string
 *
 * @param error - Zod error to format
 * @returns Single formatted error message
 */
export function getValidationErrorMessage(error: z.ZodError): string {
  return formatValidationErrors(error).join('\n');
}
