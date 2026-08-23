import {
  buildWorkerOperationalTelemetryEvent,
  type WorkerOperationalTelemetryInput,
} from './worker-operational-telemetry.js';

export interface CloudflareTelemetryEnv {
  ANALYTICS?: AnalyticsEngineDataset;
  MCP_CF_ANALYTICS_ENABLED?: string;
  MCP_CF_STRUCTURED_LOGS_ENABLED?: string;
}

export interface CloudflareTelemetryRuntime<TEnv extends CloudflareTelemetryEnv> {
  recordRouteLatency(env: TEnv, route: string, elapsedMs: number): void;
  recordDurableObjectLatency(env: TEnv, dimension: string, elapsedMs: number): void;
  recordDurableObjectUnavailable(env: TEnv, dimension: string): void;
  recordTurnstileVerdict(
    env: TEnv,
    routeId: string,
    outcome: 'passed' | 'failed' | 'not_enforced',
  ): void;
  recordAsyncJobUpdate(env: TEnv, status: string, toolName: string, attempts: number): void;
  recordUiEvent(
    env: TEnv,
    eventName: string,
    userId: string | null,
    route: string,
    outcome: string,
  ): void;
  recordOperationalEvent(env: TEnv, event: WorkerOperationalTelemetryInput): void;
}

function parseBoolean(raw: string | undefined): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function createCloudflareTelemetryRuntime<
  TEnv extends CloudflareTelemetryEnv,
>(): CloudflareTelemetryRuntime<TEnv> {
  function getWritableEnv(env: TEnv): (TEnv & { ANALYTICS: AnalyticsEngineDataset }) | null {
    if (
      parseBoolean(env.MCP_CF_ANALYTICS_ENABLED) &&
      env.ANALYTICS &&
      typeof env.ANALYTICS.writeDataPoint === 'function'
    ) {
      return env as TEnv & { ANALYTICS: AnalyticsEngineDataset };
    }
    return null;
  }

  function writePoint(env: TEnv, indexes: string[], blobs: string[], doubles: number[]): void {
    const writableEnv = getWritableEnv(env);
    if (!writableEnv) return;
    try {
      writableEnv.ANALYTICS.writeDataPoint({
        indexes,
        blobs,
        doubles,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'cloudflare_analytics_write_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  function recordOperationalEvent(env: TEnv, event: WorkerOperationalTelemetryInput): void {
    if (!parseBoolean(env.MCP_CF_STRUCTURED_LOGS_ENABLED)) return;
    console.log(JSON.stringify(buildWorkerOperationalTelemetryEvent(event)));
  }

  return {
    recordRouteLatency(env: TEnv, route: string, elapsedMs: number): void {
      recordOperationalEvent(env, {
        event: 'route_latency',
        route,
        duration_ms: Number.isFinite(elapsedMs) ? elapsedMs : 0,
      });
      writePoint(env, ['route_latency'], [route], [Number.isFinite(elapsedMs) ? elapsedMs : 0]);
    },
    recordDurableObjectLatency(env: TEnv, dimension: string, elapsedMs: number): void {
      recordOperationalEvent(env, {
        event: 'durable_object_latency',
        do_dimension: dimension,
        duration_ms: Number.isFinite(elapsedMs) ? elapsedMs : 0,
      });
      writePoint(
        env,
        ['durable_object_latency'],
        [dimension],
        [Number.isFinite(elapsedMs) ? elapsedMs : 0],
      );
    },
    recordDurableObjectUnavailable(env: TEnv, dimension: string): void {
      recordOperationalEvent(env, {
        event: 'durable_object_unavailable',
        do_dimension: dimension,
        outcome: 'unavailable',
      });
      writePoint(env, ['durable_object_unavailable'], [dimension], [1]);
    },
    recordTurnstileVerdict(
      env: TEnv,
      routeId: string,
      outcome: 'passed' | 'failed' | 'not_enforced',
    ): void {
      recordOperationalEvent(env, { event: 'turnstile_verdict', route: routeId, outcome });
      writePoint(env, ['turnstile'], [routeId, outcome], [1]);
    },
    recordAsyncJobUpdate(env: TEnv, status: string, toolName: string, attempts: number): void {
      recordOperationalEvent(env, {
        event: 'async_job_update',
        queue_state: status,
        tool: toolName,
        attempt: Math.max(0, attempts),
      });
      writePoint(env, ['async_job'], [status, toolName], [Math.max(0, attempts)]);
    },
    recordUiEvent(
      env: TEnv,
      eventName: string,
      userId: string | null,
      route: string,
      outcome: string,
    ): void {
      recordOperationalEvent(env, {
        event: 'ui_event',
        route,
        outcome,
        client_category: userId ? 'authenticated' : 'anonymous',
      });
      writePoint(env, ['ui_event'], [eventName, userId || 'anonymous', route, outcome], [1]);
    },
    recordOperationalEvent,
  };
}
