import {
  buildRuntimeHealthPayload,
  resolveCloudflareBindingsSnapshot,
  toSessionTopologySnapshot,
  type RuntimeHealthExtendedPayload,
} from '../infrastructure/runtime-health-contract.js';

interface SessionSnapshot {
  version: string;
  shardCount: number;
  idleTtlMs: number;
  absoluteTtlMs: number;
  evictionSweepLimit: number;
}

export type WorkerHealthPayload = RuntimeHealthExtendedPayload;

export function buildWorkerHealthPayload(
  sessionTopology: SessionSnapshot,
  latencySnapshot: unknown,
  cloudflareState: {
    analyticsEnabled: boolean;
    asyncQueueConfigured: boolean;
    asyncJobsKvConfigured: boolean;
    turnstileEnforcedRoutes: string[];
  },
): WorkerHealthPayload {
  return buildRuntimeHealthPayload({
    runtime: 'cloudflare-worker',
    transport: 'cloudflare-agents-streamable-http',
    diagnostics: {
      session_topology: toSessionTopologySnapshot(sessionTopology),
      cloudflare: resolveCloudflareBindingsSnapshot(
        {},
        {
          analytics_enabled: cloudflareState.analyticsEnabled,
          async_queue_configured: cloudflareState.asyncQueueConfigured,
          async_jobs_kv_configured: cloudflareState.asyncJobsKvConfigured,
          turnstile_enforced_routes: cloudflareState.turnstileEnforcedRoutes,
        },
      ),
      metrics: {
        latency_ms: latencySnapshot,
      },
    },
  });
}
