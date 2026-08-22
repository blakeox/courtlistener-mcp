import {
  buildRuntimeHealthPayload,
  resolveCloudflareBindingsSnapshot,
  type RuntimeHealthExtendedPayload,
} from '../infrastructure/runtime-health-contract.js';

export type WorkerHealthPayload = RuntimeHealthExtendedPayload;

export function buildWorkerHealthPayload(
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
    transport: 'cloudflare-mcp-v2-streamable-http',
    diagnostics: {
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
