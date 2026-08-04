import {
  DEFAULT_AUTH_FAILURE_BLOCK_SECONDS,
  DEFAULT_AUTH_FAILURE_LIMIT_MAX,
  DEFAULT_AUTH_FAILURE_WINDOW_SECONDS,
  DEFAULT_UI_AI_CHAT_RATE_LIMIT_MAX,
} from './worker-runtime-contract.js';
import type {
  AuthFailureLimiterRequestBody,
  AuthFailureLimiterResponseBody,
  AuthRateLimitProbeResult,
  BrowserBootstrapConsumeRequestBody,
  BrowserBootstrapConsumeResponseBody,
  DurableObjectLatencyDimension,
  LifetimeQuotaRequestBody,
  LifetimeQuotaResponseBody,
  McpBoundaryEvaluateRequestBody,
  McpBoundaryEvaluateResponseBody,
  McpSessionLifecycleAction,
  McpSessionLifecycleRequestBody,
  McpSessionLifecycleResponseBody,
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
  type McpSessionMutationState,
  type McpSessionValidationState,
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

export interface WorkerDurableRuntimeEnv {
  AUTH_FAILURE_LIMITER: DurableObjectNamespace;
  MCP_UI_SESSION_REVOCATION_ENABLED?: string;
  MCP_SESSION_SHARD_COUNT?: string;
  MCP_SESSION_IDLE_TTL_SECONDS?: string;
  MCP_SESSION_ABSOLUTE_TTL_SECONDS?: string;
  MCP_SESSION_EVICTION_SWEEP_LIMIT?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN?: string;
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
  MCP_SESSION_LIFECYCLE_FAIL_OPEN?: string;
  MCP_BOUNDARY_FAIL_OPEN?: string;
  MCP_UI_RATE_LIMIT_ENABLED?: string;
  MCP_UI_AI_CHAT_RATE_LIMIT_MAX?: string;
}

type DurableObjectCheckResult<T> = { kind: 'ok'; value: T } | { kind: 'unavailable' };

export interface CreateWorkerDurableRuntimeDeps<TEnv extends WorkerDurableRuntimeEnv> {
  now: () => number;
  recordDurableObjectLatency: (dimension: DurableObjectLatencyDimension, elapsedMs: number) => void;
  recordDurableObjectUnavailable: (dimension: DurableObjectLatencyDimension) => void;
  getCachedSessionTopology: (env: TEnv) => WorkerMcpSessionTopologyV2;
  jsonError: (
    message: string,
    status: number,
    errorCode: string,
    extra?: Record<string, unknown>,
    extraHeaders?: HeadersInit,
  ) => Response;
}

function logDurableObjectFailure(
  durableObject: DurableObjectLatencyDimension,
  operation: string,
  failureKind: 'http_error' | 'fetch_error',
  status?: number,
): void {
  console.error(
    JSON.stringify({
      event: 'durable_object_unavailable',
      durable_object: durableObject,
      operation,
      failure_kind: failureKind,
      ...(typeof status === 'number' ? { status } : {}),
    }),
  );
}

export interface WorkerDurableRuntime<TEnv extends WorkerDurableRuntimeEnv> {
  isUiSessionRevoked: (env: TEnv, sessionJti: string) => Promise<DurableObjectCheckResult<boolean>>;
  revokeUiSession: (env: TEnv, sessionJti: string, expiresAtEpochSeconds: number) => Promise<void>;
  recordSessionBootstrapRateLimit: (
    env: TEnv,
    clientId: string,
    nowMs: number,
    config: { maxAttempts: number; windowMs: number; blockMs: number },
  ) => Promise<DurableObjectCheckResult<AuthFailureLimiterResponseBody>>;
  consumeBrowserBootstrapHandoff: (
    env: TEnv,
    handoffId: string,
    expiresAtMs: number,
  ) => Promise<DurableObjectCheckResult<boolean>>;
  getUserUsageSnapshot: (env: TEnv, userId: string) => Promise<UsageCounterResponseBody | null>;
  incrementUserUsage: (
    env: TEnv,
    userId: string,
    metadata?: { route?: string; method?: string },
  ) => Promise<void>;
  recordUserUiEvent: (
    env: TEnv,
    userId: string,
    eventName: string,
    outcome: string,
  ) => Promise<void>;
  validateSessionRequest: (request: Request, env: TEnv, nowMs: number) => Promise<Response | null>;
  finalizeSessionResponse: (
    request: Request,
    response: Response,
    env: TEnv,
    nowMs: number,
  ) => Promise<Response | null>;
  getAuthRateLimitedResponse: (
    clientId: string,
    env: TEnv,
    nowMs: number,
  ) => Promise<Response | null>;
  probeAuthRateLimit: (
    clientId: string,
    env: TEnv,
    nowMs: number,
  ) => Promise<AuthRateLimitProbeResult>;
  getAuthRouteRateLimitedResponse: (
    bucketId: string,
    env: TEnv,
    nowMs: number,
  ) => Promise<Response | null>;
  recordAuthFailure: (clientId: string, env: TEnv, nowMs: number) => Promise<void>;
  clearAuthFailures: (
    clientId: string,
    env: TEnv,
    nowMs: number,
    hadFailureState?: boolean,
  ) => Promise<void>;
  evaluateMcpBoundaryRequest: (
    request: Request,
    env: TEnv,
    clientId: string,
    nowMs: number,
  ) => Promise<Response | null>;
  applyAiChatLifetimeQuota: (env: TEnv, userId: string) => Promise<Response | null>;
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

function getUsageStub<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  userId: string,
): DurableObjectStub {
  const objectId = env.AUTH_FAILURE_LIMITER.idFromName(`usage:user:${userId}`);
  return env.AUTH_FAILURE_LIMITER.get(objectId);
}

export function shouldFailOpenOnAuthLimiterUnavailable(env: {
  MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN?: string;
}): boolean {
  if (env.MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN !== undefined) {
    return parseBoolean(env.MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN);
  }
  return false;
}

function shouldFailOpenOnSessionLifecycleUnavailable(env: {
  MCP_SESSION_LIFECYCLE_FAIL_OPEN?: string;
}): boolean {
  if (env.MCP_SESSION_LIFECYCLE_FAIL_OPEN !== undefined) {
    return parseBoolean(env.MCP_SESSION_LIFECYCLE_FAIL_OPEN);
  }
  return false;
}

function shouldFailOpenOnMcpBoundaryUnavailable(env: {
  MCP_BOUNDARY_FAIL_OPEN?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN?: string;
}): boolean {
  if (env.MCP_BOUNDARY_FAIL_OPEN !== undefined) {
    return parseBoolean(env.MCP_BOUNDARY_FAIL_OPEN);
  }
  return shouldFailOpenOnAuthLimiterUnavailable(env);
}

function logAuthLimiterFailOpen(surface: string, context: Record<string, unknown>): void {
  console.error(JSON.stringify({ event: 'auth_limiter_fail_open', surface, ...context }));
}

function getAuthFailureRateLimitConfig<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
): {
  enabled: boolean;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
} {
  return {
    enabled: env.MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED
      ? parseBoolean(env.MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED)
      : true,
    maxAttempts: parsePositiveInt(
      env.MCP_AUTH_FAILURE_RATE_LIMIT_MAX,
      DEFAULT_AUTH_FAILURE_LIMIT_MAX,
    ),
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

function getAuthLimiterStub<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  clientId: string,
): DurableObjectStub {
  const objectId = env.AUTH_FAILURE_LIMITER.idFromName(`auth-fail:${clientId}`);
  return env.AUTH_FAILURE_LIMITER.get(objectId);
}

function getBrowserBootstrapStub<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  handoffId: string,
): DurableObjectStub {
  const objectId = env.AUTH_FAILURE_LIMITER.idFromName(`browser-bootstrap:${handoffId}`);
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
  deps: Pick<
    CreateWorkerDurableRuntimeDeps<TEnv>,
    'now' | 'recordDurableObjectLatency' | 'recordDurableObjectUnavailable'
  >,
): Promise<DurableObjectCheckResult<SessionRevocationResponseBody>> {
  const stub = getSessionRevocationStub(env, sessionJti);
  const startedAt = deps.now();
  try {
    const response = await stub.fetch('https://auth-failure-limiter/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      deps.recordDurableObjectUnavailable('session_revocation');
      logDurableObjectFailure('session_revocation', body.action, 'http_error', response.status);
      return { kind: 'unavailable' };
    }
    return { kind: 'ok', value: (await response.json()) as SessionRevocationResponseBody };
  } catch {
    deps.recordDurableObjectUnavailable('session_revocation');
    logDurableObjectFailure('session_revocation', body.action, 'fetch_error');
    return { kind: 'unavailable' };
  } finally {
    deps.recordDurableObjectLatency('session_revocation', deps.now() - startedAt);
  }
}

async function callAuthLimiter<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  clientId: string,
  action: AuthFailureLimiterRequestBody['action'],
  nowMs: number,
  deps: Pick<
    CreateWorkerDurableRuntimeDeps<TEnv>,
    'now' | 'recordDurableObjectLatency' | 'recordDurableObjectUnavailable'
  >,
  limits?: { maxAttempts: number; windowMs: number; blockMs: number },
): Promise<DurableObjectCheckResult<AuthFailureLimiterResponseBody>> {
  const cfg =
    limits ??
    (() => {
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
      deps.recordDurableObjectUnavailable('auth_limiter');
      logDurableObjectFailure('auth_limiter', action, 'http_error', response.status);
      return { kind: 'unavailable' };
    }
    return { kind: 'ok', value: (await response.json()) as AuthFailureLimiterResponseBody };
  } catch (error) {
    deps.recordDurableObjectUnavailable('auth_limiter');
    logDurableObjectFailure('auth_limiter', action, 'fetch_error');
    console.error(
      JSON.stringify({
        event: 'auth_limiter_fetch_error',
        action,
        client_id: clientId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return { kind: 'unavailable' };
  } finally {
    deps.recordDurableObjectLatency('auth_limiter', deps.now() - startedAt);
  }
}

function hasAuthFailureState(state: AuthFailureLimiterResponseBody['state']): boolean {
  return state.count > 0 || state.windowStartedAtMs > 0 || state.blockedUntilMs > 0;
}

async function callMcpBoundaryEvaluate<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  clientId: string,
  body: Omit<McpBoundaryEvaluateRequestBody, 'action'>,
  deps: Pick<
    CreateWorkerDurableRuntimeDeps<TEnv>,
    'now' | 'recordDurableObjectLatency' | 'recordDurableObjectUnavailable'
  >,
): Promise<DurableObjectCheckResult<McpBoundaryEvaluateResponseBody>> {
  const stub = getAuthLimiterStub(env, `mcp-boundary-bundle:${clientId}`);
  const startedAt = deps.now();
  try {
    const response = await stub.fetch('https://auth-failure-limiter/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'mcp_boundary_evaluate',
        ...body,
      } satisfies McpBoundaryEvaluateRequestBody),
    });
    if (!response.ok) {
      deps.recordDurableObjectUnavailable('auth_limiter');
      logDurableObjectFailure(
        'auth_limiter',
        'mcp_boundary_evaluate',
        'http_error',
        response.status,
      );
      return { kind: 'unavailable' };
    }
    return { kind: 'ok', value: (await response.json()) as McpBoundaryEvaluateResponseBody };
  } catch {
    deps.recordDurableObjectUnavailable('auth_limiter');
    logDurableObjectFailure('auth_limiter', 'mcp_boundary_evaluate', 'fetch_error');
    return { kind: 'unavailable' };
  } finally {
    deps.recordDurableObjectLatency('auth_limiter', deps.now() - startedAt);
  }
}

async function callMcpSessionLifecycle<TEnv extends WorkerDurableRuntimeEnv>(
  env: TEnv,
  sessionId: string,
  action: McpSessionLifecycleAction,
  nowMs: number,
  deps: Pick<
    CreateWorkerDurableRuntimeDeps<TEnv>,
    | 'getCachedSessionTopology'
    | 'now'
    | 'recordDurableObjectLatency'
    | 'recordDurableObjectUnavailable'
  >,
): Promise<DurableObjectCheckResult<McpSessionLifecycleResponseBody>> {
  const topology = deps.getCachedSessionTopology(env);
  const placement = getWorkerMcpSessionPlacementHint(sessionId, topology);
  const stub = getMcpSessionLifecycleStub(env, sessionId, topology);
  const startedAt = deps.now();
  try {
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
      deps.recordDurableObjectUnavailable('mcp_session_lifecycle');
      logDurableObjectFailure('mcp_session_lifecycle', action, 'http_error', response.status);
      return { kind: 'unavailable' };
    }
    return { kind: 'ok', value: (await response.json()) as McpSessionLifecycleResponseBody };
  } catch {
    deps.recordDurableObjectUnavailable('mcp_session_lifecycle');
    logDurableObjectFailure('mcp_session_lifecycle', action, 'fetch_error');
    return { kind: 'unavailable' };
  } finally {
    deps.recordDurableObjectLatency('mcp_session_lifecycle', deps.now() - startedAt);
  }
}

export function createWorkerDurableRuntime<TEnv extends WorkerDurableRuntimeEnv>(
  deps: CreateWorkerDurableRuntimeDeps<TEnv>,
): WorkerDurableRuntime<TEnv> {
  // Keep the probe as a closure instead of reaching through `this`. Runtime
  // methods are passed into the transport boundary as standalone functions,
  // so relying on an object receiver turns an otherwise valid 401 into a
  // production-only TypeError.
  const probeAuthRateLimit = async (
    clientId: string,
    env: TEnv,
    nowMs: number,
  ): Promise<AuthRateLimitProbeResult> => {
    const cfg = getAuthFailureRateLimitConfig(env);
    if (!cfg.enabled) {
      return { kind: 'allowed', hasFailureState: false };
    }
    const limiterState = await callAuthLimiter(env, clientId, 'check', nowMs, deps);
    if (limiterState.kind === 'unavailable') {
      return {
        kind: 'unavailable',
        response: deps.jsonError(
          'Unable to validate authentication rate limit.',
          503,
          'auth_rate_limiter_unavailable',
        ),
      };
    }
    if (limiterState.value.blocked) {
      const retryAfterSeconds = limiterState.value.retryAfterSeconds;
      return {
        kind: 'blocked',
        response: deps.jsonError(
          'Too many failed authentication attempts',
          429,
          'auth_rate_limited',
          { retry_after_seconds: retryAfterSeconds },
          { 'Retry-After': String(retryAfterSeconds) },
        ),
      };
    }
    return {
      kind: 'allowed',
      hasFailureState: hasAuthFailureState(limiterState.value.state),
    };
  };

  return {
    async isUiSessionRevoked(env, sessionJti) {
      if (!isUiSessionRevocationEnabled(env)) return { kind: 'ok', value: false };
      const result = await callSessionRevocation(
        env,
        sessionJti,
        {
          action: 'session_check',
          nowMs: deps.now(),
        },
        deps,
      );
      if (result.kind === 'unavailable') {
        return result;
      }
      return { kind: 'ok', value: result.value.revoked === true };
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
      try {
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
      } catch {
        return null;
      }
    },

    async recordSessionBootstrapRateLimit(env, clientId, nowMs, config) {
      return callAuthLimiter(env, `session-bootstrap:${clientId}`, 'record', nowMs, deps, config);
    },

    async consumeBrowserBootstrapHandoff(env, handoffId, expiresAtMs) {
      const stub = getBrowserBootstrapStub(env, handoffId);
      try {
        const response = await stub.fetch('https://auth-failure-limiter/internal', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'browser_bootstrap_consume',
            nowMs: deps.now(),
            expiresAtMs,
          } satisfies BrowserBootstrapConsumeRequestBody),
        });
        if (!response.ok) {
          return { kind: 'unavailable' };
        }
        const payload = (await response.json()) as BrowserBootstrapConsumeResponseBody;
        return { kind: 'ok', value: payload.accepted === true };
      } catch {
        return { kind: 'unavailable' };
      }
    },

    async incrementUserUsage(env, userId, metadata = {}) {
      const stub = getUsageStub(env, userId);
      try {
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
      } catch {
        // Usage accounting should not take down otherwise healthy request paths.
      }
    },

    async recordUserUiEvent(env, userId, eventName, outcome) {
      const stub = getUsageStub(env, userId);
      try {
        await stub.fetch('https://auth-failure-limiter/internal', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'usage_record_ui_event',
            nowMs: deps.now(),
            eventName,
            outcome,
          } satisfies UsageCounterRequestBody),
        });
      } catch {
        // UI telemetry accounting should not take down otherwise healthy request paths.
      }
    },

    async validateSessionRequest(request, env, nowMs) {
      return validateBoundarySessionLifecycleRequest(
        request,
        env,
        nowMs,
        async (sessionId) => {
          const result = await callMcpSessionLifecycle(
            env,
            sessionId,
            'mcp_session_touch',
            nowMs,
            deps,
          );
          if (result.kind === 'unavailable') {
            if (shouldFailOpenOnSessionLifecycleUnavailable(env)) {
              logAuthLimiterFailOpen('mcp_session_touch', { session_id: sessionId });
              return 'active' satisfies McpSessionValidationState;
            }
            return 'unavailable' satisfies McpSessionValidationState;
          }
          return result.value.active ? 'active' : 'invalid';
        },
        { methods: ['POST', 'DELETE'] },
      );
    },

    async finalizeSessionResponse(request, response, env, nowMs) {
      return finalizeBoundarySessionLifecycleResponse(request, response, env, nowMs, {
        registerSession: async (sessionId) => {
          const result = await callMcpSessionLifecycle(
            env,
            sessionId,
            'mcp_session_register',
            nowMs,
            deps,
          );
          return result.kind === 'unavailable'
            ? shouldFailOpenOnSessionLifecycleUnavailable(env)
              ? ('ok' satisfies McpSessionMutationState)
              : ('unavailable' satisfies McpSessionMutationState)
            : 'ok';
        },
        closeSession: async (sessionId) => {
          const result = await callMcpSessionLifecycle(
            env,
            sessionId,
            'mcp_session_close',
            nowMs,
            deps,
          );
          return result.kind === 'unavailable'
            ? shouldFailOpenOnSessionLifecycleUnavailable(env)
              ? ('ok' satisfies McpSessionMutationState)
              : ('unavailable' satisfies McpSessionMutationState)
            : 'ok';
        },
      });
    },

    async getAuthRateLimitedResponse(clientId, env, nowMs) {
      const probe = await probeAuthRateLimit(clientId, env, nowMs);
      if (probe.kind === 'allowed') {
        return null;
      }
      return probe.response;
    },

    probeAuthRateLimit,

    async getAuthRouteRateLimitedResponse(bucketId, env, nowMs) {
      const cfg = getAuthFailureRateLimitConfig(env);
      if (!cfg.enabled) return null;
      const limiterState = await callAuthLimiter(
        env,
        `oauth-frontdoor:${bucketId}`,
        'record',
        nowMs,
        deps,
        {
          maxAttempts: cfg.maxAttempts,
          windowMs: cfg.windowMs,
          blockMs: cfg.blockMs,
        },
      );
      if (limiterState.kind === 'unavailable') {
        if (shouldFailOpenOnAuthLimiterUnavailable(env)) {
          logAuthLimiterFailOpen('oauth_frontdoor', { bucket_id: bucketId });
          return null;
        }
        return deps.jsonError(
          'Unable to validate OAuth route rate limit.',
          503,
          'oauth_route_rate_limit_unavailable',
        );
      }
      if (!limiterState.value.blocked) return null;

      const retryAfterSeconds = limiterState.value.retryAfterSeconds;
      return deps.jsonError(
        'Too many OAuth route attempts.',
        429,
        'oauth_route_rate_limited',
        { retry_after_seconds: retryAfterSeconds },
        { 'Retry-After': String(retryAfterSeconds) },
      );
    },

    async recordAuthFailure(clientId, env, nowMs) {
      const cfg = getAuthFailureRateLimitConfig(env);
      if (!cfg.enabled) return;
      await callAuthLimiter(env, clientId, 'record', nowMs, deps);
    },

    async clearAuthFailures(clientId, env, nowMs, hadFailureState = true) {
      const cfg = getAuthFailureRateLimitConfig(env);
      if (!cfg.enabled || !hadFailureState) return;
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
      const replayFingerprint = await buildMcpReplayFingerprint(
        request,
        contentLength,
        cfg.heavyPayloadBytes,
      );
      const boundaryResult = await callMcpBoundaryEvaluate(
        env,
        clientId,
        {
          nowMs,
          boundary: {
            maxAttempts: adaptiveMaxAttempts,
            windowMs: cfg.windowMs,
            blockMs: cfg.blockMs,
          },
          ...(replayFingerprint
            ? {
                replay: {
                  fingerprint: hashBoundaryReplayFingerprint(replayFingerprint),
                  maxAttempts: 2,
                  windowMs: cfg.replayWindowMs,
                  blockMs: cfg.replayWindowMs,
                },
              }
            : {}),
        },
        deps,
      );
      if (boundaryResult.kind === 'unavailable') {
        if (shouldFailOpenOnMcpBoundaryUnavailable(env)) {
          logAuthLimiterFailOpen('mcp_boundary', { client_id: clientId });
          return null;
        }
        return deps.jsonError(
          'Unable to enforce MCP boundary protections.',
          503,
          'mcp_boundary_unavailable',
        );
      }
      if (boundaryResult.value.blocked) {
        if (boundaryResult.value.reason === 'replay_detected') {
          const retryAfterSeconds = boundaryResult.value.retryAfterSeconds;
          return deps.jsonError(
            'Replay request detected at MCP boundary.',
            409,
            'mcp_replay_detected',
            { retry_after_seconds: retryAfterSeconds },
            { 'Retry-After': String(retryAfterSeconds) },
          );
        }
        const retryAfterSeconds = boundaryResult.value.retryAfterSeconds;
        return deps.jsonError(
          'MCP boundary rate limit exceeded.',
          429,
          'mcp_rate_limited',
          { retry_after_seconds: retryAfterSeconds },
          { 'Retry-After': String(retryAfterSeconds) },
        );
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
      } catch {
        deps.recordDurableObjectUnavailable('ai_chat_quota');
        logDurableObjectFailure('ai_chat_quota', 'quota_increment_check', 'fetch_error');
        return deps.jsonError(
          'Unable to validate hosted AI chat quota.',
          503,
          'ai_chat_quota_unavailable',
        );
      } finally {
        deps.recordDurableObjectLatency('ai_chat_quota', deps.now() - startedAt);
      }

      if (!response.ok) {
        deps.recordDurableObjectUnavailable('ai_chat_quota');
        logDurableObjectFailure(
          'ai_chat_quota',
          'quota_increment_check',
          'http_error',
          response.status,
        );
        return deps.jsonError(
          'Unable to validate hosted AI chat quota.',
          503,
          'ai_chat_quota_unavailable',
        );
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

export { AuthFailureLimiterDO } from './auth-failure-limiter-do.js';
