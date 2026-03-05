export interface WorkerMcpSessionTopologyEnv {
  MCP_SESSION_SHARD_COUNT?: string;
  MCP_SESSION_IDLE_TTL_SECONDS?: string;
  MCP_SESSION_ABSOLUTE_TTL_SECONDS?: string;
  MCP_SESSION_EVICTION_SWEEP_LIMIT?: string;
}

export interface WorkerMcpSessionTopologyV2 {
  version: 'v2';
  shardCount: number;
  idleTtlMs: number;
  absoluteTtlMs: number;
  evictionSweepLimit: number;
}

export interface WorkerMcpSessionPlacementHint {
  shard: number;
  shardName: string;
  placementSignal: string;
}

const DEFAULT_SESSION_SHARD_COUNT = 16;
const DEFAULT_SESSION_IDLE_TTL_SECONDS = 30 * 60;
const DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_SESSION_EVICTION_SWEEP_LIMIT = 64;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function hashSessionId(sessionId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < sessionId.length; i += 1) {
    hash ^= sessionId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveWorkerMcpSessionTopologyV2(
  env: WorkerMcpSessionTopologyEnv,
): WorkerMcpSessionTopologyV2 {
  return {
    version: 'v2',
    shardCount: Math.max(1, parsePositiveInt(env.MCP_SESSION_SHARD_COUNT, DEFAULT_SESSION_SHARD_COUNT)),
    idleTtlMs:
      Math.max(1, parsePositiveInt(env.MCP_SESSION_IDLE_TTL_SECONDS, DEFAULT_SESSION_IDLE_TTL_SECONDS)) *
      1000,
    absoluteTtlMs: Math.max(
      1,
      parsePositiveInt(env.MCP_SESSION_ABSOLUTE_TTL_SECONDS, DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS),
    ) * 1000,
    evictionSweepLimit: Math.max(
      1,
      parsePositiveInt(env.MCP_SESSION_EVICTION_SWEEP_LIMIT, DEFAULT_SESSION_EVICTION_SWEEP_LIMIT),
    ),
  };
}

export function computeWorkerMcpSessionShard(
  sessionId: string,
  topology: Pick<WorkerMcpSessionTopologyV2, 'shardCount'>,
): number {
  return hashSessionId(sessionId) % Math.max(1, topology.shardCount);
}

export function getWorkerMcpSessionShardName(
  sessionId: string,
  topology: Pick<WorkerMcpSessionTopologyV2, 'shardCount'>,
): string {
  const shard = computeWorkerMcpSessionShard(sessionId, topology);
  return `mcp-session-v2:shard:${shard}`;
}

export function getWorkerMcpSessionPlacementHint(
  sessionId: string,
  topology: Pick<WorkerMcpSessionTopologyV2, 'shardCount'>,
): WorkerMcpSessionPlacementHint {
  const shard = computeWorkerMcpSessionShard(sessionId, topology);
  return {
    shard,
    shardName: `mcp-session-v2:shard:${shard}`,
    placementSignal: `do-shard:${shard}`,
  };
}
