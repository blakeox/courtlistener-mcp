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
  setCurrentEnv(env: TEnv | null): void;
  recordRouteLatency(route: string, elapsedMs: number): void;
  recordDurableObjectLatency(dimension: string, elapsedMs: number): void;
  recordDurableObjectUnavailable(dimension: string): void;
  recordTurnstileVerdict(routeId: string, outcome: 'passed' | 'failed' | 'not_enforced'): void;
  recordAsyncJobUpdate(status: string, toolName: string, attempts: number): void;
  recordUiEvent(eventName: string, userId: string | null, route: string, outcome: string): void;
  recordOperationalEvent(event: WorkerOperationalTelemetryInput): void;
}

function parseBoolean(raw: string | undefined): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function createCloudflareTelemetryRuntime<
  TEnv extends CloudflareTelemetryEnv,
>(): CloudflareTelemetryRuntime<TEnv> {
  let currentEnv: TEnv | null = null;

  function getWritableEnv(): (TEnv & { ANALYTICS: AnalyticsEngineDataset }) | null {
    if (
      currentEnv &&
      parseBoolean(currentEnv.MCP_CF_ANALYTICS_ENABLED) &&
      currentEnv.ANALYTICS &&
      typeof currentEnv.ANALYTICS.writeDataPoint === 'function'
    ) {
      return currentEnv as TEnv & { ANALYTICS: AnalyticsEngineDataset };
    }
    return null;
  }

  function writePoint(indexes: string[], blobs: string[], doubles: number[]): void {
    const writableEnv = getWritableEnv();
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

  function recordOperationalEvent(event: WorkerOperationalTelemetryInput): void {
    if (!currentEnv || !parseBoolean(currentEnv.MCP_CF_STRUCTURED_LOGS_ENABLED)) return;
    console.log(JSON.stringify(buildWorkerOperationalTelemetryEvent(event)));
  }

  return {
    setCurrentEnv(env: TEnv | null): void {
      currentEnv = env;
    },
    recordRouteLatency(route: string, elapsedMs: number): void {
      recordOperationalEvent({
        event: 'route_latency',
        route,
        duration_ms: Number.isFinite(elapsedMs) ? elapsedMs : 0,
      });
      writePoint(['route_latency'], [route], [Number.isFinite(elapsedMs) ? elapsedMs : 0]);
    },
    recordDurableObjectLatency(dimension: string, elapsedMs: number): void {
      recordOperationalEvent({
        event: 'durable_object_latency',
        do_dimension: dimension,
        duration_ms: Number.isFinite(elapsedMs) ? elapsedMs : 0,
      });
      writePoint(
        ['durable_object_latency'],
        [dimension],
        [Number.isFinite(elapsedMs) ? elapsedMs : 0],
      );
    },
    recordDurableObjectUnavailable(dimension: string): void {
      recordOperationalEvent({
        event: 'durable_object_unavailable',
        do_dimension: dimension,
        outcome: 'unavailable',
      });
      writePoint(['durable_object_unavailable'], [dimension], [1]);
    },
    recordTurnstileVerdict(routeId: string, outcome: 'passed' | 'failed' | 'not_enforced'): void {
      recordOperationalEvent({ event: 'turnstile_verdict', route: routeId, outcome });
      writePoint(['turnstile'], [routeId, outcome], [1]);
    },
    recordAsyncJobUpdate(status: string, toolName: string, attempts: number): void {
      recordOperationalEvent({
        event: 'async_job_update',
        queue_state: status,
        tool: toolName,
        attempt: Math.max(0, attempts),
      });
      writePoint(['async_job'], [status, toolName], [Math.max(0, attempts)]);
    },
    recordUiEvent(eventName: string, userId: string | null, route: string, outcome: string): void {
      recordOperationalEvent({
        event: 'ui_event',
        route,
        outcome,
        client_category: userId ? 'authenticated' : 'anonymous',
      });
      writePoint(['ui_event'], [eventName, userId || 'anonymous', route, outcome], [1]);
    },
    recordOperationalEvent,
  };
}
