interface SessionSnapshot {
  version: string;
  shardCount: number;
  idleTtlMs: number;
  absoluteTtlMs: number;
  evictionSweepLimit: number;
}

export interface WorkerHealthPayload {
  status: 'ok';
  service: 'courtlistener-mcp';
  transport: 'cloudflare-agents-streamable-http';
  metrics: {
    latency_ms: unknown;
  };
  session_topology: {
    version: string;
    shard_count: number;
    idle_ttl_ms: number;
    absolute_ttl_ms: number;
    eviction_sweep_limit: number;
  };
}

export function buildWorkerHealthPayload(
  sessionTopology: SessionSnapshot,
  latencySnapshot: unknown,
): WorkerHealthPayload {
  return {
    status: 'ok',
    service: 'courtlistener-mcp',
    transport: 'cloudflare-agents-streamable-http',
    metrics: {
      latency_ms: latencySnapshot,
    },
    session_topology: {
      version: sessionTopology.version,
      shard_count: sessionTopology.shardCount,
      idle_ttl_ms: sessionTopology.idleTtlMs,
      absolute_ttl_ms: sessionTopology.absoluteTtlMs,
      eviction_sweep_limit: sessionTopology.evictionSweepLimit,
    },
  };
}
