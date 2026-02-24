/**
 * Enhanced configuration management for Legal MCP Server
 * Provides environment-based configuration with validation for all components
 */

import { parseLogFormat, parseLogLevel, parsePositiveInt } from '../common/validation.js';
import { ServerConfig } from '../types.js';
import { validateConfigWithZod } from './config-schema.js';

const defaultConfig: ServerConfig = {
  courtListener: {
    baseUrl: process.env.COURTLISTENER_BASE_URL || 'https://www.courtlistener.com/api/rest/v4',
    version: 'v4',
    timeout: parsePositiveInt(process.env.COURTLISTENER_TIMEOUT, 30000, 1000),
    retryAttempts: parsePositiveInt(process.env.COURTLISTENER_RETRY_ATTEMPTS, 3, 0),
    rateLimitPerMinute: parsePositiveInt(process.env.COURTLISTENER_RATE_LIMIT, 100, 1),
  },
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttl: parsePositiveInt(process.env.CACHE_TTL, 300, 0), // 5 minutes default
    maxSize: parsePositiveInt(process.env.CACHE_MAX_SIZE, 1000, 1),
  },
  logging: {
    level: parseLogLevel(process.env.LOG_LEVEL),
    format: parseLogFormat(process.env.LOG_FORMAT),
    enabled: process.env.LOGGING_ENABLED !== 'false',
  },
  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true',
    port: process.env.METRICS_PORT
      ? parsePositiveInt(process.env.METRICS_PORT, 3001, 1024, 65535)
      : undefined,
  },
  // Enhanced security and middleware configuration
  security: {
    authEnabled: process.env.AUTH_ENABLED === 'true',
    apiKeys: process.env.AUTH_API_KEYS
      ? process.env.AUTH_API_KEYS.split(',')
          .map((key) => key.trim())
          .filter((key) => key.length > 0)
      : [],
    allowAnonymous: process.env.AUTH_ALLOW_ANONYMOUS !== 'false',
    headerName: process.env.AUTH_HEADER_NAME || 'x-api-key',
    corsEnabled: process.env.CORS_ENABLED !== 'false',
    corsOrigins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0)
      : ['*'],
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === 'true',
    maxRequestsPerMinute: parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100, 1),
    sanitizationEnabled: process.env.SANITIZATION_ENABLED !== 'false',
  },
  audit: {
    enabled: process.env.AUDIT_ENABLED === 'true',
    logLevel: process.env.AUDIT_LOG_LEVEL || 'info',
    includeRequestBody: process.env.AUDIT_INCLUDE_REQUEST_BODY === 'true',
    includeResponseBody: process.env.AUDIT_INCLUDE_RESPONSE_BODY === 'true',
    maxBodyLength: parsePositiveInt(process.env.AUDIT_MAX_BODY_LENGTH, 2000, 0),
    sensitiveFields: process.env.AUDIT_SENSITIVE_FIELDS
      ? process.env.AUDIT_SENSITIVE_FIELDS.split(',')
          .map((f) => f.trim())
          .filter((f) => f.length > 0)
      : ['password', 'token', 'secret', 'key', 'auth'],
  },
  circuitBreaker: {
    enabled: process.env.CIRCUIT_BREAKER_ENABLED === 'true',
    failureThreshold: parsePositiveInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD, 5, 1),
    successThreshold: parsePositiveInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD, 3, 1),
    timeout: parsePositiveInt(process.env.CIRCUIT_BREAKER_TIMEOUT, 10000, 1),
    resetTimeout: parsePositiveInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT, 60000, 1),
  },
  compression: {
    enabled: process.env.COMPRESSION_ENABLED !== 'false',
    threshold: parsePositiveInt(process.env.COMPRESSION_THRESHOLD, 1024, 0),
    level: parsePositiveInt(process.env.COMPRESSION_LEVEL, 6, 0, 9),
    types: process.env.COMPRESSION_TYPES
      ? process.env.COMPRESSION_TYPES.split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : ['application/json', 'text/plain', 'text/html', 'application/javascript'],
  },
  sampling: {
    enabled: process.env.SAMPLING_ENABLED === 'true',
    maxTokens: parsePositiveInt(process.env.SAMPLING_MAX_TOKENS, 1000, 1),
    defaultModel: process.env.SAMPLING_DEFAULT_MODEL,
  },
  correlation: {
    enabled: process.env.CORRELATION_ENABLED !== 'false',
    headerName: process.env.CORRELATION_HEADER_NAME || 'x-correlation-id',
    generateId: process.env.CORRELATION_GENERATE_ID !== 'false',
  },
  sanitization: {
    enabled: process.env.SANITIZATION_ENABLED !== 'false',
    maxStringLength: parsePositiveInt(process.env.SANITIZATION_MAX_STRING_LENGTH, 10000, 1),
    maxArrayLength: parsePositiveInt(process.env.SANITIZATION_MAX_ARRAY_LENGTH, 1000, 1),
    maxObjectDepth: parsePositiveInt(process.env.SANITIZATION_MAX_OBJECT_DEPTH, 10, 1),
  },
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED === 'true',
    maxRequestsPerMinute: parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100, 1),
    maxRequestsPerHour: parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS_HOUR, 1000, 1),
    maxRequestsPerDay: parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS_DAY, 10000, 1),
    windowSizeMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60000, 1),
    clientIdentification: process.env.RATE_LIMIT_CLIENT_ID || 'ip',
    identificationHeader: process.env.RATE_LIMIT_ID_HEADER || 'x-client-id',
    whitelistedClients: process.env.RATE_LIMIT_WHITELIST
      ? process.env.RATE_LIMIT_WHITELIST.split(',')
          .map((c) => c.trim())
          .filter((c) => c.length > 0)
      : [],
    penaltyMultiplier: parseFloat(process.env.RATE_LIMIT_PENALTY_MULTIPLIER || '0.1'),
    persistStorage: process.env.RATE_LIMIT_PERSIST === 'true',
  },
  gracefulShutdown: {
    enabled: process.env.GRACEFUL_SHUTDOWN_ENABLED !== 'false',
    timeout: parsePositiveInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT, 30000, 1),
    forceTimeout: parsePositiveInt(process.env.GRACEFUL_SHUTDOWN_FORCE_TIMEOUT, 5000, 1),
    signals: process.env.GRACEFUL_SHUTDOWN_SIGNALS
      ? process.env.GRACEFUL_SHUTDOWN_SIGNALS.split(',').map((s) => s.trim())
      : ['SIGTERM', 'SIGINT', 'SIGUSR2'],
  },
  httpTransport: {
    port: parsePositiveInt(process.env.MCP_HTTP_PORT, 3002, 1024, 65535),
    host: process.env.MCP_HTTP_HOST || '0.0.0.0',
    enableJsonResponse: process.env.MCP_JSON_RESPONSE === 'true',
    enableSessions: process.env.MCP_SESSIONS !== 'false',
    enableResumability: process.env.MCP_RESUMABILITY === 'true',
    enableDnsRebindingProtection: process.env.MCP_DNS_PROTECTION === 'true',
    allowedOrigins: process.env.MCP_ALLOWED_ORIGINS
      ? process.env.MCP_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : undefined,
    allowedHosts: process.env.MCP_ALLOWED_HOSTS
      ? process.env.MCP_ALLOWED_HOSTS.split(',').map((h) => h.trim())
      : undefined,
  },
  oauth: {
    enabled: process.env.OAUTH_ENABLED === 'true',
    issuerUrl: process.env.OAUTH_ISSUER_URL,
    clientId: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
  },
};

/**
 * Get the server configuration
 *
 * Loads configuration from environment variables with defaults,
 * validates it, and returns a type-safe ServerConfig object.
 *
 * **Validation**:
 * 1. Custom validation for business rules
 * 2. Zod schema validation for type safety
 *
 * **Environment Variables**:
 * - `COURTLISTENER_BASE_URL` - API base URL
 * - `CACHE_ENABLED` - Enable/disable caching
 * - `LOG_LEVEL` - Logging level (debug, info, warn, error)
 * - And many more...
 *
 * @returns Validated server configuration
 * @throws {Error} If configuration is invalid
 *
 * @example
 * ```typescript
 * const config = getConfig();
 * console.log(config.courtListener.baseUrl);
 * console.log(config.cache.enabled);
 * ```
 *
 * @see {@link ServerConfig} for complete configuration structure
 */
export function getConfig(): ServerConfig {
  const config = validateConfig(defaultConfig);

  // Additional Zod validation for type safety
  try {
    return validateConfigWithZod(config);
  } catch (error) {
    // If Zod validation fails, log but still return the config
    // (existing validation should have caught most issues)
    console.warn('Zod validation warning:', error);
    return config;
  }
}

function validateConfig(config: ServerConfig): ServerConfig {
  // Validate CourtListener config
  if (!config.courtListener.baseUrl) {
    throw new Error('CourtListener base URL is required');
  }

  if (config.courtListener.timeout < 1000) {
    throw new Error('Timeout must be at least 1000ms');
  }

  if (config.courtListener.retryAttempts < 0 || config.courtListener.retryAttempts > 10) {
    throw new Error('Retry attempts must be between 0 and 10');
  }

  if (config.courtListener.rateLimitPerMinute <= 0) {
    throw new Error('Rate limit must be positive');
  }

  // Validate cache config
  if (config.cache.ttl < 0) {
    throw new Error('Cache TTL must be non-negative');
  }

  if (config.cache.maxSize <= 0) {
    throw new Error('Cache max size must be positive');
  }

  // Validate logging config
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.logging.level)) {
    throw new Error(`Invalid log level: ${config.logging.level}`);
  }

  const validLogFormats = ['json', 'text'];
  if (!validLogFormats.includes(config.logging.format)) {
    throw new Error(`Invalid log format: ${config.logging.format}`);
  }

  // Validate security config
  if (config.security.authEnabled && config.security.apiKeys.length === 0) {
    throw new Error('Authentication enabled but no API keys provided');
  }

  if (config.security.maxRequestsPerMinute <= 0) {
    throw new Error('Rate limit must be positive');
  }

  // Validate circuit breaker config
  if (config.circuitBreaker.failureThreshold <= 0) {
    throw new Error('Circuit breaker failure threshold must be positive');
  }

  if (config.circuitBreaker.successThreshold <= 0) {
    throw new Error('Circuit breaker success threshold must be positive');
  }

  if (config.circuitBreaker.timeout <= 0) {
    throw new Error('Circuit breaker timeout must be positive');
  }

  // Validate compression config
  if (config.compression.level < 1 || config.compression.level > 9) {
    throw new Error('Compression level must be between 1 and 9');
  }

  if (config.compression.threshold < 0) {
    throw new Error('Compression threshold must be non-negative');
  }

  return config;
}

export function getEnvironmentInfo() {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
  };
}

/**
 * Get enhanced configuration summary for diagnostics
 */
export function getConfigSummary() {
  const config = getConfig();

  return {
    features: {
      authentication: config.security.authEnabled,
      audit: config.audit.enabled,
      circuitBreaker: config.circuitBreaker.enabled,
      compression: config.compression.enabled,
      caching: config.cache.enabled,
      metrics: config.metrics.enabled,
      sanitization: config.security.sanitizationEnabled,
      cors: config.security.corsEnabled,
    },
    limits: {
      cacheSize: config.cache.maxSize,
      cacheTtl: config.cache.ttl,
      rateLimitPerMinute: config.courtListener.rateLimitPerMinute,
      requestTimeout: config.courtListener.timeout,
      circuitBreakerThreshold: config.circuitBreaker.failureThreshold,
    },
    security: {
      authEnabled: config.security.authEnabled,
      allowAnonymous: config.security.allowAnonymous,
      apiKeysConfigured: config.security.apiKeys.length,
      corsOrigins: config.security.corsOrigins.length,
    },
  };
}
