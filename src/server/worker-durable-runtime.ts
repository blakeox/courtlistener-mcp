import {
  DEFAULT_AUTH_FAILURE_BLOCK_SECONDS,
  DEFAULT_AUTH_FAILURE_LIMIT_MAX,
  DEFAULT_AUTH_FAILURE_STATE,
  DEFAULT_AUTH_FAILURE_WINDOW_SECONDS,
  DEFAULT_UI_AI_CHAT_RATE_LIMIT_MAX,
} from './worker-runtime-contract.js';
import type {
  AuthFailureLimiterRequestBody,
  AuthFailureLimiterResponseBody,
  AuthFailureState,
  DurableObjectLatencyDimension,
  LifetimeQuotaRequestBody,
  LifetimeQuotaResponseBody,
  McpSessionEvictionReason,
  McpSessionLifecycleAction,
  McpSessionLifecycleRequestBody,
  McpSessionLifecycleResponseBody,
  McpSessionLifecycleState,
  SessionRevocationRequestBody,
  SessionRevocationResponseBody,
  UsageCounterRequestBody,
  UsageCounterResponseBody,
} from './worker-runtime-contract.js';
import {
  getWorkerMcpSessionPlacementHint,
  type WorkerMcpSessionTopologyV2,
} from './worker-mcp-session-topology.js';
import {
  finalizeSessionLifecycleResponse as finalizeBoundarySessionLifecycleResponse,
  validateSessionLifecycleRequest as validateBoundarySessionLifecycleRequest,
} from './mcp-transport-runtime-facade.js';
import {
  buildMcpReplayFingerprint,
  deriveAdaptiveBoundaryRateLimit,
  getMcpBoundaryGuardConfig,
  getRequestContentLength,
} from './mcp-boundary-abuse-guard.js';
import { parsePositiveInt } from '../common/validation.js';
import { parseBoolean } from './worker-security.js';

interface WorkerDurableRuntimeEnv {
  AUTH_FAILURE_LIMITER: DurableObjectNamespace;
  MCP_UI_SESSION_REVOCATION_ENABLED?: string;
  MCP_SESSION_SHARD_COUNT?: string;
  MCP_SESSION_IDLE_TTL_SECONDS?: string;
  MCP_SESSION_ABSOLUTE_TTL_SECONDS?: string;
  MCP_SESSION_EVICTION_SWEEP_LIMIT?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_MAX?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_BOUNDARY_GUARDS_ENABLED?: string;
  MCP_BOUNDARY_RATE_LIMIT_MAX?: string;
  MCP_BOUNDARY_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_BOUNDARY_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_BOUNDARY_HEAVY_PAYLOAD_BYTES?: string;
  MCP_BOUNDARY_MAX_PAYLOAD_BYTES?: string;
  MCP_BOUNDARY_REPLAY_WINDOW_SECONDS?: string;
  MCP_UI_RATE_LIMIT_ENABLED?: string;
  MCP_UI_AI_CHAT_RATE_LIMIT_MAX?: string;
}

export interface CreateWorkerDurableRuntimeDeps<TEnv extends WorkerDurableRuntimeEnv> {
  now: () => number;
  recordDurableObjectLatency: (dimension: DurableObjectLatencyDimension, elapsedMs: number) => void;
  getCachedSessionTopology: (env: TEnv) => WorkerMcpSessionTopologyV2;
  jsonError: (
    message: string,
    status: number,
    errorCode: string,
    extra?: Record<string, unknown>,
    extraHeaders?: HeadersInit,
  ) => Response;
}

export interface WorkerDurableRuntime<TEnv extends WorkerDurableRuntimeEnv> {
  isUiSessionRevoked: (env: TEnv, sessionJti: string) => Promise<boolean>;
  revokeUiSession: (env: TEnv, sessionJti: string, expiresAtEpochSeconds: number) => Promise<void>;
  recordSessionBootstrapRateLimit: (
    env: TEnv,
    clientId: string,
    nowMs: number,
    config: { maxAttempts: number; windowMs: number; blockMs: number },
  ) => Promise<AuthFailureLimiterResponseBody | null>;
  getUserUsageSnapshot: (env: TEnv, userId: string) => Promise<UsageCounterResponseBody | null>;
  incrementUserUsage: (
    env: TEnv,
    userId: string,
    metadata?: { route?: string; method?: string },
  ) => Promise<void>;
  validateSessionRequest: (request: Request, env: TEnv, nowMs: number) => Promise<Response | null>;
  finalizeSessionResponse: (
    request: Request,
    response: Response,
    env: TEnv,
    nowMs: number,
  ) => Promise<void>;
  getAuthRateLimitedResponse: (
    clientId: string,
    env: TEnv,
    nowMs: number,
  ) => Promise<Response | null>;
  recordAuthFailure: (clientId: string, env: TEnv, nowMs: number) => Promise<void>;
  clearAuthFailures: (clientId: string, env: TEnv, nowMs: number) => Promise<void>;
  evaluateMcpBoundaryRequest: (
    request: Request,
    env: TEnv,
    clientId: string,
    nowMs: number,
  ) => Promise<Response | null>;
  applyAiChatLifetimeQuota: (env: TEnv, userId: string) => Promise<Response | null>;
}

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function hashBoundaryReplayFingerprint(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function isUiSessionRevocationEnabled<TEnv extends WorkerDurableRuntimeEnv>(env: TEnv): boolean {
  return env.MCP_UI_SESSION_REVOCATION_ENABLED
    ? parseBoolean(env.MCP_UI_SESSION_REVOCATION_ENABLED)
    : true;
}

function getSessionRevocationStub<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  sessionJti: string,
): DurableObjectStub {
  const objectId = env.AUTH_FAILURE_LIMITER.idFromName(`ui-session:${sessionJti}`);
  return env.AUTH_FAILURE_LIMITER.get(objectId);
}

function getUsageStub<TEnv extends WorkerDurableRuntimeEnv>(env: TEnv, userId: string): DurableObjectStub {
  const objectId = env.AUTH_FAILURE_LIMITER.idFromName(`usage:user:${userId}`);
  return env.AUTH_FAILURE_LIMITER.get(objectId);
}

function getAuthFailureRateLimitConfig<TEnv extends WorkerDurableRuntimeEnv>(env: TEnv): {
  enabled: boolean;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
} {
  return {
    enabled: env.MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED
      ? parseBoolean(env.MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED)
      : true,
    maxAttempts: parsePositiveInt(env.MCP_AUTH_FAILURE_RATE_LIMIT_MAX, DEFAULT_AUTH_FAILURE_LIMIT_MAX),
    windowMs:
      parsePositiveInt(
        env.MCP_AUTH_FAILURE_RATE_LIMIT_WINDOW_SECONDS,
        DEFAULT_AUTH_FAILURE_WINDOW_SECONDS,
      ) * 1000,
    blockMs:
      parsePositiveInt(
        env.MCP_AUTH_FAILURE_RATE_LIMIT_BLOCK_SECONDS,
        DEFAULT_AUTH_FAILURE_BLOCK_SECONDS,
      ) * 1000,
  };
}

function getAuthLimiterStub<TEnv extends WorkerDurableRuntimeEnv>(env: TEnv, clientId: string): DurableObjectStub {
  const objectId = env.AUTH_FAILURE_LIMITER.idFromName(`auth-fail:${clientId}`);
  return env.AUTH_FAILURE_LIMITER.get(objectId);
}

function getMcpSessionLifecycleStub<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  sessionId: string,
  topology: WorkerMcpSessionTopologyV2,
): DurableObjectStub {
  const placement = getWorkerMcpSessionPlacementHint(sessionId, topology);
  const objectId = env.AUTH_FAILURE_LIMITER.idFromName(placement.shardName);
  return env.AUTH_FAILURE_LIMITER.get(objectId);
}

async function callSessionRevocation<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  sessionJti: string,
  body: SessionRevocationRequestBody,
  deps: Pick<CreateWorkerDurableRuntimeDeps<TEnv>, 'now' | 'recordDurableObjectLatency'>,
): Promise<SessionRevocationResponseBody | null> {
  const stub = getSessionRevocationStub(env, sessionJti);
  const startedAt = deps.now();
  try {
    const response = await stub.fetch('https://auth-failure-limiter/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as SessionRevocationResponseBody;
  } finally {
    deps.recordDurableObjectLatency('session_revocation', deps.now() - startedAt);
  }
}

async function callAuthLimiter<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  clientId: string,
  action: AuthFailureLimiterRequestBody['action'],
  nowMs: number,
  deps: Pick<CreateWorkerDurableRuntimeDeps<TEnv>, 'now' | 'recordDurableObjectLatency'>,
  limits?: { maxAttempts: number; windowMs: number; blockMs: number },
): Promise<AuthFailureLimiterResponseBody | null> {
  const cfg = limits ?? (() => {
    const authCfg = getAuthFailureRateLimitConfig(env);
    return {
      maxAttempts: authCfg.maxAttempts,
      windowMs: authCfg.windowMs,
      blockMs: authCfg.blockMs,
    };
  })();
  const stub = getAuthLimiterStub(env, clientId);
  const startedAt = deps.now();
  try {
    const response = await stub.fetch('https://auth-failure-limiter/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action,
        nowMs,
        maxAttempts: cfg.maxAttempts,
        windowMs: cfg.windowMs,
        blockMs: cfg.blockMs,
      } satisfies AuthFailureLimiterRequestBody),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as AuthFailureLimiterResponseBody;
  } finally {
    deps.recordDurableObjectLatency('auth_limiter', deps.now() - startedAt);
  }
}

async function callMcpSessionLifecycle<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  sessionId: string,
  action: McpSessionLifecycleAction,
  nowMs: number,
  deps: Pick<CreateWorkerDurableRuntimeDeps<TEnv>, 'getCachedSessionTopology'>,
): Promise<McpSessionLifecycleResponseBody | null> {
  const topology = deps.getCachedSessionTopology(env);
  const placement = getWorkerMcpSessionPlacementHint(sessionId, topology);
  const stub = getMcpSessionLifecycleStub(env, sessionId, topology);
  const response = await stub.fetch('https://auth-failure-limiter/internal', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mcp-session-shard': String(placement.shard),
      'x-mcp-placement-signal': placement.placementSignal,
    },
    body: JSON.stringify({
      action,
      sessionId,
      nowMs,
      idleTtlMs: topology.idleTtlMs,
      absoluteTtlMs: topology.absoluteTtlMs,
      evictionSweepLimit: topology.evictionSweepLimit,
      shardHint: placement.placementSignal,
    } satisfies McpSessionLifecycleRequestBody),
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as McpSessionLifecycleResponseBody;
}

export function createWorkerDurableRuntime<TEnv extends WorkerDurableRuntimeEnv>(
  deps: CreateWorkerDurableRuntimeDeps<TEnv>,
): WorkerDurableRuntime<TEnv> {
  return {
    async isUiSessionRevoked(env, sessionJti) {
      if (!isUiSessionRevocationEnabled(env)) return false;
      const result = await callSessionRevocation(
        env,
        sessionJti,
        {
          action: 'session_check',
          nowMs: deps.now(),
        },
        deps,
      );
      return Boolean(result && 'revoked' in result && result.revoked === true);
    },

    async revokeUiSession(env, sessionJti, expiresAtEpochSeconds) {
      if (!isUiSessionRevocationEnabled(env)) return;
      const nowMs = deps.now();
      const revokeUntilMs = Math.max(nowMs, expiresAtEpochSeconds * 1000);
      await callSessionRevocation(
        env,
        sessionJti,
        {
          action: 'session_revoke',
          nowMs,
          revokeUntilMs,
        },
        deps,
      );
    },

    async getUserUsageSnapshot(env, userId) {
      const stub = getUsageStub(env, userId);
      const response = await stub.fetch('https://auth-failure-limiter/internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'usage_get',
          nowMs: deps.now(),
        } satisfies UsageCounterRequestBody),
      });
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as UsageCounterResponseBody;
      return { ...payload, userId };
    },

    async recordSessionBootstrapRateLimit(env, clientId, nowMs, config) {
      return callAuthLimiter(
        env,
        `session-bootstrap:${clientId}`,
        'record',
        nowMs,
        deps,
        config,
      );
    },

    async incrementUserUsage(env, userId, metadata = {}) {
      const stub = getUsageStub(env, userId);
      await stub.fetch('https://auth-failure-limiter/internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'usage_increment',
          nowMs: deps.now(),
          ...(metadata.route ? { route: metadata.route } : {}),
          ...(metadata.method ? { method: metadata.method } : {}),
        } satisfies UsageCounterRequestBody),
      });
    },

    async validateSessionRequest(request, env, nowMs) {
      return validateBoundarySessionLifecycleRequest(
        request,
        env,
        nowMs,
        async (sessionId) => {
          const result = await callMcpSessionLifecycle(env, sessionId, 'mcp_session_touch', nowMs, deps);
          if (!result) {
            return null;
          }
          return result.active;
        },
        { methods: ['POST', 'DELETE'] },
      );
    },

    async finalizeSessionResponse(request, response, env, nowMs) {
      await finalizeBoundarySessionLifecycleResponse(request, response, env, nowMs, {
        registerSession: async (sessionId) => {
          await callMcpSessionLifecycle(env, sessionId, 'mcp_session_register', nowMs, deps);
        },
        closeSession: async (sessionId) => {
          await callMcpSessionLifecycle(env, sessionId, 'mcp_session_close', nowMs, deps);
        },
      });
    },

    async getAuthRateLimitedResponse(clientId, env, nowMs) {
      const cfg = getAuthFailureRateLimitConfig(env);
      if (!cfg.enabled) return null;
      const limiterState = await callAuthLimiter(env, clientId, 'check', nowMs, deps);
      if (!limiterState?.blocked) return null;

      const retryAfterSeconds = limiterState.retryAfterSeconds;
      return deps.jsonError(
        'Too many failed authentication attempts',
        429,
        'auth_rate_limited',
        { retry_after_seconds: retryAfterSeconds },
        { 'Retry-After': String(retryAfterSeconds) },
      );
    },

    async recordAuthFailure(clientId, env, nowMs) {
      const cfg = getAuthFailureRateLimitConfig(env);
      if (!cfg.enabled) return;
      await callAuthLimiter(env, clientId, 'record', nowMs, deps);
    },

    async clearAuthFailures(clientId, env, nowMs) {
      const cfg = getAuthFailureRateLimitConfig(env);
      if (!cfg.enabled) return;
      await callAuthLimiter(env, clientId, 'clear', nowMs, deps);
    },

    async evaluateMcpBoundaryRequest(request, env, clientId, nowMs) {
      const cfg = getMcpBoundaryGuardConfig(env);
      if (!cfg.enabled) {
        return null;
      }

      const contentLength = getRequestContentLength(request);
      if (contentLength !== null && contentLength > cfg.maxPayloadBytes) {
        return deps.jsonError('MCP payload too large.', 413, 'payload_too_large', {
          max_payload_bytes: cfg.maxPayloadBytes,
        });
      }

      const adaptiveMaxAttempts = deriveAdaptiveBoundaryRateLimit(request, cfg, contentLength);
      const boundaryRateLimit = await callAuthLimiter(
        env,
        `mcp-boundary:${clientId}`,
        'record',
        nowMs,
        deps,
        {
          maxAttempts: adaptiveMaxAttempts,
          windowMs: cfg.windowMs,
          blockMs: cfg.blockMs,
        },
      );
      if (boundaryRateLimit?.blocked) {
        const retryAfterSeconds = boundaryRateLimit.retryAfterSeconds;
        return deps.jsonError(
          'MCP boundary rate limit exceeded.',
          429,
          'mcp_rate_limited',
          { retry_after_seconds: retryAfterSeconds },
          { 'Retry-After': String(retryAfterSeconds) },
        );
      }

      const replayFingerprint = await buildMcpReplayFingerprint(request, contentLength, cfg.heavyPayloadBytes);
      if (!replayFingerprint) {
        return null;
      }

      const replayState = await callAuthLimiter(
        env,
        `mcp-replay:${clientId}:${hashBoundaryReplayFingerprint(replayFingerprint)}`,
        'record',
        nowMs,
        deps,
        {
          maxAttempts: 2,
          windowMs: cfg.replayWindowMs,
          blockMs: cfg.replayWindowMs,
        },
      );
      if (replayState?.blocked) {
        return deps.jsonError('Replay request detected at MCP boundary.', 409, 'mcp_replay_detected');
      }

      return null;
    },

    async applyAiChatLifetimeQuota(env, userId) {
      const enabled = env.MCP_UI_RATE_LIMIT_ENABLED
        ? parseBoolean(env.MCP_UI_RATE_LIMIT_ENABLED)
        : true;
      if (!enabled) return null;

      const maxAllowed = parsePositiveInt(
        env.MCP_UI_AI_CHAT_RATE_LIMIT_MAX,
        DEFAULT_UI_AI_CHAT_RATE_LIMIT_MAX,
      );
      const objectId = env.AUTH_FAILURE_LIMITER.idFromName(`ui-ai-chat-quota:user:${userId}`);
      const stub = env.AUTH_FAILURE_LIMITER.get(objectId);
      const startedAt = deps.now();
      let response: Response;
      try {
        response = await stub.fetch('https://auth-failure-limiter/internal', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'quota_increment_check',
            maxAllowed,
          } satisfies LifetimeQuotaRequestBody),
        });
      } finally {
        deps.recordDurableObjectLatency('ai_chat_quota', deps.now() - startedAt);
      }

      if (!response.ok) {
        return deps.jsonError('Unable to validate hosted AI chat quota.', 503, 'ai_chat_quota_unavailable');
      }

      const quota = (await response.json()) as LifetimeQuotaResponseBody;
      if (!quota.blocked) return null;

      return deps.jsonError(
        `Hosted AI chat lifetime limit reached (${quota.limit} turns). Please connect your own local model directly to /mcp for continued chat.`,
        429,
        'ai_chat_limit_reached',
      );
    },
  };
}

export class AuthFailureLimiterDO {
  constructor(private readonly state: DurableObjectState) {}

  private async loadState(): Promise<AuthFailureState> {
    const stored = await this.state.storage.get<AuthFailureState>('auth_failure_state');
    if (!stored) return { ...DEFAULT_AUTH_FAILURE_STATE };
    return {
      count: typeof stored.count === 'number' ? stored.count : 0,
      windowStartedAtMs:
        typeof stored.windowStartedAtMs === 'number' ? stored.windowStartedAtMs : 0,
      blockedUntilMs: typeof stored.blockedUntilMs === 'number' ? stored.blockedUntilMs : 0,
    };
  }

  private async saveState(nextState: AuthFailureState): Promise<void> {
    await this.state.storage.put('auth_failure_state', nextState);
  }

  private async clearState(): Promise<void> {
    await this.state.storage.delete('auth_failure_state');
  }

  private getMcpSessionStorageKey(sessionId: string): string {
    return `mcp_session:${sessionId}`;
  }

  private async loadMcpSessionState(sessionId: string): Promise<McpSessionLifecycleState | null> {
    const stored = await this.state.storage.get<McpSessionLifecycleState>(
      this.getMcpSessionStorageKey(sessionId),
    );
    if (!stored || stored.sessionId !== sessionId) {
      return null;
    }
    return stored;
  }

  private resolveMcpSessionState(
    entry: McpSessionLifecycleState | null,
    nowMs: number,
  ): { active: boolean; reason: McpSessionEvictionReason } {
    if (!entry) {
      return { active: false, reason: 'missing' };
    }
    if (entry.absoluteExpiresAtMs <= nowMs) {
      return { active: false, reason: 'absolute_evicted' };
    }
    if (entry.idleExpiresAtMs <= nowMs) {
      return { active: false, reason: 'idle_evicted' };
    }
    return { active: true, reason: 'active' };
  }

  private async evictExpiredMcpSessions(nowMs: number, sweepLimit: number): Promise<void> {
    const entries = await this.state.storage.list<McpSessionLifecycleState>({
      prefix: 'mcp_session:',
      limit: Math.max(1, sweepLimit),
    });
    const deleteKeys: string[] = [];
    for (const [key, value] of entries.entries()) {
      const sessionState = value as McpSessionLifecycleState;
      if (
        !sessionState ||
        typeof sessionState.absoluteExpiresAtMs !== 'number' ||
        typeof sessionState.idleExpiresAtMs !== 'number'
      ) {
        deleteKeys.push(key);
        continue;
      }
      if (sessionState.absoluteExpiresAtMs <= nowMs || sessionState.idleExpiresAtMs <= nowMs) {
        deleteKeys.push(key);
      }
    }
    if (deleteKeys.length > 0) {
      await Promise.all(deleteKeys.map((key) => this.state.storage.delete(key)));
    }
  }

  private async scheduleMcpSessionAlarm(nextAtMs: number): Promise<void> {
    const scheduledAt = (await this.state.storage.get<number>('mcp_session_alarm_at_ms')) ?? 0;
    if (scheduledAt > 0 && scheduledAt <= nextAtMs) {
      return;
    }
    await this.state.storage.put('mcp_session_alarm_at_ms', nextAtMs);
    await this.state.storage.setAlarm(nextAtMs);
  }

  private async refreshMcpSessionAlarm(): Promise<void> {
    const entries = await this.state.storage.list<McpSessionLifecycleState>({
      prefix: 'mcp_session:',
      limit: 256,
    });
    let nextAtMs = Number.POSITIVE_INFINITY;
    for (const value of entries.values()) {
      const state = value as McpSessionLifecycleState;
      if (!state) continue;
      const candidate = Math.min(state.idleExpiresAtMs, state.absoluteExpiresAtMs);
      if (candidate < nextAtMs) {
        nextAtMs = candidate;
      }
    }

    if (!Number.isFinite(nextAtMs)) {
      await this.state.storage.delete('mcp_session_alarm_at_ms');
      await this.state.storage.deleteAlarm();
      return;
    }

    await this.state.storage.put('mcp_session_alarm_at_ms', nextAtMs);
    await this.state.storage.setAlarm(nextAtMs);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    const body = await parseJsonBody<
      | AuthFailureLimiterRequestBody
      | SessionRevocationRequestBody
      | UsageCounterRequestBody
      | LifetimeQuotaRequestBody
      | McpSessionLifecycleRequestBody
    >(request);
    if (!body) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }

    if (
      body.action === 'mcp_session_register' ||
      body.action === 'mcp_session_touch' ||
      body.action === 'mcp_session_close'
    ) {
      const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : Date.now();
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
      const idleTtlMs = Math.max(1_000, Number.isFinite(body.idleTtlMs) ? body.idleTtlMs : 30 * 60 * 1000);
      const absoluteTtlMs = Math.max(
        idleTtlMs,
        Number.isFinite(body.absoluteTtlMs) ? body.absoluteTtlMs : 24 * 60 * 60 * 1000,
      );
      const sweepLimit = Math.max(
        1,
        Number.isFinite(body.evictionSweepLimit) ? Math.floor(body.evictionSweepLimit) : 64,
      );

      if (!sessionId) {
        return Response.json({ error: 'invalid_session_id' }, { status: 400 });
      }

      await this.evictExpiredMcpSessions(nowMs, sweepLimit);
      const storageKey = this.getMcpSessionStorageKey(sessionId);
      const existing = await this.loadMcpSessionState(sessionId);

      if (body.action === 'mcp_session_close') {
        await this.state.storage.delete(storageKey);
        await this.refreshMcpSessionAlarm();
        return Response.json({
          active: false,
          reason: 'closed',
          sessionId,
          shard: this.state.id.toString(),
        } satisfies McpSessionLifecycleResponseBody);
      }

      const resolved = this.resolveMcpSessionState(existing, nowMs);
      if (!resolved.active && body.action === 'mcp_session_touch') {
        await this.state.storage.delete(storageKey);
        await this.refreshMcpSessionAlarm();
        return Response.json({
          active: false,
          reason: resolved.reason,
          sessionId,
          shard: this.state.id.toString(),
        } satisfies McpSessionLifecycleResponseBody);
      }

      const createdAtMs = existing?.createdAtMs ?? nowMs;
      const nextState: McpSessionLifecycleState = {
        sessionId,
        createdAtMs,
        lastSeenAtMs: nowMs,
        idleExpiresAtMs: nowMs + idleTtlMs,
        absoluteExpiresAtMs: createdAtMs + absoluteTtlMs,
      };
      await this.state.storage.put(storageKey, nextState);
      await this.scheduleMcpSessionAlarm(
        Math.min(nextState.idleExpiresAtMs, nextState.absoluteExpiresAtMs),
      );

      return Response.json({
        active: true,
        reason: 'active',
        sessionId,
        shard: this.state.id.toString(),
      } satisfies McpSessionLifecycleResponseBody);
    }

    if (body.action === 'session_check' || body.action === 'session_revoke') {
      const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : Date.now();
      const key = 'ui_session_revoked_until_ms';
      const revokedUntilMs = (await this.state.storage.get<number>(key)) ?? 0;

      if (body.action === 'session_revoke') {
        const requestedUntil =
          typeof body.revokeUntilMs === 'number' && Number.isFinite(body.revokeUntilMs)
            ? body.revokeUntilMs
            : nowMs;
        const nextUntil = Math.max(revokedUntilMs, requestedUntil, nowMs);
        await this.state.storage.put(key, nextUntil);
        return Response.json({ revoked: true } satisfies SessionRevocationResponseBody);
      }

      if (revokedUntilMs <= nowMs) {
        if (revokedUntilMs > 0) {
          await this.state.storage.delete(key);
        }
        return Response.json({ revoked: false } satisfies SessionRevocationResponseBody);
      }

      return Response.json({ revoked: true } satisfies SessionRevocationResponseBody);
    }

    if (body.action === 'usage_increment' || body.action === 'usage_get') {
      const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : Date.now();
      const nowDate = new Date(nowMs).toISOString().slice(0, 10);
      const totalKey = 'usage_total_requests';
      const dayDateKey = 'usage_today_date';
      const dayCountKey = 'usage_today_count';
      const lastSeenKey = 'usage_last_seen_at_ms';
      const byRouteKey = 'usage_by_route';

      let totalRequests = (await this.state.storage.get<number>(totalKey)) ?? 0;
      const storedDayDate = (await this.state.storage.get<string>(dayDateKey)) ?? nowDate;
      let todayRequests = (await this.state.storage.get<number>(dayCountKey)) ?? 0;
      let byRoute = ((await this.state.storage.get<Record<string, number>>(byRouteKey)) ?? {}) as Record<
        string,
        number
      >;

      const activeDayDate = storedDayDate === nowDate ? storedDayDate : nowDate;
      if (storedDayDate !== nowDate) {
        todayRequests = 0;
      }

      if (body.action === 'usage_increment') {
        totalRequests += 1;
        todayRequests += 1;
        const route = typeof body.route === 'string' && body.route.trim().length > 0 ? body.route.trim() : '/mcp';
        byRoute = {
          ...byRoute,
          [route]: (byRoute[route] ?? 0) + 1,
        };

        await this.state.storage.put(totalKey, totalRequests);
        await this.state.storage.put(dayDateKey, activeDayDate);
        await this.state.storage.put(dayCountKey, todayRequests);
        await this.state.storage.put(lastSeenKey, nowMs);
        await this.state.storage.put(byRouteKey, byRoute);
      }

      const lastSeenAtMs = (await this.state.storage.get<number>(lastSeenKey)) ?? null;
      return Response.json({
        userId: '',
        totalRequests,
        todayRequests,
        todayDate: activeDayDate,
        lastSeenAtMs,
        byRoute,
      } satisfies UsageCounterResponseBody);
    }

    if (body.action === 'quota_increment_check') {
      const limit = Math.max(1, Math.floor(body.maxAllowed));
      const key = 'lifetime_quota_count';
      const existing = (await this.state.storage.get<number>(key)) ?? 0;

      if (existing >= limit) {
        return Response.json({
          blocked: true,
          used: existing,
          limit,
          remaining: 0,
        } satisfies LifetimeQuotaResponseBody);
      }

      const next = existing + 1;
      await this.state.storage.put(key, next);
      return Response.json({
        blocked: false,
        used: next,
        limit,
        remaining: Math.max(0, limit - next),
      } satisfies LifetimeQuotaResponseBody);
    }

    const authBody = body as AuthFailureLimiterRequestBody;
    const nowMs = Number.isFinite(authBody.nowMs) ? authBody.nowMs : Date.now();
    const maxAttempts = Math.max(1, authBody.maxAttempts);
    const windowMs = Math.max(1_000, authBody.windowMs);
    const blockMs = Math.max(1_000, authBody.blockMs);
    const action = authBody.action;

    if (action === 'clear') {
      await this.clearState();
      return Response.json({
        blocked: false,
        retryAfterSeconds: 0,
        state: { ...DEFAULT_AUTH_FAILURE_STATE },
      } satisfies AuthFailureLimiterResponseBody);
    }

    let current = await this.loadState();
    let stateChanged = false;
    if (nowMs - current.windowStartedAtMs >= windowMs) {
      current = {
        count: 0,
        windowStartedAtMs: nowMs,
        blockedUntilMs: 0,
      };
      stateChanged = true;
    }

    if (action === 'record') {
      const nextCount = current.count + 1;
      const shouldBlock = nextCount >= maxAttempts;
      current = {
        count: nextCount,
        windowStartedAtMs: current.windowStartedAtMs || nowMs,
        blockedUntilMs: shouldBlock ? nowMs + blockMs : current.blockedUntilMs,
      };
      await this.saveState(current);
      stateChanged = false;
    }

    const blocked = current.blockedUntilMs > nowMs;
    const retryAfterSeconds = blocked
      ? Math.max(1, Math.ceil((current.blockedUntilMs - nowMs) / 1000))
      : 0;

    if (action === 'check' && stateChanged) {
      await this.saveState(current);
    }

    return Response.json({
      blocked,
      retryAfterSeconds,
      state: current,
    } satisfies AuthFailureLimiterResponseBody);
  }

  async alarm(): Promise<void> {
    const nowMs = Date.now();
    await this.evictExpiredMcpSessions(nowMs, 256);
    await this.refreshMcpSessionAlarm();
  }
}
