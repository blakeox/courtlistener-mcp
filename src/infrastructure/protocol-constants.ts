/**
 * Protocol Constants - Single Source of Truth
 * Phase 1: MCP Modernization
 *
 * Centralized protocol version, feature flags, and capability definitions
 * shared across CLI, Worker, and Server entry points.
 *
 * NOTE: This file is Workers-compatible (no filesystem access)
 */

import { PACKAGE_VERSION } from './package-version.js';

export type ProtocolFeatureFlags = {
  TOOLS: boolean;
  LOGGING: boolean;
  RESOURCES: boolean;
  PROMPTS: boolean;
  SAMPLING: boolean;
  RESOURCE_SUBSCRIPTIONS: boolean;
  NATIVE_TASKS: boolean;
  LIST_CHANGED: boolean;
};

export interface ProtocolEnvironment {
  LOGGING_ENABLED?: string;
  SAMPLING_ENABLED?: string;
  MCP_RESOURCE_SUBSCRIPTIONS?: string;
  MCP_NATIVE_TASKS_ENABLED?: string;
  MCP_LIST_CHANGED_ENABLED?: string;
}

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

/**
 * Resolve MCP feature flags from environment variables.
 * Uses a single SAMPLING_ENABLED flag for both runtime and capability advertisement.
 */
export function resolveProtocolFeatureFlags(
  env: ProtocolEnvironment = typeof process !== 'undefined' ? process.env : {},
): ProtocolFeatureFlags {
  return {
    TOOLS: true,
    LOGGING: parseBooleanFlag(env.LOGGING_ENABLED, true),
    RESOURCES: true,
    PROMPTS: true,
    SAMPLING: parseBooleanFlag(env.SAMPLING_ENABLED, false),
    RESOURCE_SUBSCRIPTIONS: parseBooleanFlag(env.MCP_RESOURCE_SUBSCRIPTIONS, true),
    NATIVE_TASKS: parseBooleanFlag(env.MCP_NATIVE_TASKS_ENABLED, false),
    LIST_CHANGED: parseBooleanFlag(env.MCP_LIST_CHANGED_ENABLED, false),
  };
}

/**
 * Server metadata derived from package.json (injected at build time for Workers).
 */
export const SERVER_INFO = {
  name: 'courtlistener-mcp',
  version: PACKAGE_VERSION,
  description: 'Model Context Protocol server for CourtListener API',
} as const;

/**
 * MCP Protocol Version
 */
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
  '2025-11-25',
] as const;

export const PROTOCOL_VERSION = SUPPORTED_MCP_PROTOCOL_VERSIONS[0];
export const PREFERRED_MCP_PROTOCOL_VERSION = SUPPORTED_MCP_PROTOCOL_VERSIONS[2];

/**
 * Build MCP server capabilities from resolved feature flags.
 * Only advertises optional surfaces when they are actually supported.
 */
export function buildServerCapabilities(
  flags: ProtocolFeatureFlags = resolveProtocolFeatureFlags(),
) {
  return {
    tools: flags.TOOLS
      ? {
          ...(flags.LIST_CHANGED ? { listChanged: true as const } : {}),
        }
      : undefined,

    resources: flags.RESOURCES
      ? {
          ...(flags.RESOURCE_SUBSCRIPTIONS ? { subscribe: true as const } : {}),
          ...(flags.LIST_CHANGED ? { listChanged: true as const } : {}),
        }
      : undefined,

    prompts: flags.PROMPTS
      ? {
          ...(flags.LIST_CHANGED ? { listChanged: true as const } : {}),
        }
      : undefined,

    logging: flags.LOGGING ? {} : undefined,

    sampling: flags.SAMPLING ? {} : undefined,

    tasks: flags.NATIVE_TASKS
      ? {
          list: {},
          cancel: {},
          requests: {
            tools: {
              call: {},
            },
          },
        }
      : undefined,
  } as const;
}

/**
 * Feature flags for MCP capabilities (default runtime resolution).
 */
export const FEATURE_FLAGS = resolveProtocolFeatureFlags();

/**
 * MCP Server Capabilities advertised to clients by default.
 */
export const SERVER_CAPABILITIES = buildServerCapabilities(FEATURE_FLAGS);

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
  // MCP standard JSON-RPC error codes
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
export function isFeatureEnabled(feature: keyof ProtocolFeatureFlags): boolean {
  return FEATURE_FLAGS[feature];
}

/**
 * Get enabled capabilities for server advertisement
 */
export function getEnabledCapabilities() {
  return buildServerCapabilities(FEATURE_FLAGS);
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
