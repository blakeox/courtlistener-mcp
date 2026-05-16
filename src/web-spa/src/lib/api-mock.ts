/**
 * Mock API layer — in-memory fakes for UI development without a backend.
 * Activate via `?mock=true` query param.
 */
import type {
  AuthSessionResponse,
  SessionBootstrapResponse,
  UsageSnapshotResponse,
  WorkerHealthResponse,
} from './types';

let mockAuthenticated = false;
const mockUserId = 'mock-user-001';

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 200));
}

export async function getSession(): Promise<AuthSessionResponse> {
  await delay(100);
  return {
    authenticated: mockAuthenticated,
    user: mockAuthenticated ? { id: mockUserId } : null,
    turnstile_site_key: '',
  };
}

export async function logout(): Promise<void> {
  await delay(100);
  mockAuthenticated = false;
}

export async function postUiTelemetryEvent(): Promise<void> {
  await delay(25);
}

export async function bootstrapSession(_args: {
  authorization: string;
  turnstileToken?: string;
}): Promise<SessionBootstrapResponse> {
  await delay(100);
  mockAuthenticated = true;
  return {
    ok: true,
    userId: mockUserId,
    expiresInSeconds: 12 * 60 * 60,
  };
}

export async function getUsage(): Promise<UsageSnapshotResponse> {
  await delay(100);
  return {
    userId: mockUserId,
    totalRequests: 21,
    dailyRequests: 5,
    currentDay: '2026-05-15',
    lastSeenAt: '2026-05-15T12:00:00.000Z',
    byRoute: {
      '/mcp': 14,
      '/api/session/bootstrap': 3,
      '/api/ai-chat': 4,
    },
    browserBootstrap: {
      attempted: 3,
      succeeded: 2,
      failed: 1,
      turnstileRefreshed: 1,
      lastOutcome: 'success',
      lastEventAt: '2026-05-15T11:58:00.000Z',
    },
  };
}

export async function getWorkerHealth(): Promise<WorkerHealthResponse> {
  await delay(100);
  return {
    status: 'ok',
    service: 'courtlistener-mcp',
    transport: 'cloudflare-agents-streamable-http',
    cloudflare: {
      analytics_enabled: true,
      async_queue_configured: true,
      async_jobs_kv_configured: true,
      turnstile_enforced_routes: ['session_bootstrap', 'ai_chat'],
    },
    metrics: {
      latency_ms: {
        route_latency_ms: {
          '/mcp': { count: 4, avg_ms: 120 },
        },
      },
    },
    session_topology: {
      version: 'v1',
      shard_count: 4,
      idle_ttl_ms: 1800000,
      absolute_ttl_ms: 43200000,
      eviction_sweep_limit: 100,
    },
  };
}

export async function mcpCall<T>(
  _args: {
    method: string;
    params: Record<string, unknown>;
    sessionId?: string;
    id: number;
  },
  _token: string,
): Promise<{ body: T; sessionId: string | null }> {
  await delay(500);
  const mockResponse = {
    jsonrpc: '2.0',
    result: {
      content: [
        {
          type: 'text',
          text: 'Mock MCP response: This is a simulated tool call result for UI development.',
        },
      ],
    },
  };
  return {
    body: mockResponse as T,
    sessionId: `mock-session-${Date.now()}`,
  };
}

export async function aiChat(_args: {
  message: string;
  mcpToken: string;
  mcpSessionId?: string;
  toolName?: string;
  mode?: 'cheap' | 'balanced';
  testMode?: boolean;
  history?: Array<{ role: string; content: string }>;
}): Promise<{
  test_mode: boolean;
  fallback_used: boolean;
  mode: 'cheap' | 'balanced';
  tool: string;
  tool_reason?: string;
  session_id: string;
  ai_response: string;
  mcp_result: unknown;
}> {
  await delay(800);
  return {
    test_mode: true,
    fallback_used: false,
    mode: 'cheap',
    tool: 'search_cases',
    tool_reason: 'Default: general case search for broad legal queries.',
    session_id: `mock-session-${Date.now()}`,
    ai_response:
      'Mock AI response: This is a simulated AI chat result for UI development. The search found several relevant cases discussing the topic.',
    mcp_result: { content: [{ type: 'text', text: 'Mock MCP result data' }] },
  };
}

export async function aiPlain(_args: {
  message: string;
  mode?: 'cheap' | 'balanced';
  history?: Array<{ role: string; content: string }>;
}): Promise<{
  ai_response: string;
  mode: 'cheap' | 'balanced';
}> {
  await delay(600);
  return {
    ai_response:
      'Mock plain AI response: This is a simulated response without MCP tools. I can only answer from my training data.',
    mode: _args.mode ?? 'cheap',
  };
}

export function toErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message;
  const candidate = error as { message?: string; error?: string };
  if (candidate.message) return candidate.message;
  if (candidate.error) return candidate.error;
  return 'Unknown error';
}

/** Check if mock mode is enabled */
export function isMockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('mock');
}
