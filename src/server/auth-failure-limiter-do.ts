import {
  DEFAULT_AUTH_FAILURE_STATE,
  DEFAULT_AUTH_FAILURE_WINDOW_SECONDS,
} from './worker-runtime-contract.js';
import type {
  AuthFailureLimiterRequestBody,
  AuthFailureLimiterResponseBody,
  AuthFailureState,
  BrowserBootstrapUsageSummary,
  BrowserBootstrapConsumeRequestBody,
  BrowserBootstrapConsumeResponseBody,
  LifetimeQuotaRequestBody,
  LifetimeQuotaResponseBody,
  McpBoundaryEvaluateRequestBody,
  McpBoundaryEvaluateResponseBody,
  McpSessionEvictionReason,
  McpSessionLifecycleRequestBody,
  McpSessionLifecycleResponseBody,
  McpSessionLifecycleState,
  SessionRevocationRequestBody,
  SessionRevocationResponseBody,
  UsageCounterRequestBody,
  UsageCounterResponseBody,
} from './worker-runtime-contract.js';

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export class AuthFailureLimiterDO {
  private static readonly AUTH_FAILURE_WINDOW_MS_KEY = 'auth_failure_window_ms';
  private static readonly AUTH_FAILURE_CLEANUP_AT_MS_KEY = 'auth_failure_cleanup_at_ms';
  private static readonly UI_SESSION_REVOKED_UNTIL_MS_KEY = 'ui_session_revoked_until_ms';
  private static readonly MCP_SESSION_ALARM_AT_MS_KEY = 'mcp_session_alarm_at_ms';
  private static readonly BROWSER_BOOTSTRAP_EXPIRES_AT_MS_KEY = 'browser_bootstrap_expires_at_ms';
  private static readonly BROWSER_BOOTSTRAP_CONSUMED_AT_MS_KEY = 'browser_bootstrap_consumed_at_ms';

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

  private async loadAuthFailureWindowMs(): Promise<number | null> {
    const stored = await this.state.storage.get<number>(
      AuthFailureLimiterDO.AUTH_FAILURE_WINDOW_MS_KEY,
    );
    return typeof stored === 'number' && Number.isFinite(stored) ? stored : null;
  }

  private hasAuthFailureState(state: AuthFailureState): boolean {
    return state.count > 0 || state.windowStartedAtMs > 0 || state.blockedUntilMs > 0;
  }

  private getAuthFailureCleanupAtMs(state: AuthFailureState, windowMs: number): number {
    if (!this.hasAuthFailureState(state) || state.windowStartedAtMs <= 0) {
      return 0;
    }
    return Math.max(state.windowStartedAtMs + windowMs, state.blockedUntilMs);
  }

  private async scheduleAuthFailureCleanupAlarm(nextAtMs: number, force = false): Promise<void> {
    if (!Number.isFinite(nextAtMs) || nextAtMs <= 0) {
      await this.clearAuthFailureAlarm();
      return;
    }
    const scheduledAt =
      (await this.state.storage.get<number>(AuthFailureLimiterDO.AUTH_FAILURE_CLEANUP_AT_MS_KEY)) ??
      0;
    if (!force && scheduledAt > 0 && scheduledAt <= nextAtMs) {
      return;
    }
    await this.state.storage.put(AuthFailureLimiterDO.AUTH_FAILURE_CLEANUP_AT_MS_KEY, nextAtMs);
    await this.state.storage.setAlarm(nextAtMs);
  }

  private async clearAuthFailureAlarm(): Promise<void> {
    await this.state.storage.delete(AuthFailureLimiterDO.AUTH_FAILURE_CLEANUP_AT_MS_KEY);
    await this.state.storage.deleteAlarm();
  }

  private async saveState(nextState: AuthFailureState, windowMs: number): Promise<void> {
    await Promise.all([
      this.state.storage.put('auth_failure_state', nextState),
      this.state.storage.put(AuthFailureLimiterDO.AUTH_FAILURE_WINDOW_MS_KEY, windowMs),
    ]);
  }

  private async clearState(): Promise<void> {
    await Promise.all([
      this.state.storage.delete('auth_failure_state'),
      this.state.storage.delete(AuthFailureLimiterDO.AUTH_FAILURE_WINDOW_MS_KEY),
      this.state.storage.delete(AuthFailureLimiterDO.AUTH_FAILURE_CLEANUP_AT_MS_KEY),
    ]);
  }

  private getNamedAuthStateKey(scope: 'boundary' | 'replay', replayFingerprint?: string): string {
    if (scope === 'boundary') {
      return 'auth_failure_state';
    }
    const fingerprint = typeof replayFingerprint === 'string' ? replayFingerprint.trim() : '';
    return fingerprint ? `mcp_replay_state:${fingerprint}` : 'mcp_replay_state:invalid';
  }

  private getNamedAuthWindowKey(scope: 'boundary' | 'replay', replayFingerprint?: string): string {
    if (scope === 'boundary') {
      return AuthFailureLimiterDO.AUTH_FAILURE_WINDOW_MS_KEY;
    }
    const fingerprint = typeof replayFingerprint === 'string' ? replayFingerprint.trim() : '';
    return fingerprint ? `mcp_replay_window_ms:${fingerprint}` : 'mcp_replay_window_ms:invalid';
  }

  private async loadNamedAuthState(
    scope: 'boundary' | 'replay',
    replayFingerprint?: string,
  ): Promise<AuthFailureState> {
    const key = this.getNamedAuthStateKey(scope, replayFingerprint);
    const stored = await this.state.storage.get<AuthFailureState>(key);
    if (!stored) return { ...DEFAULT_AUTH_FAILURE_STATE };
    return {
      count: typeof stored.count === 'number' ? stored.count : 0,
      windowStartedAtMs:
        typeof stored.windowStartedAtMs === 'number' ? stored.windowStartedAtMs : 0,
      blockedUntilMs: typeof stored.blockedUntilMs === 'number' ? stored.blockedUntilMs : 0,
    };
  }

  private async loadNamedAuthWindowMs(
    scope: 'boundary' | 'replay',
    replayFingerprint?: string,
  ): Promise<number | null> {
    const key = this.getNamedAuthWindowKey(scope, replayFingerprint);
    const stored = await this.state.storage.get<number>(key);
    return typeof stored === 'number' && Number.isFinite(stored) ? stored : null;
  }

  private async saveNamedAuthState(
    scope: 'boundary' | 'replay',
    nextState: AuthFailureState,
    windowMs: number,
    replayFingerprint?: string,
  ): Promise<void> {
    await Promise.all([
      this.state.storage.put(this.getNamedAuthStateKey(scope, replayFingerprint), nextState),
      this.state.storage.put(this.getNamedAuthWindowKey(scope, replayFingerprint), windowMs),
    ]);
  }

  private async clearNamedAuthState(
    scope: 'boundary' | 'replay',
    replayFingerprint?: string,
  ): Promise<void> {
    await Promise.all([
      this.state.storage.delete(this.getNamedAuthStateKey(scope, replayFingerprint)),
      this.state.storage.delete(this.getNamedAuthWindowKey(scope, replayFingerprint)),
    ]);
  }

  private async recordNamedAuthLimit(
    scope: 'boundary' | 'replay',
    nowMs: number,
    maxAttempts: number,
    windowMs: number,
    blockMs: number,
    replayFingerprint?: string,
  ): Promise<{ blocked: boolean; retryAfterSeconds: number; state: AuthFailureState }> {
    let current = await this.loadNamedAuthState(scope, replayFingerprint);
    const storedWindowMs = await this.loadNamedAuthWindowMs(scope, replayFingerprint);
    const effectiveWindowMs =
      storedWindowMs && storedWindowMs > 0 ? Math.max(1_000, storedWindowMs) : windowMs;
    const currentCleanupAt = this.getAuthFailureCleanupAtMs(current, effectiveWindowMs);
    if (currentCleanupAt > 0 && currentCleanupAt <= nowMs) {
      current = { ...DEFAULT_AUTH_FAILURE_STATE };
      await this.clearNamedAuthState(scope, replayFingerprint);
    }

    if (current.windowStartedAtMs <= 0 || nowMs - current.windowStartedAtMs >= windowMs) {
      current = {
        count: 0,
        windowStartedAtMs: nowMs,
        blockedUntilMs: 0,
      };
    }
    const nextCount = current.count + 1;
    const shouldBlock = nextCount >= maxAttempts;
    current = {
      count: nextCount,
      windowStartedAtMs: current.windowStartedAtMs || nowMs,
      blockedUntilMs: shouldBlock ? nowMs + blockMs : current.blockedUntilMs,
    };
    await this.saveNamedAuthState(scope, current, windowMs, replayFingerprint);
    if (scope === 'boundary') {
      await this.scheduleAuthFailureCleanupAlarm(this.getAuthFailureCleanupAtMs(current, windowMs));
    }

    const blocked = current.blockedUntilMs > nowMs;
    return {
      blocked,
      retryAfterSeconds: blocked
        ? Math.max(1, Math.ceil((current.blockedUntilMs - nowMs) / 1000))
        : 0,
      state: current,
    };
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
    const scheduledAt =
      (await this.state.storage.get<number>(AuthFailureLimiterDO.MCP_SESSION_ALARM_AT_MS_KEY)) ?? 0;
    if (scheduledAt > 0 && scheduledAt <= nextAtMs) {
      return;
    }
    await this.state.storage.put(AuthFailureLimiterDO.MCP_SESSION_ALARM_AT_MS_KEY, nextAtMs);
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
      await this.state.storage.delete(AuthFailureLimiterDO.MCP_SESSION_ALARM_AT_MS_KEY);
      await this.state.storage.deleteAlarm();
      return;
    }

    await this.state.storage.put(AuthFailureLimiterDO.MCP_SESSION_ALARM_AT_MS_KEY, nextAtMs);
    await this.state.storage.setAlarm(nextAtMs);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    const body = await parseJsonBody<
      | AuthFailureLimiterRequestBody
      | SessionRevocationRequestBody
      | BrowserBootstrapConsumeRequestBody
      | UsageCounterRequestBody
      | LifetimeQuotaRequestBody
      | McpBoundaryEvaluateRequestBody
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
      const idleTtlMs = Math.max(
        1_000,
        Number.isFinite(body.idleTtlMs) ? body.idleTtlMs : 30 * 60 * 1000,
      );
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

      // Touch is the hot path; rely on alarms for periodic eviction sweeps.
      if (body.action !== 'mcp_session_touch') {
        await this.evictExpiredMcpSessions(nowMs, sweepLimit);
      }
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
      const revokedUntilMs =
        (await this.state.storage.get<number>(
          AuthFailureLimiterDO.UI_SESSION_REVOKED_UNTIL_MS_KEY,
        )) ?? 0;

      if (body.action === 'session_revoke') {
        const requestedUntil =
          typeof body.revokeUntilMs === 'number' && Number.isFinite(body.revokeUntilMs)
            ? body.revokeUntilMs
            : nowMs;
        const nextUntil = Math.max(revokedUntilMs, requestedUntil, nowMs);
        await this.state.storage.put(
          AuthFailureLimiterDO.UI_SESSION_REVOKED_UNTIL_MS_KEY,
          nextUntil,
        );
        await this.state.storage.setAlarm(nextUntil);
        return Response.json({ revoked: true } satisfies SessionRevocationResponseBody);
      }

      if (revokedUntilMs <= nowMs) {
        if (revokedUntilMs > 0) {
          await this.state.storage.delete(AuthFailureLimiterDO.UI_SESSION_REVOKED_UNTIL_MS_KEY);
          await this.state.storage.deleteAlarm();
        }
        return Response.json({ revoked: false } satisfies SessionRevocationResponseBody);
      }

      return Response.json({ revoked: true } satisfies SessionRevocationResponseBody);
    }

    if (body.action === 'browser_bootstrap_consume') {
      const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : Date.now();
      const expiresAtMs = Number.isFinite(body.expiresAtMs) ? body.expiresAtMs : 0;
      if (expiresAtMs <= nowMs) {
        return Response.json({ accepted: false } satisfies BrowserBootstrapConsumeResponseBody);
      }

      const consumedAtMs =
        (await this.state.storage.get<number>(
          AuthFailureLimiterDO.BROWSER_BOOTSTRAP_CONSUMED_AT_MS_KEY,
        )) ?? 0;
      if (consumedAtMs > 0) {
        return Response.json({ accepted: false } satisfies BrowserBootstrapConsumeResponseBody);
      }

      await this.state.storage.put(
        AuthFailureLimiterDO.BROWSER_BOOTSTRAP_CONSUMED_AT_MS_KEY,
        nowMs,
      );
      await this.state.storage.put(
        AuthFailureLimiterDO.BROWSER_BOOTSTRAP_EXPIRES_AT_MS_KEY,
        expiresAtMs,
      );
      await this.state.storage.setAlarm(expiresAtMs);
      return Response.json({ accepted: true } satisfies BrowserBootstrapConsumeResponseBody);
    }

    if (body.action === 'usage_increment' || body.action === 'usage_get') {
      const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : Date.now();
      const nowDate = new Date(nowMs).toISOString().slice(0, 10);
      const totalKey = 'usage_total_requests';
      const dayDateKey = 'usage_today_date';
      const dayCountKey = 'usage_today_count';
      const lastSeenKey = 'usage_last_seen_at_ms';
      const byRouteKey = 'usage_by_route';
      const browserBootstrapKey = 'usage_browser_bootstrap';

      const defaultBrowserBootstrap: BrowserBootstrapUsageSummary = {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        turnstileRefreshed: 0,
        lastOutcome: null,
        lastEventAt: null,
      };

      let totalRequests = (await this.state.storage.get<number>(totalKey)) ?? 0;
      const storedDayDate = (await this.state.storage.get<string>(dayDateKey)) ?? nowDate;
      let todayRequests = (await this.state.storage.get<number>(dayCountKey)) ?? 0;
      let byRoute = ((await this.state.storage.get<Record<string, number>>(byRouteKey)) ??
        {}) as Record<string, number>;
      const browserBootstrap = ((await this.state.storage.get<BrowserBootstrapUsageSummary>(
        browserBootstrapKey,
      )) ?? defaultBrowserBootstrap) as BrowserBootstrapUsageSummary;

      const activeDayDate = storedDayDate === nowDate ? storedDayDate : nowDate;
      if (storedDayDate !== nowDate) {
        todayRequests = 0;
      }

      if (body.action === 'usage_increment') {
        totalRequests += 1;
        todayRequests += 1;
        const route =
          typeof body.route === 'string' && body.route.trim().length > 0
            ? body.route.trim()
            : '/mcp';
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
        dailyRequests: todayRequests,
        currentDay: activeDayDate,
        lastSeenAt: lastSeenAtMs ? new Date(lastSeenAtMs).toISOString() : null,
        byRoute,
        browserBootstrap,
      } satisfies UsageCounterResponseBody);
    }

    if (body.action === 'usage_record_ui_event') {
      const browserBootstrapKey = 'usage_browser_bootstrap';
      const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : Date.now();
      const existing = ((await this.state.storage.get<BrowserBootstrapUsageSummary>(
        browserBootstrapKey,
      )) ?? {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        turnstileRefreshed: 0,
        lastOutcome: null,
        lastEventAt: null,
      }) as BrowserBootstrapUsageSummary;
      const eventName =
        typeof body.eventName === 'string' && body.eventName.trim().length > 0
          ? body.eventName.trim()
          : '';
      const outcome =
        typeof body.outcome === 'string' && body.outcome.trim().length > 0
          ? body.outcome.trim()
          : null;

      const next: BrowserBootstrapUsageSummary = {
        ...existing,
        lastOutcome: outcome,
        lastEventAt: new Date(nowMs).toISOString(),
      };
      if (eventName === 'browser_session_bootstrap_attempted') {
        next.attempted += 1;
      } else if (eventName === 'browser_session_bootstrap_succeeded') {
        next.succeeded += 1;
      } else if (eventName === 'browser_session_bootstrap_failed') {
        next.failed += 1;
      } else if (eventName === 'browser_session_bootstrap_turnstile_refreshed') {
        next.turnstileRefreshed += 1;
      }

      await this.state.storage.put(browserBootstrapKey, next);
      return Response.json({ ok: true });
    }

    if (body.action === 'mcp_boundary_evaluate') {
      const boundaryBody = body as McpBoundaryEvaluateRequestBody;
      const nowMs = Number.isFinite(boundaryBody.nowMs) ? boundaryBody.nowMs : Date.now();
      const boundary = boundaryBody.boundary;
      const boundaryMaxAttempts = Math.max(1, boundary?.maxAttempts ?? 1);
      const boundaryWindowMs = Math.max(1_000, boundary?.windowMs ?? 60_000);
      const boundaryBlockMs = Math.max(1_000, boundary?.blockMs ?? 120_000);

      const boundaryResult = await this.recordNamedAuthLimit(
        'boundary',
        nowMs,
        boundaryMaxAttempts,
        boundaryWindowMs,
        boundaryBlockMs,
      );
      if (boundaryResult.blocked) {
        return Response.json({
          blocked: true,
          retryAfterSeconds: boundaryResult.retryAfterSeconds,
          reason: 'boundary_rate_limit',
        } satisfies McpBoundaryEvaluateResponseBody);
      }

      const replay = boundaryBody.replay;
      const replayFingerprint =
        typeof replay?.fingerprint === 'string' ? replay.fingerprint.trim() : '';
      if (replay && replayFingerprint) {
        const replayResult = await this.recordNamedAuthLimit(
          'replay',
          nowMs,
          Math.max(1, replay.maxAttempts ?? 2),
          Math.max(1_000, replay.windowMs ?? 120_000),
          Math.max(1_000, replay.blockMs ?? 120_000),
          replayFingerprint,
        );
        if (replayResult.blocked) {
          return Response.json({
            blocked: true,
            retryAfterSeconds: replayResult.retryAfterSeconds,
            reason: 'replay_detected',
          } satisfies McpBoundaryEvaluateResponseBody);
        }
      }

      return Response.json({
        blocked: false,
        retryAfterSeconds: 0,
        reason: null,
      } satisfies McpBoundaryEvaluateResponseBody);
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
      await this.clearAuthFailureAlarm();
      return Response.json({
        blocked: false,
        retryAfterSeconds: 0,
        state: { ...DEFAULT_AUTH_FAILURE_STATE },
      } satisfies AuthFailureLimiterResponseBody);
    }

    let current = await this.loadState();
    const storedWindowMs = await this.loadAuthFailureWindowMs();
    const effectiveWindowMs =
      storedWindowMs && storedWindowMs > 0 ? Math.max(1_000, storedWindowMs) : windowMs;
    const currentCleanupAt = this.getAuthFailureCleanupAtMs(current, effectiveWindowMs);
    if (currentCleanupAt > 0 && currentCleanupAt <= nowMs) {
      current = { ...DEFAULT_AUTH_FAILURE_STATE };
      await this.clearState();
      await this.clearAuthFailureAlarm();
    }

    if (action === 'record') {
      if (current.windowStartedAtMs <= 0 || nowMs - current.windowStartedAtMs >= windowMs) {
        current = {
          count: 0,
          windowStartedAtMs: nowMs,
          blockedUntilMs: 0,
        };
      }
      const nextCount = current.count + 1;
      const shouldBlock = nextCount >= maxAttempts;
      current = {
        count: nextCount,
        windowStartedAtMs: current.windowStartedAtMs || nowMs,
        blockedUntilMs: shouldBlock ? nowMs + blockMs : current.blockedUntilMs,
      };
      await this.saveState(current, windowMs);
      await this.scheduleAuthFailureCleanupAlarm(this.getAuthFailureCleanupAtMs(current, windowMs));
    }

    const blocked = current.blockedUntilMs > nowMs;
    const retryAfterSeconds = blocked
      ? Math.max(1, Math.ceil((current.blockedUntilMs - nowMs) / 1000))
      : 0;

    if (action === 'check') {
      const cleanupAt = this.getAuthFailureCleanupAtMs(current, windowMs);
      if (cleanupAt > nowMs) {
        await this.scheduleAuthFailureCleanupAlarm(cleanupAt);
      } else if (!this.hasAuthFailureState(current)) {
        await this.clearState();
        await this.clearAuthFailureAlarm();
      }
    }

    return Response.json({
      blocked,
      retryAfterSeconds,
      state: current,
    } satisfies AuthFailureLimiterResponseBody);
  }

  async alarm(): Promise<void> {
    const nowMs = Date.now();
    const mcpSessionAlarmAt =
      (await this.state.storage.get<number>(AuthFailureLimiterDO.MCP_SESSION_ALARM_AT_MS_KEY)) ?? 0;
    if (mcpSessionAlarmAt > 0) {
      await this.evictExpiredMcpSessions(nowMs, 256);
      await this.refreshMcpSessionAlarm();
      return;
    }

    const revokedUntilMs =
      (await this.state.storage.get<number>(
        AuthFailureLimiterDO.UI_SESSION_REVOKED_UNTIL_MS_KEY,
      )) ?? 0;
    if (revokedUntilMs > 0) {
      if (revokedUntilMs <= nowMs) {
        await this.state.storage.delete(AuthFailureLimiterDO.UI_SESSION_REVOKED_UNTIL_MS_KEY);
        await this.state.storage.deleteAlarm();
      } else {
        await this.state.storage.setAlarm(revokedUntilMs);
      }
      return;
    }

    const browserBootstrapExpiresAt =
      (await this.state.storage.get<number>(
        AuthFailureLimiterDO.BROWSER_BOOTSTRAP_EXPIRES_AT_MS_KEY,
      )) ?? 0;
    if (browserBootstrapExpiresAt > 0) {
      if (browserBootstrapExpiresAt <= nowMs) {
        await this.state.storage.delete(AuthFailureLimiterDO.BROWSER_BOOTSTRAP_EXPIRES_AT_MS_KEY);
        await this.state.storage.delete(AuthFailureLimiterDO.BROWSER_BOOTSTRAP_CONSUMED_AT_MS_KEY);
        await this.state.storage.deleteAlarm();
      } else {
        await this.state.storage.setAlarm(browserBootstrapExpiresAt);
      }
      return;
    }

    const authFailureCleanupAt =
      (await this.state.storage.get<number>(AuthFailureLimiterDO.AUTH_FAILURE_CLEANUP_AT_MS_KEY)) ??
      0;
    if (authFailureCleanupAt > 0) {
      const windowMs =
        (await this.loadAuthFailureWindowMs()) ?? DEFAULT_AUTH_FAILURE_WINDOW_SECONDS * 1000;
      const current = await this.loadState();
      const cleanupAt = this.getAuthFailureCleanupAtMs(current, windowMs);
      if (cleanupAt <= nowMs) {
        await this.clearState();
        await this.clearAuthFailureAlarm();
      } else {
        await this.scheduleAuthFailureCleanupAlarm(cleanupAt, true);
      }
      return;
    }

    await this.evictExpiredMcpSessions(nowMs, 256);
    await this.refreshMcpSessionAlarm();
  }
}
