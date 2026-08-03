import { PACKAGE_VERSION } from './package-version.js';

export const RUNTIME_READINESS_SCHEMA_VERSION = 'v1' as const;

export type RuntimeWorkerRole = 'edge' | 'mcp' | 'auth-limiter' | 'node' | 'unknown';
export type RuntimeReadinessStatus = 'ready' | 'not_ready';

export interface RuntimeReadinessCheck {
  status: 'pass' | 'fail';
  message: string;
  details?: Record<string, unknown>;
}

export interface RuntimeReadinessPayload {
  status: RuntimeReadinessStatus;
  service: 'courtlistener-mcp';
  worker_role: RuntimeWorkerRole;
  schema_version: typeof RUNTIME_READINESS_SCHEMA_VERSION;
  timestamp: string;
  version: string;
  checks: Record<string, RuntimeReadinessCheck>;
}

export function buildRuntimeReadinessPayload(options: {
  workerRole: RuntimeWorkerRole;
  checks: Record<string, RuntimeReadinessCheck>;
  version?: string;
  now?: () => number;
}): RuntimeReadinessPayload {
  const checks = options.checks;
  const status = Object.values(checks).every((check) => check.status === 'pass')
    ? 'ready'
    : 'not_ready';

  return {
    status,
    service: 'courtlistener-mcp',
    worker_role: options.workerRole,
    schema_version: RUNTIME_READINESS_SCHEMA_VERSION,
    timestamp: new Date(options.now?.() ?? Date.now()).toISOString(),
    version: options.version ?? PACKAGE_VERSION,
    checks,
  };
}

export function runtimeReadinessStatusCode(status: RuntimeReadinessStatus): number {
  return status === 'ready' ? 200 : 503;
}
