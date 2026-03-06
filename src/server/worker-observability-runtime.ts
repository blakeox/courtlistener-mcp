import type {
  DurableObjectLatencyDimension,
  DurableObjectOutlierSignal,
  LatencySnapshot,
  LatencyStats,
  SlowOperationSnapshot,
} from './worker-runtime-contract.js';
import type { WorkerMcpSessionTopologyV2 } from './worker-mcp-session-topology.js';
import type { Env } from './worker-runtime-contract.js';
import { parseAllowedOrigins } from './worker-security.js';

export interface CreateWorkerObservabilityRuntimeDeps {
  routeLatencyMaxRoutes: number;
  routeLatencyOverflowRoute: string;
  exportTopSlowOperationLimit: number;
  doOutlierScoreThreshold: number;
  doOutlierMinSamples: number;
  resolveWorkerMcpSessionTopologyV2: (env: Env) => WorkerMcpSessionTopologyV2;
}

export interface WorkerObservabilityRuntime<TEnv extends Env> {
  getRequestOrigin(request: Request): string | null;
  getClientIdentifier(request: Request): string;
  buildWorkerRouteMetricKey(method: string, pathname: string): string;
  recordRouteLatency(route: string, elapsedMs: number): void;
  recordDurableObjectLatency(dimension: DurableObjectLatencyDimension, elapsedMs: number): void;
  getCachedAllowedOrigins(rawAllowedOrigins: string | undefined, authUiOriginRaw?: string): string[];
  getCachedSessionTopology(env: TEnv): WorkerMcpSessionTopologyV2;
  getWorkerLatencySnapshot(): {
    routes: Record<string, LatencySnapshot>;
    durable_objects: Record<DurableObjectLatencyDimension, LatencySnapshot>;
    export_snapshot: {
      generated_at: string;
      top_slow_operations: SlowOperationSnapshot[];
      durable_object_latency_outliers: DurableObjectOutlierSignal[];
    };
  };
}

function recordLatency(stats: LatencyStats, elapsedMs: number): void {
  const durationMs = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0;
  stats.count += 1;
  stats.totalMs += durationMs;
  if (durationMs > stats.maxMs) {
    stats.maxMs = durationMs;
  }
  stats.lastMs = durationMs;
}

function normalizeRouteSegment(segment: string): string {
  if (!segment) return segment;
  if (/^\d+$/.test(segment)) return ':id';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)) {
    return ':uuid';
  }
  if (/^[A-Za-z0-9_-]{24,}$/.test(segment)) return ':token';
  return segment;
}

function normalizeOriginFromUrlLike(input: string | undefined): string | null {
  const value = input?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getLatencySnapshot(stats: LatencyStats): LatencySnapshot {
  return {
    count: stats.count,
    avg_ms: stats.count > 0 ? Number((stats.totalMs / stats.count).toFixed(2)) : 0,
    max_ms: Number(stats.maxMs.toFixed(2)),
    last_ms: Number(stats.lastMs.toFixed(2)),
  };
}

export function createWorkerObservabilityRuntime<TEnv extends Env>(
  deps: CreateWorkerObservabilityRuntimeDeps,
): WorkerObservabilityRuntime<TEnv> {
  const workerRouteLatency = new Map<string, LatencyStats>();
  const allowedOriginsCache = new Map<string, string[]>();
  const sessionTopologyCache = new Map<string, WorkerMcpSessionTopologyV2>();
  const durableObjectLatency: Record<DurableObjectLatencyDimension, LatencyStats> = {
    auth_limiter: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 },
    session_revocation: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 },
    ai_chat_quota: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 },
  };

  return {
    getRequestOrigin(request: Request): string | null {
      return request.headers.get('Origin');
    },

    getClientIdentifier(request: Request): string {
      const cfIp = request.headers.get('CF-Connecting-IP')?.trim();
      if (cfIp) return cfIp;
      const xff = request.headers.get('X-Forwarded-For');
      if (xff) {
        const first = xff.split(',')[0]?.trim();
        if (first) return first;
      }
      return 'unknown';
    },

    buildWorkerRouteMetricKey(method: string, pathname: string): string {
      const normalizedPath = pathname
        .split('/')
        .map((segment) => normalizeRouteSegment(segment))
        .join('/');
      return `${method.toUpperCase()} ${normalizedPath || '/'}`;
    },

    recordRouteLatency(route: string, elapsedMs: number): void {
      const overflowExists = workerRouteLatency.has(deps.routeLatencyOverflowRoute);
      const routeCap = overflowExists ? deps.routeLatencyMaxRoutes : deps.routeLatencyMaxRoutes - 1;
      const routeKey =
        workerRouteLatency.has(route) || workerRouteLatency.size < routeCap
          ? route
          : deps.routeLatencyOverflowRoute;
      const stats = workerRouteLatency.get(routeKey);
      if (stats) {
        recordLatency(stats, elapsedMs);
        return;
      }

      const durationMs = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0;
      workerRouteLatency.set(routeKey, {
        count: 1,
        totalMs: durationMs,
        maxMs: durationMs,
        lastMs: durationMs,
      });
    },

    recordDurableObjectLatency(dimension: DurableObjectLatencyDimension, elapsedMs: number): void {
      recordLatency(durableObjectLatency[dimension], elapsedMs);
    },

    getCachedAllowedOrigins(rawAllowedOrigins: string | undefined, authUiOriginRaw?: string): string[] {
      const cacheKey = `${rawAllowedOrigins ?? ''}|${authUiOriginRaw ?? ''}`;
      const cached = allowedOriginsCache.get(cacheKey);
      if (cached) return cached;
      const parsed = parseAllowedOrigins(rawAllowedOrigins);
      const authUiOrigin = normalizeOriginFromUrlLike(authUiOriginRaw);
      if (authUiOrigin && !parsed.includes('*') && !parsed.includes(authUiOrigin)) {
        parsed.push(authUiOrigin);
      }
      allowedOriginsCache.set(cacheKey, parsed);
      return parsed;
    },

    getCachedSessionTopology(env: TEnv): WorkerMcpSessionTopologyV2 {
      const cacheKey = [
        env.MCP_SESSION_SHARD_COUNT ?? '',
        env.MCP_SESSION_IDLE_TTL_SECONDS ?? '',
        env.MCP_SESSION_ABSOLUTE_TTL_SECONDS ?? '',
        env.MCP_SESSION_EVICTION_SWEEP_LIMIT ?? '',
      ].join('|');
      const cached = sessionTopologyCache.get(cacheKey);
      if (cached) return cached;
      const topology = deps.resolveWorkerMcpSessionTopologyV2(env);
      sessionTopologyCache.set(cacheKey, topology);
      return topology;
    },

    getWorkerLatencySnapshot(): {
      routes: Record<string, LatencySnapshot>;
      durable_objects: Record<DurableObjectLatencyDimension, LatencySnapshot>;
      export_snapshot: {
        generated_at: string;
        top_slow_operations: SlowOperationSnapshot[];
        durable_object_latency_outliers: DurableObjectOutlierSignal[];
      };
    } {
      const routes: Record<string, LatencySnapshot> = {};
      for (const [route, stats] of workerRouteLatency.entries()) {
        routes[route] = getLatencySnapshot(stats);
      }

      const durableObjects = {
        auth_limiter: getLatencySnapshot(durableObjectLatency.auth_limiter),
        session_revocation: getLatencySnapshot(durableObjectLatency.session_revocation),
        ai_chat_quota: getLatencySnapshot(durableObjectLatency.ai_chat_quota),
      };
      const topSlowOperations = Object.entries(routes)
        .map(([operation, snapshot]) => ({
          operation,
          ...snapshot,
          slow_score: Number((snapshot.avg_ms * 0.7 + snapshot.max_ms * 0.3).toFixed(2)),
        }))
        .sort((a, b) => b.slow_score - a.slow_score || b.count - a.count)
        .slice(0, deps.exportTopSlowOperationLimit);
      const durableObjectSamples = Object.values(durableObjects).filter((snapshot) => snapshot.count > 0);
      const durableObjectGlobalAvg =
        durableObjectSamples.length > 0
          ? durableObjectSamples.reduce((sum, snapshot) => sum + snapshot.avg_ms, 0) / durableObjectSamples.length
          : 0;
      const durableObjectLatencyOutliers: DurableObjectOutlierSignal[] = (
        Object.entries(durableObjects) as Array<[DurableObjectLatencyDimension, LatencySnapshot]>
      )
        .map(([dimension, snapshot]) => {
          const selfRatioAvg = snapshot.avg_ms > 0 ? snapshot.max_ms / snapshot.avg_ms : 0;
          const selfRatioLast = snapshot.avg_ms > 0 ? snapshot.last_ms / snapshot.avg_ms : 0;
          const globalRatio = durableObjectGlobalAvg > 0 ? snapshot.avg_ms / durableObjectGlobalAvg : 0;
          const outlierScore = Number(Math.max(selfRatioAvg, selfRatioLast, globalRatio).toFixed(2));
          return {
            dimension,
            ...snapshot,
            outlier_score: outlierScore,
            is_outlier:
              snapshot.count >= deps.doOutlierMinSamples && outlierScore >= deps.doOutlierScoreThreshold,
          };
        })
        .sort((a, b) => b.outlier_score - a.outlier_score);

      return {
        routes,
        durable_objects: durableObjects,
        export_snapshot: {
          generated_at: new Date().toISOString(),
          top_slow_operations: topSlowOperations,
          durable_object_latency_outliers: durableObjectLatencyOutliers,
        },
      };
    },
  };
}
