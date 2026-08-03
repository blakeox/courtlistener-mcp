export interface SessionTopologyEnv {
  MCP_SESSION_SHARD_COUNT?: string;
  MCP_SESSION_IDLE_TTL_SECONDS?: string;
  MCP_SESSION_ABSOLUTE_TTL_SECONDS?: string;
  MCP_SESSION_EVICTION_SWEEP_LIMIT?: string;
}

export interface SessionTopologyValidationReport {
  errors: string[];
  warnings: string[];
}

function parseConfiguredPositiveInt(
  raw: string | undefined,
  name: string,
  errors: string[],
): number | null {
  if (raw === undefined || raw.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    errors.push(`${name} must be a positive integer when set`);
    return null;
  }

  return parsed;
}

function hasExplicitSessionTopologyConfig(env: SessionTopologyEnv): boolean {
  return (
    env.MCP_SESSION_SHARD_COUNT !== undefined ||
    env.MCP_SESSION_IDLE_TTL_SECONDS !== undefined ||
    env.MCP_SESSION_ABSOLUTE_TTL_SECONDS !== undefined ||
    env.MCP_SESSION_EVICTION_SWEEP_LIMIT !== undefined
  );
}

/**
 * Validates explicit MCP session topology environment variables.
 * When no MCP_SESSION_* vars are set, returns an empty report so local defaults apply.
 */
export function validateSessionTopologyEnvironment(
  env: SessionTopologyEnv,
  label = 'Session topology',
): SessionTopologyValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!hasExplicitSessionTopologyConfig(env)) {
    return { errors, warnings };
  }

  const idle = parseConfiguredPositiveInt(
    env.MCP_SESSION_IDLE_TTL_SECONDS,
    'MCP_SESSION_IDLE_TTL_SECONDS',
    errors,
  );
  const absolute = parseConfiguredPositiveInt(
    env.MCP_SESSION_ABSOLUTE_TTL_SECONDS,
    'MCP_SESSION_ABSOLUTE_TTL_SECONDS',
    errors,
  );
  parseConfiguredPositiveInt(env.MCP_SESSION_SHARD_COUNT, 'MCP_SESSION_SHARD_COUNT', errors);
  parseConfiguredPositiveInt(
    env.MCP_SESSION_EVICTION_SWEEP_LIMIT,
    'MCP_SESSION_EVICTION_SWEEP_LIMIT',
    errors,
  );

  if (idle !== null && absolute !== null && absolute <= idle) {
    errors.push(
      `${label}: MCP_SESSION_ABSOLUTE_TTL_SECONDS must be greater than MCP_SESSION_IDLE_TTL_SECONDS`,
    );
  }

  return { errors, warnings };
}
