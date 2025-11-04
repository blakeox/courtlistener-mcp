/**
 * Protocol Constants - Single Source of Truth
 * Phase 1: MCP Modernization
 *
 * Centralized protocol version, feature flags, and capability definitions
 * shared across CLI, Worker, and Server entry points.
 *
 * NOTE: This file is Workers-compatible (no filesystem access)
 */

/**
 * Get version
 * In Workers environment, use env var or default
 * In Node.js, this will be injected at build time
 */
function getPackageVersion(): string {
  // Check if running in Cloudflare Workers
  if (typeof process === 'undefined' || typeof process.versions === 'undefined') {
    // Workers environment - use env or default
    return '0.1.0';
  }

  // Node.js environment - try to read package.json
  try {
    // Dynamic import only in Node.js
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join, dirname } = require('path') as typeof import('path');
    const { fileURLToPath } = require('url') as typeof import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

/**
 * Server metadata derived from package.json
 */
export const SERVER_INFO = {
  name: 'courtlistener-mcp',
  version: getPackageVersion(),
  description: 'Model Context Protocol server for CourtListener API',
} as const;

/**
 * MCP Protocol Version
 */
export const PROTOCOL_VERSION = '2024-11-05' as const;

/**
 * Feature flags for MCP capabilities
 * Enable/disable features during gradual rollout
 */
export const FEATURE_FLAGS = {
  // Core features (always enabled)
  TOOLS: true,
  LOGGING: true,

  // New features (enable gradually)
  RESOURCES: process.env.ENABLE_MCP_RESOURCES === 'true',
  PROMPTS: process.env.ENABLE_MCP_PROMPTS === 'true',
  SAMPLING: process.env.ENABLE_MCP_SAMPLING === 'true',

  // Response format features
  STREAMING: process.env.ENABLE_MCP_STREAMING === 'true',
  STRUCTURED_CONTENT: process.env.ENABLE_STRUCTURED_CONTENT === 'true',
} as const;

/**
 * MCP Server Capabilities
 * Defines what the server advertises to clients
 */
export const SERVER_CAPABILITIES = {
  tools: FEATURE_FLAGS.TOOLS ? {} : undefined,

  resources: FEATURE_FLAGS.RESOURCES
    ? {
        subscribe: true,
        listChanged: true,
      }
    : undefined,

  prompts: FEATURE_FLAGS.PROMPTS
    ? {
        listChanged: true,
      }
    : undefined,

  logging: FEATURE_FLAGS.LOGGING ? {} : undefined,

  sampling: FEATURE_FLAGS.SAMPLING ? {} : undefined,
} as const;

/**
 * Transport configuration
 */
export const TRANSPORT = {
  STDIO: 'stdio',
  HTTP: 'http',
  SSE: 'sse',
} as const;

/**
 * Request limits and backpressure
 */
export const LIMITS = {
  MAX_CONCURRENT_REQUESTS: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '10', 10),
  REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
  MAX_PAYLOAD_SIZE: parseInt(process.env.MAX_PAYLOAD_SIZE || '10485760', 10), // 10MB
} as const;

/**
 * Session configuration
 */
export const SESSION = {
  HEARTBEAT_INTERVAL_MS: 30000, // 30 seconds
  SESSION_TIMEOUT_MS: 300000, // 5 minutes
  KEEPALIVE_ENABLED: true,
} as const;

/**
 * Error codes
 */
export const ERROR_CODES = {
  // MCP standard error codes
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // Application error codes
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_ERROR: -32002,
  VALIDATION_ERROR: -32003,
  RATE_LIMIT_ERROR: -32004,
  AUTH_ERROR: -32005,
} as const;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature];
}

/**
 * Get enabled capabilities for server advertisement
 */
export function getEnabledCapabilities(): typeof SERVER_CAPABILITIES {
  return SERVER_CAPABILITIES;
}

/**
 * Get server info for protocol negotiation
 */
export function getServerInfo() {
  return {
    ...SERVER_INFO,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: getEnabledCapabilities(),
  };
}

/**
 * Log current configuration
 */
export function logConfiguration(logger: { info: (message: string, meta: unknown) => void }) {
  logger.info('Protocol configuration', {
    server: SERVER_INFO,
    protocol: PROTOCOL_VERSION,
    features: FEATURE_FLAGS,
    capabilities: Object.keys(SERVER_CAPABILITIES).filter(
      (key) => SERVER_CAPABILITIES[key as keyof typeof SERVER_CAPABILITIES] !== undefined,
    ),
    limits: LIMITS,
  });
}
