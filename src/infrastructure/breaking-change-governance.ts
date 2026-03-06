import { PREFERRED_MCP_PROTOCOL_VERSION } from './protocol-constants.js';

export type BreakingChangeId =
  | 'bp8-session-topology-v2'
  | 'bp9-async-workflow-envelope'
  | 'bp10-edge-auth-precedence';

export interface BreakingChangeGateDefinition {
  id: BreakingChangeId;
  description: string;
  envFlag: string;
  introducedBy: 'BP8' | 'BP9' | 'BP10';
  minProtocolVersion: string;
  defaultEnabled: boolean;
  migrationNotes: readonly string[];
}

export interface BreakingChangeDecision {
  id: BreakingChangeId;
  enabled: boolean;
  reason:
    | 'flag_enabled'
    | 'flag_disabled'
    | 'protocol_gate'
    | 'default_enabled'
    | 'default_disabled';
  envFlag: string;
  protocolVersion: string;
}

export const BREAKING_CHANGE_GATES: readonly BreakingChangeGateDefinition[] = Object.freeze([
  {
    id: 'bp8-session-topology-v2',
    description: 'Durable Object session topology v2 shard ownership + TTL lifecycle',
    envFlag: 'MCP_BREAKING_BP8_SESSION_TOPOLOGY_V2',
    introducedBy: 'BP8',
    minProtocolVersion: '2025-03-26',
    defaultEnabled: true,
    migrationNotes: Object.freeze([
      'Validate deterministic shard ownership before rollout by replaying existing session IDs.',
      'Set explicit session TTL env values to avoid relying on previous implicit defaults.',
    ]),
  },
  {
    id: 'bp9-async-workflow-envelope',
    description: 'Queue-backed async execution envelope (__mcp_async + control tools)',
    envFlag: 'MCP_BREAKING_BP9_ASYNC_WORKFLOW',
    introducedBy: 'BP9',
    minProtocolVersion: '2025-03-26',
    defaultEnabled: true,
    migrationNotes: Object.freeze([
      'Adopt mcp_async_get_job, mcp_async_get_job_result, and mcp_async_cancel_job contract in clients.',
      'Treat async response envelopes as canonical payloads for long-running tool calls.',
    ]),
  },
  {
    id: 'bp10-edge-auth-precedence',
    description: 'OAuth-first edge auth with explicit service-token header exceptions only',
    envFlag: 'MCP_BREAKING_BP10_EDGE_AUTH_PRECEDENCE',
    introducedBy: 'BP10',
    minProtocolVersion: '2025-03-26',
    defaultEnabled: true,
    migrationNotes: Object.freeze([
      'Client MCP access now requires OAuth/OIDC tokens; MCP_AUTH_TOKEN is reserved for explicit x-mcp-service-token usage only.',
      'Audit x-mcp-service-token usage and ensure invalid service tokens fail closed.',
    ]),
  },
]);

function parseBooleanFlag(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return null;
}

function compareProtocolVersion(left: string, right: string): number {
  if (left === right) return 0;
  return left.localeCompare(right);
}

export function evaluateBreakingChangeGate(
  definition: BreakingChangeGateDefinition,
  options: {
    env?: Record<string, string | undefined>;
    protocolVersion?: string;
  } = {},
): BreakingChangeDecision {
  const env = options.env ?? process.env;
  const protocolVersion = options.protocolVersion ?? PREFERRED_MCP_PROTOCOL_VERSION;
  const envValue = parseBooleanFlag(env[definition.envFlag]);

  if (envValue === true) {
    return {
      id: definition.id,
      enabled: true,
      reason: 'flag_enabled',
      envFlag: definition.envFlag,
      protocolVersion,
    };
  }

  if (envValue === false) {
    return {
      id: definition.id,
      enabled: false,
      reason: 'flag_disabled',
      envFlag: definition.envFlag,
      protocolVersion,
    };
  }

  if (compareProtocolVersion(protocolVersion, definition.minProtocolVersion) < 0) {
    return {
      id: definition.id,
      enabled: false,
      reason: 'protocol_gate',
      envFlag: definition.envFlag,
      protocolVersion,
    };
  }

  return {
    id: definition.id,
    enabled: definition.defaultEnabled,
    reason: definition.defaultEnabled ? 'default_enabled' : 'default_disabled',
    envFlag: definition.envFlag,
    protocolVersion,
  };
}

export function evaluateAllBreakingChangeGates(options: {
  env?: Record<string, string | undefined>;
  protocolVersion?: string;
} = {}): readonly BreakingChangeDecision[] {
  return BREAKING_CHANGE_GATES.map((gate) => evaluateBreakingChangeGate(gate, options));
}

export function getBreakingChangeMigrationNotes(): readonly {
  id: BreakingChangeId;
  introducedBy: 'BP8' | 'BP9' | 'BP10';
  envFlag: string;
  minProtocolVersion: string;
  notes: readonly string[];
}[] {
  return BREAKING_CHANGE_GATES.map((gate) => ({
    id: gate.id,
    introducedBy: gate.introducedBy,
    envFlag: gate.envFlag,
    minProtocolVersion: gate.minProtocolVersion,
    notes: gate.migrationNotes,
  }));
}
