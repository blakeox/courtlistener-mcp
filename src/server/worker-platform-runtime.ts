import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import {
  createWorkerObservabilityRuntime,
  type WorkerObservabilityRuntime,
} from './worker-observability-runtime.js';
import { createCloudflareTelemetryRuntime } from './worker-cloudflare-telemetry-runtime.js';
import {
  createWorkerDurableRuntime,
  type WorkerDurableRuntime,
  type WorkerDurableRuntimeEnv,
} from './worker-durable-runtime.js';
import {
  createWorkerUiSessionRuntime,
  type WorkerUiSessionRuntime,
} from './worker-ui-session-runtime.js';
import { jsonError } from './worker-response-runtime.js';
import type { WorkerPlatformEnv } from './worker-runtime-contract.js';
import {
  WORKER_DO_OUTLIER_MIN_SAMPLES,
  WORKER_DO_OUTLIER_SCORE_THRESHOLD,
  WORKER_EXPORT_TOP_SLOW_OPERATION_LIMIT,
  WORKER_ROUTE_LATENCY_MAX_ROUTES,
  WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE,
} from './worker-runtime-contract.js';
import type { WorkerUiSessionRuntimeEnv } from './worker-ui-session-runtime.js';

export type WorkerPlatformRuntimeEnv = WorkerPlatformEnv &
  WorkerUiSessionRuntimeEnv &
  WorkerDurableRuntimeEnv;

export interface WorkerPlatformRuntime<TEnv extends WorkerPlatformRuntimeEnv> {
  cloudflareTelemetryRuntime: ReturnType<typeof createCloudflareTelemetryRuntime<TEnv>>;
  workerObservabilityRuntime: WorkerObservabilityRuntime<TEnv>;
  workerDurableRuntime: WorkerDurableRuntime<TEnv>;
  workerUiSessionRuntime: WorkerUiSessionRuntime<TEnv>;
  parseJsonBody: <T>(request: Request) => Promise<T | null>;
  getOAuthHelpersRef: () => (env: TEnv) => OAuthHelpers;
  setOAuthHelpers: (getOAuthHelpers: (env: TEnv) => OAuthHelpers) => void;
}

export function createWorkerPlatformRuntime<
  TEnv extends WorkerPlatformRuntimeEnv,
>(): WorkerPlatformRuntime<TEnv> {
  const cloudflareTelemetryRuntime = createCloudflareTelemetryRuntime<TEnv>();

  const workerObservabilityRuntime = createWorkerObservabilityRuntime<TEnv>({
    routeLatencyMaxRoutes: WORKER_ROUTE_LATENCY_MAX_ROUTES,
    routeLatencyOverflowRoute: WORKER_ROUTE_LATENCY_OVERFLOW_ROUTE,
    exportTopSlowOperationLimit: WORKER_EXPORT_TOP_SLOW_OPERATION_LIMIT,
    doOutlierScoreThreshold: WORKER_DO_OUTLIER_SCORE_THRESHOLD,
    doOutlierMinSamples: WORKER_DO_OUTLIER_MIN_SAMPLES,
    onRouteLatencyRecorded: (env, route, elapsedMs) =>
      cloudflareTelemetryRuntime.recordRouteLatency(env, route, elapsedMs),
    onDurableObjectLatencyRecorded: (env, dimension, elapsedMs) =>
      cloudflareTelemetryRuntime.recordDurableObjectLatency(env, dimension, elapsedMs),
    onDurableObjectUnavailable: (env, dimension) =>
      cloudflareTelemetryRuntime.recordDurableObjectUnavailable(env, dimension),
  });

  const workerDurableRuntime = createWorkerDurableRuntime<TEnv>({
    now: () => Date.now(),
    recordDurableObjectLatency: workerObservabilityRuntime.recordDurableObjectLatency,
    recordDurableObjectUnavailable: workerObservabilityRuntime.recordDurableObjectUnavailable,
    jsonError,
  });

  const workerUiSessionRuntime = createWorkerUiSessionRuntime<TEnv>({
    jsonError,
    getClientIdentifier: workerObservabilityRuntime.getClientIdentifier,
    isUiSessionRevoked: workerDurableRuntime.isUiSessionRevoked,
    recordSessionBootstrapRateLimit: workerDurableRuntime.recordSessionBootstrapRateLimit,
  });

  let getOAuthHelpersRef: (env: TEnv) => OAuthHelpers = () => {
    throw new Error('OAuth helpers are not initialized.');
  };

  return {
    cloudflareTelemetryRuntime,
    workerObservabilityRuntime,
    workerDurableRuntime,
    workerUiSessionRuntime,
    parseJsonBody: async <T>(request: Request): Promise<T | null> => {
      try {
        return (await request.json()) as T;
      } catch {
        return null;
      }
    },
    getOAuthHelpersRef: () => getOAuthHelpersRef,
    setOAuthHelpers: (getOAuthHelpers) => {
      getOAuthHelpersRef = getOAuthHelpers;
    },
  };
}

export function isMcpPath(pathname: string): boolean {
  return pathname === '/mcp';
}
