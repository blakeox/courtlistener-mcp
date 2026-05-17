import type { Page, Route } from 'playwright/test';
import { sessionSchema, usageSnapshotSchema, workerHealthSchema } from '../../src/lib/api';

interface MockSessionResponse {
  authenticated: boolean;
  user: { id: string } | null;
  turnstile_site_key?: string;
}

interface MockUsageSnapshot {
  userId: string;
  totalRequests: number;
  dailyRequests: number;
  currentDay: string;
  lastSeenAt: string | null;
  byRoute: Record<string, number>;
  browserBootstrap: {
    attempted: number;
    succeeded: number;
    failed: number;
    turnstileRefreshed: number;
    lastOutcome: string | null;
    lastEventAt: string | null;
  };
}

interface MockWorkerHealth {
  status: 'ok';
  service: 'courtlistener-mcp';
  transport: 'cloudflare-agents-streamable-http';
  cloudflare: {
    analytics_enabled: boolean;
    async_queue_configured: boolean;
    async_jobs_kv_configured: boolean;
    turnstile_enforced_routes: string[];
  };
  metrics: {
    latency_ms: Record<string, unknown>;
  };
  session_topology: {
    version: string;
    shard_count: number;
    idle_ttl_ms: number;
    absolute_ttl_ms: number;
    eviction_sweep_limit: number;
  };
}

interface MockRuntimeCatalog {
  sessionId?: string;
  protocolVersion?: string;
  serverName?: string;
  serverVersion?: string;
  capabilities?: Record<string, unknown>;
  categories?: string[];
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    metadata?: { category?: string };
  }>;
  resources?: Array<{
    uri: string;
    name?: string;
    description?: string;
  }>;
  prompts?: Array<{
    name: string;
    description?: string;
    arguments?: Array<{ name: string }>;
  }>;
}

interface InstallSpaMocksOptions {
  session?: MockSessionResponse;
  usage?: MockUsageSnapshot;
  health?: MockWorkerHealth;
  runtime?: MockRuntimeCatalog;
  sessionFailure?: {
    status?: number;
    body?: Record<string, unknown>;
  };
  logoutFailure?: {
    status?: number;
    body?: Record<string, unknown>;
    keepSession?: boolean;
  };
  runtimeFailures?: Partial<
    Record<
      'initialize' | 'tools/list' | 'resources/list' | 'prompts/list',
      {
        status?: number;
        body?: Record<string, unknown>;
      }
    >
  >;
}

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Promise<void> {
  await route.fulfill({
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function validateMockContract(type: 'session' | 'usage' | 'health', body: unknown): void {
  if (type === 'session') {
    sessionSchema.parse(body);
    return;
  }
  if (type === 'health') {
    workerHealthSchema.parse(body);
    return;
  }
  usageSnapshotSchema.parse(body);
}

const defaultWorkerHealth: MockWorkerHealth = {
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
      route_latency_ms: { '/mcp': { count: 4, avg_ms: 120 } },
      runtime_latency_ms: { queue_latency_ms: { count: 2, avg_ms: 40 } },
    },
  },
  session_topology: {
    version: 'v1',
    shard_count: 4,
    idle_ttl_ms: 1_800_000,
    absolute_ttl_ms: 43_200_000,
    eviction_sweep_limit: 100,
  },
};

export async function seedBrowserToken(page: Page, token: string, persist = false): Promise<void> {
  await page.addInitScript(
    ({ tokenValue, persistValue }) => {
      if (persistValue) {
        window.localStorage.setItem('courtlistenerMcpApiToken', tokenValue);
        window.sessionStorage.removeItem('courtlistenerMcpApiTokenSession');
        return;
      }

      window.sessionStorage.setItem('courtlistenerMcpApiTokenSession', tokenValue);
      window.localStorage.removeItem('courtlistenerMcpApiToken');
    },
    { tokenValue: token, persistValue: persist },
  );
}

export async function installSpaMocks(
  page: Page,
  options: InstallSpaMocksOptions = {},
): Promise<void> {
  let sessionState: MockSessionResponse = options.session ?? {
    authenticated: false,
    user: null,
    turnstile_site_key: '',
  };
  const health = options.health ?? defaultWorkerHealth;
  const usage = options.usage ?? {
    userId: sessionState.user?.id ?? 'signed-out',
    totalRequests: 0,
    dailyRequests: 0,
    currentDay: '2026-04-23',
    lastSeenAt: null,
    byRoute: {},
    browserBootstrap: {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      turnstileRefreshed: 0,
      lastOutcome: null,
      lastEventAt: null,
    },
  };
  const runtime = options.runtime;
  const sessionFailure = options.sessionFailure;
  const logoutFailure = options.logoutFailure;
  const runtimeFailures = options.runtimeFailures ?? {};

  await page.route('**/api/session', async (route) => {
    if (sessionFailure) {
      await fulfillJson(
        route,
        sessionFailure.body ?? {
          error: 'session_unavailable',
          message: 'Session endpoint unavailable.',
        },
        sessionFailure.status ?? 503,
      );
      return;
    }
    validateMockContract('session', sessionState);
    await fulfillJson(route, sessionState);
  });

  await page.route('**/api/usage', async (route) => {
    validateMockContract('usage', usage);
    await fulfillJson(route, usage);
  });

  await page.route('**/health', async (route) => {
    validateMockContract('health', health);
    await fulfillJson(route, health);
  });

  await page.route('**/api/logout', async (route) => {
    if (logoutFailure) {
      if (logoutFailure.keepSession === false) {
        sessionState = {
          authenticated: false,
          user: null,
          turnstile_site_key: sessionState.turnstile_site_key ?? '',
        };
      }
      await fulfillJson(
        route,
        logoutFailure.body ?? {
          error: 'logout_unavailable',
          message: 'Logout endpoint unavailable.',
        },
        logoutFailure.status ?? 503,
      );
      return;
    }
    sessionState = {
      authenticated: false,
      user: null,
      turnstile_site_key: sessionState.turnstile_site_key ?? '',
    };
    await fulfillJson(route, { ok: true });
  });

  await page.route('**/mcp', async (route) => {
    if (!runtime) {
      await fulfillJson(
        route,
        {
          error: 'runtime_unavailable',
          message: 'No mocked MCP runtime is configured for this browser test.',
        },
        503,
      );
      return;
    }

    const payload = route.request().postDataJSON() as { method?: string } | null;
    const method = payload?.method;
    const sessionId = runtime.sessionId ?? 'mcp-session-e2e';
    const runtimeFailure = method ? runtimeFailures[method] : undefined;

    if (runtimeFailure) {
      await fulfillJson(
        route,
        runtimeFailure.body ?? {
          error: 'runtime_unavailable',
          message: `Mocked MCP failure for ${method}.`,
        },
        runtimeFailure.status ?? 503,
      );
      return;
    }

    if (method === 'initialize') {
      await fulfillJson(
        route,
        {
          result: {
            protocolVersion: runtime.protocolVersion ?? '2025-06-18',
            serverInfo: {
              name: runtime.serverName ?? 'courtlistener-mcp',
              version: runtime.serverVersion ?? '1.0.5-test',
            },
            capabilities: runtime.capabilities ?? {
              tools: {},
              resources: { subscribe: true, listChanged: true },
              prompts: { listChanged: true },
            },
          },
        },
        200,
        { 'mcp-session-id': sessionId },
      );
      return;
    }

    if (method === 'tools/list') {
      await fulfillJson(
        route,
        {
          result: {
            tools: runtime.tools ?? [],
            metadata: { categories: runtime.categories ?? [] },
          },
        },
        200,
        { 'mcp-session-id': sessionId },
      );
      return;
    }

    if (method === 'resources/list') {
      await fulfillJson(
        route,
        {
          result: {
            resources: runtime.resources ?? [],
          },
        },
        200,
        { 'mcp-session-id': sessionId },
      );
      return;
    }

    if (method === 'prompts/list') {
      await fulfillJson(
        route,
        {
          result: {
            prompts: runtime.prompts ?? [],
          },
        },
        200,
        { 'mcp-session-id': sessionId },
      );
      return;
    }

    await fulfillJson(
      route,
      {
        error: {
          code: -32_000,
          message: `Unhandled MCP method in Playwright harness: ${method ?? 'unknown'}`,
        },
      },
      200,
      { 'mcp-session-id': sessionId },
    );
  });
}
