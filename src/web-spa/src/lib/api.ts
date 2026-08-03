import { z } from 'zod';
import type {
  ApiError,
  AuthSessionResponse,
  SessionBootstrapResponse,
  UiTelemetryIngestRequest,
  UsageSnapshotResponse,
  WorkerHealthResponse,
} from './types';

declare global {
  interface Window {
    __clmcpTurnstileToken?: string;
  }
}

export const sessionSchema = z.object({
  authenticated: z.boolean(),
  user: z
    .object({
      id: z.string(),
      email: z.string().optional(),
      displayName: z.string().optional(),
    })
    .nullable(),
  turnstile_site_key: z.string().nullable().optional(),
});

const aiChatSchema = z.object({
  test_mode: z.boolean(),
  fallback_used: z.boolean(),
  mode: z.enum(['cheap', 'balanced']),
  tool: z.string(),
  tool_reason: z.string().optional(),
  session_id: z.string(),
  ai_response: z.string(),
  mcp_result: z.unknown(),
});

export const usageSnapshotSchema = z.object({
  userId: z.string(),
  totalRequests: z.number(),
  dailyRequests: z.number(),
  currentDay: z.string(),
  lastSeenAt: z.string().nullable(),
  byRoute: z.record(z.string(), z.number()),
  browserBootstrap: z.object({
    attempted: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    turnstileRefreshed: z.number(),
    lastOutcome: z.string().nullable(),
    lastEventAt: z.string().nullable(),
  }),
});

export const workerHealthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unhealthy']),
  service: z.literal('courtlistener-mcp'),
  timestamp: z.string(),
  version: z.string(),
  runtime: z.enum(['node', 'cloudflare-worker']),
  transport: z.string(),
  diagnostics: z.object({
    session_topology: z.object({
      version: z.string(),
      shard_count: z.number(),
      idle_ttl_ms: z.number(),
      absolute_ttl_ms: z.number(),
      eviction_sweep_limit: z.number(),
    }),
    cloudflare: z.object({
      analytics_enabled: z.boolean(),
      async_queue_configured: z.boolean(),
      async_jobs_kv_configured: z.boolean(),
      turnstile_enforced_routes: z.array(z.string()),
    }),
    metrics: z.object({
      latency_ms: z.unknown(),
    }),
    metrics_health: z.unknown().optional(),
    cache_stats: z.unknown().optional(),
  }),
});

function readCookie(name: string): string {
  const key = `${name}=`;
  const entry = document.cookie
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(key));
  return entry ? decodeURIComponent(entry.slice(key.length)) : '';
}

function resolveTurnstileToken(explicitToken?: string): string {
  if (typeof explicitToken === 'string' && explicitToken.trim()) {
    return explicitToken.trim();
  }
  if (typeof window !== 'undefined' && typeof window.__clmcpTurnstileToken === 'string') {
    return window.__clmcpTurnstileToken.trim();
  }
  return '';
}

function consumeTurnstileToken(expectedToken?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (
    typeof window.__clmcpTurnstileToken === 'string' &&
    (!expectedToken || window.__clmcpTurnstileToken.trim() === expectedToken)
  ) {
    delete window.__clmcpTurnstileToken;
  }
}

async function parseBody<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  const csrf = readCookie('clmcp_csrf');
  const method = (init.method ?? 'GET').toUpperCase();
  if (csrf && method !== 'GET') {
    headers.set('x-csrf-token', csrf);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw { status: 0, error: 'timeout', message: 'Request timed out' } satisfies ApiError;
    }
    throw err;
  }
  clearTimeout(timer);

  const body = await parseBody<Record<string, unknown>>(response);
  if (!response.ok) {
    const error: ApiError = {
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : undefined,
      message: typeof body?.message === 'string' ? body.message : undefined,
      error_code: typeof body?.error_code === 'string' ? body.error_code : undefined,
      retry_after_seconds:
        typeof body?.retry_after_seconds === 'number'
          ? body.retry_after_seconds
          : Number.parseInt(response.headers.get('Retry-After') || '', 10) || undefined,
    };
    throw error;
  }

  return (body ?? {}) as T;
}

export async function getSession(): Promise<AuthSessionResponse> {
  const payload = await request<unknown>('/api/session');
  return sessionSchema.parse(payload);
}

export async function getUsage(): Promise<UsageSnapshotResponse> {
  const payload = await request<unknown>('/api/usage');
  return usageSnapshotSchema.parse(payload);
}

export async function getWorkerHealth(): Promise<WorkerHealthResponse> {
  const payload = await request<unknown>('/health');
  return workerHealthSchema.parse(payload);
}

export async function logout(): Promise<void> {
  await request('/api/logout', { method: 'POST' });
}

export async function postUiTelemetryEvent(event: UiTelemetryIngestRequest): Promise<void> {
  await request('/api/telemetry', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(event),
  });
}

export async function bootstrapSession(args: {
  authorization: string;
  turnstileToken?: string;
}): Promise<SessionBootstrapResponse> {
  const headers = new Headers({
    authorization: args.authorization,
  });
  const turnstileToken = resolveTurnstileToken(args.turnstileToken);
  if (turnstileToken) {
    headers.set('cf-turnstile-response', turnstileToken);
  }

  try {
    return (await request<unknown>('/api/session/bootstrap', {
      method: 'POST',
      headers,
    })) as SessionBootstrapResponse;
  } finally {
    if (turnstileToken) {
      consumeTurnstileToken(turnstileToken);
    }
  }
}

export async function mcpCall<T>(
  args: {
    method: string;
    params: Record<string, unknown>;
    sessionId?: string;
    id: number;
  },
  token: string,
): Promise<{ body: T; sessionId: string | null }> {
  if (!token.trim()) {
    throw {
      status: 401,
      error: 'missing_token',
      message: 'Missing bearer token.',
    } satisfies ApiError;
  }

  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-06-18',
  });
  if (args.sessionId) {
    headers.set('mcp-session-id', args.sessionId);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  let response: Response;
  try {
    response = await fetch('/mcp', {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: args.id,
        method: args.method,
        params: args.params,
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw { status: 0, error: 'timeout', message: 'Request timed out' } satisfies ApiError;
    }
    throw err;
  }
  clearTimeout(timer);

  const raw = await response.text();
  if (!response.ok) {
    throw {
      status: response.status,
      error: 'mcp_call_failed',
      message: raw.slice(0, 1000),
    } satisfies ApiError;
  }

  const trimmed = raw.trim();
  let body: unknown = {};
  if (trimmed.startsWith('{')) {
    body = JSON.parse(trimmed);
  } else {
    const dataLines = trimmed
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (dataLines.length > 0) {
      body = JSON.parse(dataLines[dataLines.length - 1]);
    }
  }

  if (body && typeof body === 'object' && 'error' in body) {
    const errBody = body as { error?: { message?: string; code?: number } };
    throw {
      status: 0,
      error: 'mcp_error',
      message:
        typeof errBody.error?.message === 'string'
          ? errBody.error.message
          : 'MCP returned an error',
    } satisfies ApiError;
  }

  return {
    body: body as T,
    sessionId: response.headers.get('mcp-session-id'),
  };
}

export async function aiChat(args: {
  message: string;
  mcpToken?: string;
  mcpSessionId?: string;
  toolName?: string;
  mode?: 'cheap' | 'balanced';
  testMode?: boolean;
  history?: Array<{ role: string; content: string }>;
  turnstileToken?: string;
}): Promise<z.infer<typeof aiChatSchema>> {
  const { turnstileToken: explicitToken, ...body } = args;
  const headers = new Headers({ 'content-type': 'application/json' });
  const turnstileToken = resolveTurnstileToken(explicitToken);
  if (turnstileToken) {
    headers.set('cf-turnstile-response', turnstileToken);
  }
  try {
    const payload = await request<unknown>('/api/ai-chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return aiChatSchema.parse(payload);
  } finally {
    if (turnstileToken) {
      consumeTurnstileToken(turnstileToken);
    }
  }
}

const aiPlainSchema = z.object({
  ai_response: z.string(),
  mode: z.enum(['cheap', 'balanced']),
});

export async function aiPlain(args: {
  message: string;
  mode?: 'cheap' | 'balanced';
  history?: Array<{ role: string; content: string }>;
}): Promise<z.infer<typeof aiPlainSchema>> {
  const payload = await request<unknown>('/api/ai-plain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  return aiPlainSchema.parse(payload);
}

export function toErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  const candidate = error as ApiError;
  if (candidate.retry_after_seconds && Number.isFinite(candidate.retry_after_seconds)) {
    const seconds = Math.max(1, Math.floor(candidate.retry_after_seconds));
    const baseMessage = candidate.message || candidate.error || 'Rate limited';
    return `${baseMessage} Retry in ${seconds}s.`;
  }
  if (candidate.message) return candidate.message;
  if (candidate.error) return candidate.error;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}
