import { parsePositiveInt } from '../common/validation.js';
import { parseBoolean } from './worker-security.js';

export interface McpBoundaryGuardEnv {
  MCP_BOUNDARY_GUARDS_ENABLED?: string;
  MCP_BOUNDARY_RATE_LIMIT_MAX?: string;
  MCP_BOUNDARY_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_BOUNDARY_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_BOUNDARY_HEAVY_PAYLOAD_BYTES?: string;
  MCP_BOUNDARY_MAX_PAYLOAD_BYTES?: string;
  MCP_BOUNDARY_REPLAY_WINDOW_SECONDS?: string;
}

export interface McpBoundaryGuardConfig {
  enabled: boolean;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
  heavyPayloadBytes: number;
  maxPayloadBytes: number;
  replayWindowMs: number;
}

const DEFAULT_BOUNDARY_RATE_LIMIT_MAX = 90;
const DEFAULT_BOUNDARY_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_BOUNDARY_RATE_LIMIT_BLOCK_SECONDS = 120;
const DEFAULT_BOUNDARY_HEAVY_PAYLOAD_BYTES = 64 * 1024;
const DEFAULT_BOUNDARY_MAX_PAYLOAD_BYTES = 256 * 1024;
const DEFAULT_BOUNDARY_REPLAY_WINDOW_SECONDS = 120;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getIdempotencyToken(request: Request): string | null {
  const keys = ['mcp-request-id', 'idempotency-key', 'x-request-id'];
  for (const key of keys) {
    const value = request.headers.get(key)?.trim();
    if (value) return value;
  }
  return null;
}

export function getRequestContentLength(request: Request): number | null {
  const header = request.headers.get('content-length');
  if (!header) return null;
  const parsed = Number.parseInt(header, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function getMcpBoundaryGuardConfig(env: McpBoundaryGuardEnv): McpBoundaryGuardConfig {
  return {
    enabled: parseBoolean(env.MCP_BOUNDARY_GUARDS_ENABLED, true),
    maxAttempts: parsePositiveInt(env.MCP_BOUNDARY_RATE_LIMIT_MAX, DEFAULT_BOUNDARY_RATE_LIMIT_MAX),
    windowMs:
      parsePositiveInt(
        env.MCP_BOUNDARY_RATE_LIMIT_WINDOW_SECONDS,
        DEFAULT_BOUNDARY_RATE_LIMIT_WINDOW_SECONDS,
      ) * 1000,
    blockMs:
      parsePositiveInt(
        env.MCP_BOUNDARY_RATE_LIMIT_BLOCK_SECONDS,
        DEFAULT_BOUNDARY_RATE_LIMIT_BLOCK_SECONDS,
      ) * 1000,
    heavyPayloadBytes: parsePositiveInt(
      env.MCP_BOUNDARY_HEAVY_PAYLOAD_BYTES,
      DEFAULT_BOUNDARY_HEAVY_PAYLOAD_BYTES,
    ),
    maxPayloadBytes: parsePositiveInt(env.MCP_BOUNDARY_MAX_PAYLOAD_BYTES, DEFAULT_BOUNDARY_MAX_PAYLOAD_BYTES),
    replayWindowMs:
      parsePositiveInt(
        env.MCP_BOUNDARY_REPLAY_WINDOW_SECONDS,
        DEFAULT_BOUNDARY_REPLAY_WINDOW_SECONDS,
      ) * 1000,
  };
}

export function deriveAdaptiveBoundaryRateLimit(
  request: Request,
  cfg: Pick<McpBoundaryGuardConfig, 'maxAttempts' | 'heavyPayloadBytes'>,
  contentLength: number | null,
): number {
  let maxAttempts = cfg.maxAttempts;
  if (request.method === 'GET') {
    maxAttempts = Math.max(10, maxAttempts * 2);
  }
  if (request.method === 'DELETE') {
    maxAttempts = Math.max(5, Math.floor(maxAttempts * 0.75));
  }
  if (contentLength !== null && contentLength > cfg.heavyPayloadBytes) {
    maxAttempts = Math.max(3, Math.floor(maxAttempts * 0.5));
  }
  return maxAttempts;
}

export async function buildMcpReplayFingerprint(
  request: Request,
  contentLength: number | null,
  heavyPayloadBytes: number,
): Promise<string | null> {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return null;
  }

  const sessionId = request.headers.get('mcp-session-id')?.trim() || '-';
  const idempotencyToken = getIdempotencyToken(request);
  if (idempotencyToken) {
    return `${request.method}|${sessionId}|id:${idempotencyToken}`;
  }

  if (request.method !== 'POST') {
    return null;
  }
  if (contentLength !== null && contentLength > heavyPayloadBytes) {
    return null;
  }
  const contentType = request.headers.get('content-type')?.toLowerCase() || '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    const payload = (await request.clone().json()) as unknown;
    if (!isPlainObject(payload)) {
      return null;
    }
    const method = typeof payload.method === 'string' ? payload.method : '';
    const id = payload.id;
    if (!method || (typeof id !== 'string' && typeof id !== 'number')) {
      return null;
    }
    return `${request.method}|${sessionId}|rpc:${method}|id:${String(id)}`;
  } catch {
    return null;
  }
}
