/**
 * Enhanced configuration management for Legal MCP Server
 * Provides environment-based configuration with validation for all components
 */

import { ServerConfig } from '../types.js';

const defaultConfig: ServerConfig = {
  courtListener: {
    baseUrl: process.env.COURTLISTENER_BASE_URL || 'https://www.courtlistener.com/api/rest/v4',
    version: 'v4',
    timeout: parseInt(process.env.COURTLISTENER_TIMEOUT || '30000'),
    retryAttempts: parseInt(process.env.COURTLISTENER_RETRY_ATTEMPTS || '3'),
    rateLimitPerMinute: parseInt(process.env.COURTLISTENER_RATE_LIMIT || '100')
  },
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.CACHE_TTL || '300'), // 5 minutes default
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000')
  },
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    format: (process.env.LOG_FORMAT as any) || 'json',
    enabled: process.env.LOGGING_ENABLED !== 'false'
  },
  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true',
    port: process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT) : undefined
  },
  // Enhanced security and middleware configuration
  security: {
    authEnabled: process.env.AUTH_ENABLED === 'true',
    apiKeys: process.env.AUTH_API_KEYS ? 
             process.env.AUTH_API_KEYS.split(',').map(key => key.trim()) : [],
    allowAnonymous: process.env.AUTH_ALLOW_ANONYMOUS !== 'false',
    corsEnabled: process.env.CORS_ENABLED !== 'false',
    corsOrigins: process.env.CORS_ORIGINS ? 
                 process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()) : ['*'],
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === 'true',
    maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    sanitizationEnabled: process.env.SANITIZATION_ENABLED !== 'false'
  },
  audit: {
    enabled: process.env.AUDIT_ENABLED === 'true',
    logLevel: process.env.AUDIT_LOG_LEVEL || 'info',
    includeRequestBody: process.env.AUDIT_INCLUDE_REQUEST_BODY === 'true',
    includeResponseBody: process.env.AUDIT_INCLUDE_RESPONSE_BODY === 'true',
    maxBodyLength: parseInt(process.env.AUDIT_MAX_BODY_LENGTH || '2000'),
    sensitiveFields: process.env.AUDIT_SENSITIVE_FIELDS ? 
                     process.env.AUDIT_SENSITIVE_FIELDS.split(',').map(f => f.trim()) :
                     ['password', 'token', 'secret', 'key', 'auth']
  },
  circuitBreaker: {
    enabled: process.env.CIRCUIT_BREAKER_ENABLED === 'true',
    failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
    successThreshold: parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '3'),
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '10000'),
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '60000')
  },
  compression: {
    enabled: process.env.COMPRESSION_ENABLED === 'true',
    threshold: parseInt(process.env.COMPRESSION_THRESHOLD || '1024'),
    level: parseInt(process.env.COMPRESSION_LEVEL || '6')
  }
};

export function getConfig(): ServerConfig {
  return validateConfig(defaultConfig);
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
    environment: process.env.NODE_ENV || 'development'
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
      cors: config.security.corsEnabled
    },
    limits: {
      cacheSize: config.cache.maxSize,
      cacheTtl: config.cache.ttl,
      rateLimitPerMinute: config.courtListener.rateLimitPerMinute,
      requestTimeout: config.courtListener.timeout,
      circuitBreakerThreshold: config.circuitBreaker.failureThreshold
    },
    security: {
      authEnabled: config.security.authEnabled,
      allowAnonymous: config.security.allowAnonymous,
      apiKeysConfigured: config.security.apiKeys.length,
      corsOrigins: config.security.corsOrigins.length
    }
  };
}
