/**
 * Enhanced configuration management for Legal MCP Server
 * Provides environment-based configuration with validation for all components
 */

import { parseLogFormat, parseLogLevel, parsePositiveInt } from '../common/validation.js';
import { ServerConfig } from '../types.js';
import { validateConfigWithZod } from './config-schema.js';
import { SUPPORTED_MCP_PROTOCOL_VERSIONS } from './protocol-constants.js';
import { type AuthPolicyDiagnostics, evaluateAuthPolicyMatrix } from './auth-policy-matrix.js';
import { redactSecretsInText } from './secret-redaction.js';
import { evaluateWorkerHostedAuthConfig } from '../server/worker-upstream-oidc-config.js';

export type ConfigEnvironment = Readonly<Record<string, string | undefined>>;

function createConfig(environment: ConfigEnvironment = {}): ServerConfig {
  return {
    courtListener: {
      baseUrl: environment.COURTLISTENER_BASE_URL || 'https://www.courtlistener.com/api/rest/v4',
      version: 'v4',
      timeout: parsePositiveInt(environment.COURTLISTENER_TIMEOUT, 30000, 1000),
      retryAttempts: parsePositiveInt(environment.COURTLISTENER_RETRY_ATTEMPTS, 3, 0),
      rateLimitPerMinute: parsePositiveInt(environment.COURTLISTENER_RATE_LIMIT, 100, 1),
      ...(environment.COURTLISTENER_API_KEY?.trim()
        ? { apiKey: environment.COURTLISTENER_API_KEY.trim() }
        : {}),
    },
    cache: {
      enabled: environment.CACHE_ENABLED !== 'false',
      ttl: parsePositiveInt(environment.CACHE_TTL, 300, 0), // 5 minutes default
      maxSize: parsePositiveInt(environment.CACHE_MAX_SIZE, 1000, 1),
    },
    logging: {
      level: parseLogLevel(environment.LOG_LEVEL),
      format: parseLogFormat(environment.LOG_FORMAT),
      enabled: environment.LOGGING_ENABLED !== 'false',
    },
    security: {
      authEnabled: environment.AUTH_ENABLED === 'true',
      apiKeys: environment.AUTH_API_KEYS
        ? environment.AUTH_API_KEYS.split(',')
            .map((key) => key.trim())
            .filter((key) => key.length > 0)
        : [],
    },
    sampling: {
      enabled: environment.SAMPLING_ENABLED === 'true',
      maxTokens: parsePositiveInt(environment.SAMPLING_MAX_TOKENS, 1000, 1),
      ...(environment.SAMPLING_DEFAULT_MODEL !== undefined && {
        defaultModel: environment.SAMPLING_DEFAULT_MODEL,
      }),
    },
    oauth: {
      enabled: environment.OAUTH_ENABLED === 'true',
      ...(environment.OAUTH_ISSUER_URL !== undefined && {
        issuerUrl: environment.OAUTH_ISSUER_URL,
      }),
      ...(environment.OAUTH_CLIENT_ID !== undefined && { clientId: environment.OAUTH_CLIENT_ID }),
      ...(environment.OAUTH_CLIENT_SECRET !== undefined && {
        clientSecret: environment.OAUTH_CLIENT_SECRET,
      }),
    },
    asyncExecution: {
      enabled: environment.MCP_ASYNC_EXECUTION_ENABLED !== 'false',
      queueConcurrency: parsePositiveInt(environment.MCP_ASYNC_QUEUE_CONCURRENCY, 1, 1),
      queueBatchSize: parsePositiveInt(environment.MCP_ASYNC_QUEUE_BATCH_SIZE, 1, 1),
      defaultMaxAttempts: parsePositiveInt(environment.MCP_ASYNC_DEFAULT_MAX_ATTEMPTS, 3, 1),
      defaultRetryDelayMs: parsePositiveInt(environment.MCP_ASYNC_DEFAULT_RETRY_DELAY_MS, 500, 0),
      defaultTtlSeconds: parsePositiveInt(environment.MCP_ASYNC_DEFAULT_TTL_SECONDS, 900, 1),
      maxStoredJobs: parsePositiveInt(environment.MCP_ASYNC_MAX_STORED_JOBS, 2000, 100),
      maxQueueDepth: parsePositiveInt(environment.MCP_ASYNC_MAX_QUEUE_DEPTH, 512, 1),
      queueLatencyGuardrailMs: parsePositiveInt(
        environment.MCP_ASYNC_QUEUE_LATENCY_GUARDRAIL_MS,
        2_000,
        1,
      ),
      completionLatencyGuardrailMs: parsePositiveInt(
        environment.MCP_ASYNC_COMPLETION_LATENCY_GUARDRAIL_MS,
        15_000,
        1,
      ),
    },
  };
}

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
 * const config = getConfig(process.env);
 * console.log(config.courtListener.baseUrl);
 * console.log(config.cache.enabled);
 * ```
 *
 * @see {@link ServerConfig} for complete configuration structure
 */
export function getConfig(environment: ConfigEnvironment = {}): ServerConfig {
  const config = validateConfigWithZod(createConfig(environment));
  assertStartupInvariants(config, environment);
  return config;
}

interface StartupInvariantReport {
  errors: string[];
  warnings: string[];
  authPolicy: AuthPolicyDiagnostics;
}

function evaluateStartupInvariants(
  config: ServerConfig,
  environment: ConfigEnvironment = {},
): StartupInvariantReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const authPolicy = evaluateAuthPolicyMatrix(config, environment);
  errors.push(...authPolicy.errors);
  warnings.push(...authPolicy.warnings);

  if (config.security.authEnabled && config.security.apiKeys.length === 0) {
    errors.push('Authentication enabled but no API keys provided');
  }

  if (environment.NODE_ENV === 'production' && config.logging.level === 'debug') {
    warnings.push('Debug logging should not be used in production');
  }

  if (!config.cache.enabled && config.courtListener.rateLimitPerMinute > 100) {
    warnings.push('High rate limits without caching may impact performance');
  }

  const requireProtocolVersion = environment.MCP_REQUIRE_PROTOCOL_VERSION;
  if (
    requireProtocolVersion !== undefined &&
    requireProtocolVersion !== 'true' &&
    requireProtocolVersion !== 'false'
  ) {
    warnings.push('MCP_REQUIRE_PROTOCOL_VERSION should be either "true" or "false"');
  }

  return {
    errors: errors.map((message) => redactSecretsInText(message)),
    warnings: warnings.map((message) => redactSecretsInText(message)),
    authPolicy: authPolicy.diagnostics,
  };
}

function assertStartupInvariants(config: ServerConfig, environment: ConfigEnvironment = {}): void {
  const startupInvariants = evaluateStartupInvariants(config, environment);
  if (startupInvariants.errors.length > 0) {
    throw new Error(`Startup invariants failed:\n${startupInvariants.errors.join('\n')}`);
  }
}

export function getStartupDiagnostics() {
  try {
    const config = getConfig(process.env);
    const invariants = evaluateStartupInvariants(config, process.env);

    return {
      status: invariants.errors.length === 0 ? 'ok' : 'error',
      invariants,
      auth: {
        oauthEnabled: config.oauth?.enabled ?? false,
        apiKeyAuthEnabled: config.security.authEnabled,
        gatewayTokenConfigured: Boolean(process.env.MCP_AUTH_TOKEN),
      },
      authPolicy: invariants.authPolicy,
      hostedAuth: invariants.authPolicy.hostedAuth,
      protocol: {
        requireVersionHeader: process.env.MCP_REQUIRE_PROTOCOL_VERSION === 'true',
        supportedVersions: [...SUPPORTED_MCP_PROTOCOL_VERSIONS],
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const hostedAuth = evaluateWorkerHostedAuthConfig(
      process.env as Parameters<typeof evaluateWorkerHostedAuthConfig>[0],
    );
    return {
      status: 'error',
      invariants: {
        errors: [redactSecretsInText(error instanceof Error ? error.message : String(error))],
        warnings: [] as string[],
        authPolicy: {
          precedence: ['oauth', 'serviceToken', 'oidc'],
          configured: {
            oauth: process.env.OAUTH_ENABLED === 'true',
            apiKeyAuth: process.env.AUTH_ENABLED === 'true',
            serviceToken: Boolean(process.env.MCP_AUTH_TOKEN?.trim()),
            oidc: Boolean(process.env.OIDC_ISSUER?.trim()),
          },
          hostedAuth,
          effectivePrimary: null,
          incompatibleRulesTriggered: [],
        },
      },
      auth: {
        oauthEnabled: process.env.OAUTH_ENABLED === 'true',
        apiKeyAuthEnabled: process.env.AUTH_ENABLED === 'true',
        gatewayTokenConfigured: Boolean(process.env.MCP_AUTH_TOKEN),
      },
      authPolicy: {
        precedence: ['oauth', 'serviceToken', 'oidc'],
        configured: {
          oauth: process.env.OAUTH_ENABLED === 'true',
          apiKeyAuth: process.env.AUTH_ENABLED === 'true',
          serviceToken: Boolean(process.env.MCP_AUTH_TOKEN?.trim()),
          oidc: Boolean(process.env.OIDC_ISSUER?.trim()),
        },
        hostedAuth,
        effectivePrimary: null,
        incompatibleRulesTriggered: [],
      },
      hostedAuth,
      protocol: {
        requireVersionHeader: process.env.MCP_REQUIRE_PROTOCOL_VERSION === 'true',
        supportedVersions: [...SUPPORTED_MCP_PROTOCOL_VERSIONS],
      },
      timestamp: new Date().toISOString(),
    };
  }
}
