import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TokenProvider } from '../lib/token-context';
import { ToastProvider } from '../components/Toast';
import { createTestQueryClient, stubBrowserStorage } from './test-utils';

// Mock the API module to avoid real fetches
vi.mock('../lib/api', () => ({
  getSession: vi
    .fn()
    .mockResolvedValue({ authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' }),
  getUsage: vi.fn().mockResolvedValue({
    userId: 'u1',
    totalRequests: 0,
    dailyRequests: 0,
    currentDay: '2026-03-05',
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
  }),
  getWorkerHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    service: 'courtlistener-mcp',
    transport: 'cloudflare-agents-streamable-http',
    cloudflare: {
      analytics_enabled: true,
      async_queue_configured: true,
      async_jobs_kv_configured: true,
      turnstile_enforced_routes: [],
    },
    metrics: { latency_ms: {} },
    session_topology: {
      version: 'v1',
      shard_count: 4,
      idle_ttl_ms: 1800000,
      absolute_ttl_ms: 43200000,
      eviction_sweep_limit: 100,
    },
  }),
  listKeys: vi.fn().mockResolvedValue({ user_id: 'u1', keys: [] }),
  logout: vi.fn().mockResolvedValue(undefined),
  bootstrapSession: vi.fn().mockResolvedValue({
    ok: true,
    userId: 'u1',
    expiresInSeconds: 43200,
  }),
  postUiTelemetryEvent: vi.fn().mockResolvedValue(undefined),
  createKey: vi.fn().mockResolvedValue({
    message: 'ok',
    api_key: {
      id: 'k1',
      label: 'test',
      created_at: '2024-01-01',
      expires_at: null,
      token: 'tok',
    },
  }),
  revokeKey: vi.fn().mockResolvedValue(undefined),
  mcpCall: vi.fn().mockResolvedValue({ body: {}, sessionId: 'sid' }),
  aiChat: vi.fn().mockResolvedValue({
    test_mode: true,
    fallback_used: false,
    mode: 'cheap',
    tool: 'search_cases',
    tool_reason: 'Default search',
    session_id: 'sid',
    ai_response: 'resp',
    mcp_result: {},
  }),
  aiPlain: vi.fn().mockResolvedValue({ ai_response: 'plain resp', mode: 'cheap' }),
  toErrorMessage: vi.fn().mockReturnValue('Error'),
}));

vi.mock('../lib/hosted-auth', () => ({
  buildHostedAuthStartHref: vi.fn().mockReturnValue('/auth/start?return_to=%2Fapp%2Faccount'),
  redirectToHostedAuth: vi.fn(),
}));

// Mock telemetry
vi.mock('../lib/telemetry', () => ({
  trackEvent: vi.fn(),
  forwardUiTelemetryEvent: vi.fn(),
  markSignupStarted: vi.fn(),
  markFirstMcpSuccess: vi.fn(),
}));

// Mock auth hook
vi.mock('../lib/auth', () => ({
  useAuth: vi.fn().mockReturnValue({
    session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
    loading: false,
    sessionReady: true,
    sessionError: '',
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../lib/turnstile', () => ({
  describeTurnstileStatus: vi.fn((status: string, error: string) => error || status),
  useTurnstileToken: vi.fn().mockReturnValue({
    enabled: false,
    status: 'disabled',
    token: '',
    error: '',
    containerRef: { current: null },
    refresh: vi.fn(),
  }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <TokenProvider>
          <ToastProvider>{children}</ToastProvider>
        </TokenProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  const turnstile = await import('../lib/turnstile');
  vi.mocked(turnstile.describeTurnstileStatus).mockImplementation(
    (status: string, error: string) => error || status,
  );
  vi.mocked(turnstile.useTurnstileToken).mockReturnValue({
    enabled: false,
    status: 'disabled',
    token: '',
    error: '',
    containerRef: { current: null },
    refresh: vi.fn(),
  });
});

describe('HostedAuthRedirectPage', () => {
  beforeEach(() => {
    stubBrowserStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a hosted auth redirect fallback', async () => {
    const hostedAuth = await import('../lib/hosted-auth');
    const { HostedAuthRedirectPage } = await import('../pages/HostedAuthRedirectPage');
    render(<HostedAuthRedirectPage />, { wrapper: Wrapper });
    expect(screen.getByText('Redirecting to sign in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue to hosted auth/i })).toHaveAttribute(
      'href',
      '/auth/start?return_to=%2Fapp%2Faccount',
    );
    await waitFor(() => {
      expect(hostedAuth.redirectToHostedAuth).toHaveBeenCalledTimes(1);
    });
  });

  it('explains that the route now redirects into hosted auth', async () => {
    const { HostedAuthRedirectPage } = await import('../pages/HostedAuthRedirectPage');
    render(<HostedAuthRedirectPage />, { wrapper: Wrapper });
    expect(
      screen.getByText(/this app route has been retired in favor of the hosted auth flow/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/legacy/i)).not.toBeInTheDocument();
  });
});

describe('OnboardingPage', () => {
  beforeEach(() => {
    stubBrowserStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders runtime diagnostics card', async () => {
    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });
    expect(screen.getByText('Runtime Diagnostics')).toBeInTheDocument();
  });

  it('shows auth status', async () => {
    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });
    expect(screen.getAllByText(/browser access ready/i).length).toBeGreaterThan(0);
  });

  it('renders the Cloudflare challenge surface when Turnstile is configured', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValueOnce({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: 'site-key-1' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    const turnstile = await import('../lib/turnstile');
    vi.mocked(turnstile.useTurnstileToken).mockReturnValue({
      enabled: true,
      status: 'verified',
      token: 'tok-1',
      error: '',
      containerRef: { current: null },
      refresh: vi.fn(),
    });
    vi.mocked(turnstile.describeTurnstileStatus).mockReturnValue('Challenge verified');

    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(screen.getAllByText('Cloudflare challenge').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/challenge verified/i).length).toBeGreaterThan(0);
  });

  it('shows loading skeleton while checking browser access posture', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValueOnce({
      session: { authenticated: false, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: true,
      sessionReady: false,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });
    expect(screen.getAllByText(/checking browser access/i).length).toBeGreaterThan(0);
  });

  it('shows protocol explorer surfaces from live readiness metadata', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.listKeys).mockResolvedValueOnce({
      user_id: 'u1',
      keys: [
        {
          id: 'k1',
          label: 'Primary',
          is_active: true,
          revoked_at: null,
          expires_at: null,
          created_at: '2024-01-01',
        },
      ],
    });
    vi.mocked(api.mcpCall)
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'courtlistener-mcp', version: '1.0.5' },
            capabilities: {
              tools: {},
              resources: { subscribe: true, listChanged: true },
              prompts: { listChanged: true },
            },
          },
        },
        sessionId: 'sid-observe',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            tools: [
              {
                name: 'search_cases',
                description: 'Search legal cases',
                inputSchema: {
                  type: 'object',
                  properties: { page_size: { type: 'integer', minimum: 1, maximum: 20 } },
                  required: ['page_size'],
                },
                metadata: { category: 'search' },
              },
            ],
            metadata: { categories: ['search'] },
          },
        },
        sessionId: 'sid-observe',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            resources: [
              { uri: 'courtlistener://status', name: 'status', description: 'Service status' },
            ],
          },
        },
        sessionId: 'sid-observe',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            prompts: [
              {
                name: 'summarize_case',
                description: 'Summarize opinion',
                arguments: [{ name: 'citation' }],
              },
            ],
          },
        },
        sessionId: 'sid-observe',
      });

    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/catalog counts/i)).toBeInTheDocument();
      expect(screen.getByText(/1 tools · 1 resources · 1 prompts/i)).toBeInTheDocument();
      expect(screen.getByText(/tool categories/i)).toBeInTheDocument();
      expect(screen.getByText(/^search$/i)).toBeInTheDocument();
    });
  });

  it('shows account recovery actions when a local credential exists but browser access is signed out', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValueOnce({
      session: { authenticated: false, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });

    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(screen.getAllByText(/sign in required/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /^sign in$/i })[0]).toHaveAttribute(
      'href',
      '/auth/start?return_to=%2Fapp%2Faccount',
    );
    expect(screen.getByRole('button', { name: /clear local credential/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /open account/i })[0]).toHaveAttribute(
      'href',
      '/app/account',
    );
    expect(screen.queryByRole('link', { name: /legacy handoff/i })).not.toBeInTheDocument();
  });

  it('surfaces session endpoint failures and keeps recovery actions available', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValueOnce({
      session: { authenticated: false, user: null, turnstile_site_key: '' },
      loading: false,
      sessionReady: true,
      sessionError: 'Session service temporarily unavailable.',
      refresh: vi.fn(),
      logout: vi.fn(),
    });

    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });

    expect(screen.getByText('Session service temporarily unavailable.')).toBeInTheDocument();
    expect(screen.getByText(/browser access check failed/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^sign in$/i })[0]).toHaveAttribute(
      'href',
      '/auth/start?return_to=%2Fapp%2Faccount',
    );
  });

  it('shows protocol mismatch recovery guidance', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.listKeys).mockResolvedValueOnce({
      user_id: 'u1',
      keys: [
        {
          id: 'k1',
          label: 'Primary',
          is_active: true,
          revoked_at: null,
          expires_at: null,
          created_at: '2024-01-01',
        },
      ],
    });
    vi.mocked(api.mcpCall)
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'courtlistener-mcp', version: '1.0.5' },
            capabilities: { tools: {} },
          },
        },
        sessionId: 'sid-mismatch',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            tools: [{ name: 'search_cases', inputSchema: { type: 'object', required: ['q'] } }],
          },
        },
        sessionId: 'sid-mismatch',
      })
      .mockResolvedValueOnce({ body: { result: { resources: [] } }, sessionId: 'sid-mismatch' })
      .mockResolvedValueOnce({ body: { result: { prompts: [] } }, sessionId: 'sid-mismatch' });

    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getAllByText(/protocol mismatch detected/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/blocked by protocol mismatch/i)).toBeInTheDocument();
    });
  });
});

describe('LandingPage', () => {
  beforeEach(() => {
    stubBrowserStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the public landing page hero and core setup copy', async () => {
    const { LandingPage } = await import('../pages/LandingPage');
    render(<LandingPage />, { wrapper: Wrapper });
    expect(
      screen.getByRole('heading', { name: /connect ai to the law\. responsibly\./i, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /secure, structured access to u\.s\. federal court data via the model context protocol/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^sign in$/i })[0]).toHaveAttribute(
      'href',
      '/auth/start?return_to=%2Fapp%2Faccount',
    );
    expect(screen.getAllByRole('link', { name: /get started/i })[0]).toHaveAttribute(
      'href',
      '/get-started',
    );
    expect(screen.getByText(/search opinions/i)).toBeInTheDocument();
  });

  it('switches setup guidance through the shared landing tabs', async () => {
    const { LandingPage } = await import('../pages/LandingPage');
    render(<LandingPage />, { wrapper: Wrapper });

    const tablist = screen.getByRole('tablist', { name: /supported mcp clients/i });
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: /claude desktop/i })).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: /cursor/i }));

    expect(screen.getByRole('tabpanel', { name: /cursor/i })).toBeVisible();
    expect(screen.getByText(/wire the server into cursor/i)).toBeInTheDocument();
  });
});

describe('AccountPage', () => {
  beforeEach(async () => {
    stubBrowserStorage();
    vi.clearAllMocks();
    const api = await import('../lib/api');
    vi.mocked(api.getUsage).mockReset();
    vi.mocked(api.mcpCall).mockReset();
    vi.mocked(api.getUsage).mockResolvedValue({
      userId: 'u1',
      totalRequests: 0,
      dailyRequests: 0,
      currentDay: '2026-03-05',
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
    });
    vi.mocked(api.mcpCall).mockResolvedValue({ body: {}, sessionId: 'sid' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders account heading', async () => {
    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });
    expect(screen.getByRole('heading', { name: 'Account', level: 1 })).toBeInTheDocument();
  });

  it('shows account access details with user-facing labels', async () => {
    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });
    expect(screen.getByText('Account access')).toBeInTheDocument();
    expect(screen.getByText('Credential status')).toBeInTheDocument();
    expect(screen.getByText('Browser access')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument();
  });

  it('prefers the sign-in email for account display while keeping the internal user id visible', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValueOnce({
      session: {
        authenticated: true,
        user: { id: 'tuqi3jzgswiz', email: 'operator@example.com' },
        turnstile_site_key: '',
      },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    expect(screen.getByText('Signed in as operator@example.com')).toBeInTheDocument();
    expect(screen.getByText('Sign-in email')).toBeInTheDocument();
    expect(screen.getByText('operator@example.com')).toBeInTheDocument();
    expect(screen.getByText('tuqi3jzgswiz')).toBeInTheDocument();
  });

  it('keeps refresh as a secondary account access action instead of a page header action', async () => {
    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh account' })).not.toBeInTheDocument();
  });

  it('surfaces protocol readiness details when token is available', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall)
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'courtlistener-mcp', version: '1.0.5' },
            capabilities: { tools: {}, prompts: { listChanged: true } },
          },
        },
        sessionId: 'sid-account',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            tools: [
              {
                name: 'search_cases',
                inputSchema: {
                  type: 'object',
                  properties: { q: { type: 'string' } },
                  required: ['q'],
                },
              },
            ],
          },
        },
        sessionId: 'sid-account',
      })
      .mockResolvedValueOnce({
        body: { result: { resources: [{ uri: 'courtlistener://status', name: 'status' }] } },
        sessionId: 'sid-account',
      })
      .mockResolvedValueOnce({
        body: { result: { prompts: [{ name: 'summarize_case', arguments: [] }] } },
        sessionId: 'sid-account',
      });

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/2025-06-18/)).toBeInTheDocument();
      expect(screen.getByText('Runtime session')).toBeInTheDocument();
      expect(screen.getByText('sid-account')).toBeInTheDocument();
    });
  });

  it('shows protocol mismatch diagnostics and retry action', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall)
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'courtlistener-mcp', version: '1.0.5' },
            capabilities: { tools: {} },
          },
        },
        sessionId: 'sid-account',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            tools: [{ name: 'search_cases', inputSchema: { type: 'object', required: ['q'] } }],
          },
        },
        sessionId: 'sid-account',
      })
      .mockResolvedValueOnce({ body: { result: { resources: [] } }, sessionId: 'sid-account' })
      .mockResolvedValueOnce({ body: { result: { prompts: [] } }, sessionId: 'sid-account' });

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getAllByText(/protocol mismatch/i).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /re-check protocol/i })).toBeInTheDocument();
    });
  });

  it('surfaces server session failures without hiding the account diagnostics view', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValueOnce({
      session: undefined,
      loading: false,
      sessionReady: true,
      sessionError: 'Session service temporarily unavailable.',
      refresh: vi.fn(),
      logout: vi.fn(),
    });

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    expect(screen.getByText('Session service temporarily unavailable.')).toBeInTheDocument();
    expect(screen.getByText(/⚠ Failed/i)).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    expect(screen.queryByText('Usage & activity')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open credentials' })).toHaveAttribute(
      'href',
      '/app/credentials',
    );
    expect(screen.getByRole('link', { name: 'Open usage' })).toHaveAttribute('href', '/app/usage');
    expect(screen.getByRole('link', { name: 'Open diagnostics' })).toHaveAttribute(
      'href',
      '/app/diagnostics',
    );
    expect(screen.getByRole('link', { name: 'Open observability' })).toHaveAttribute(
      'href',
      '/app/observability',
    );
  });

  it('shows manual browser bootstrap controls when browser access is signed out', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValue({
      session: { authenticated: false, user: null, turnstile_site_key: 'site-key-1' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    const turnstile = await import('../lib/turnstile');
    vi.mocked(turnstile.useTurnstileToken).mockReturnValue({
      enabled: true,
      status: 'verified',
      token: 'turnstile-token',
      error: '',
      containerRef: { current: null },
      refresh: vi.fn(),
    });
    vi.mocked(turnstile.describeTurnstileStatus).mockReturnValue('Challenge verified');

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    expect(screen.getByText('Browser session bootstrap')).toBeTruthy();
    expect(screen.getByLabelText('Authorization header')).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: /bootstrap browser session/i }).length,
    ).toBeGreaterThan(0);
  });

  it('bootstraps browser access from the account page and refreshes session state', async () => {
    const auth = await import('../lib/auth');
    const refreshMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(auth.useAuth).mockReturnValue({
      session: { authenticated: false, user: null, turnstile_site_key: 'site-key-1' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: refreshMock,
      logout: vi.fn(),
    });
    const turnstile = await import('../lib/turnstile');
    const refreshTurnstileMock = vi.fn();
    vi.mocked(turnstile.useTurnstileToken).mockReturnValue({
      enabled: true,
      status: 'verified',
      token: 'turnstile-token',
      error: '',
      containerRef: { current: null },
      refresh: refreshTurnstileMock,
    });
    vi.mocked(turnstile.describeTurnstileStatus).mockReturnValue('Challenge verified');
    const api = await import('../lib/api');
    const telemetry = await import('../lib/telemetry');

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    fireEvent.change(screen.getByLabelText('Authorization header'), {
      target: { value: 'Bearer header.payload.signature' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /bootstrap browser session/i })[0]);

    await waitFor(() => {
      expect(vi.mocked(api.bootstrapSession)).toHaveBeenCalledWith({
        authorization: 'Bearer header.payload.signature',
        turnstileToken: 'turnstile-token',
      });
      expect(vi.mocked(telemetry.trackEvent)).toHaveBeenCalledWith(
        'browser_session_bootstrap_attempted',
        expect.objectContaining({
          turnstile_required: true,
          turnstile_status: 'verified',
        }),
      );
      expect(vi.mocked(telemetry.trackEvent)).toHaveBeenCalledWith(
        'browser_session_bootstrap_succeeded',
        expect.objectContaining({
          user_id_present: true,
          expires_in_seconds: 43200,
        }),
      );
      expect(refreshMock).toHaveBeenCalledTimes(1);
      expect(refreshTurnstileMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/browser session bootstrapped for u1/i)).toBeTruthy();
    });
  });

  it('refreshes the Turnstile widget after AI chat sends', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValueOnce({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: 'site-key-1' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    const turnstile = await import('../lib/turnstile');
    const refreshTurnstileMock = vi.fn();
    vi.mocked(turnstile.useTurnstileToken).mockReturnValue({
      enabled: true,
      status: 'verified',
      token: 'tok-1',
      error: '',
      containerRef: { current: null },
      refresh: refreshTurnstileMock,
    });
    vi.mocked(turnstile.describeTurnstileStatus).mockReturnValue('Challenge verified');

    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });

    fireEvent.change(screen.getAllByPlaceholderText(/ask a legal research question/i)[0], {
      target: { value: 'Find recent ADA accessibility cases' },
    });
    fireEvent.click(screen.getAllByText('Send')[0]);

    await waitFor(() => {
      expect(refreshTurnstileMock).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks manual bootstrap until the Cloudflare challenge is verified', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValue({
      session: { authenticated: false, user: null, turnstile_site_key: 'site-key-1' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    const turnstile = await import('../lib/turnstile');
    vi.mocked(turnstile.useTurnstileToken).mockReturnValue({
      enabled: true,
      status: 'ready',
      token: '',
      error: '',
      containerRef: { current: null },
      refresh: vi.fn(),
    });
    vi.mocked(turnstile.describeTurnstileStatus).mockReturnValue('Challenge ready');
    const api = await import('../lib/api');
    const telemetry = await import('../lib/telemetry');

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    fireEvent.change(screen.getByLabelText('Authorization header'), {
      target: { value: 'Bearer header.payload.signature' },
    });

    const bootstrapButton = screen.getAllByRole('button', {
      name: /bootstrap browser session/i,
    })[0];
    expect(bootstrapButton.getAttribute('disabled')).not.toBeNull();
    expect(vi.mocked(api.bootstrapSession)).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/complete the cloudflare challenge before bootstrapping browser access/i)
        .length,
    ).toBeGreaterThan(0);
    expect(vi.mocked(telemetry.trackEvent)).not.toHaveBeenCalledWith(
      'browser_session_bootstrap_attempted',
      expect.anything(),
    );
  });

  it('tracks challenge refresh requests from the bootstrap card', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValue({
      session: { authenticated: false, user: null, turnstile_site_key: 'site-key-1' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    const refreshTurnstileMock = vi.fn();
    const turnstile = await import('../lib/turnstile');
    vi.mocked(turnstile.useTurnstileToken).mockReturnValue({
      enabled: true,
      status: 'ready',
      token: '',
      error: '',
      containerRef: { current: null },
      refresh: refreshTurnstileMock,
    });
    vi.mocked(turnstile.describeTurnstileStatus).mockReturnValue('Challenge ready');
    const telemetry = await import('../lib/telemetry');

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getAllByRole('button', { name: /refresh challenge/i }).at(-1)!);

    expect(refreshTurnstileMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(telemetry.trackEvent)).toHaveBeenCalledWith(
      'browser_session_bootstrap_turnstile_refreshed',
      expect.objectContaining({
        turnstile_status: 'ready',
      }),
    );
  });

  it('preserves the local credential and surfaces the failure when account logout rejects', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'account-token');
    const auth = await import('../lib/auth');
    const logoutMock = vi.fn().mockRejectedValue(new Error('network failed'));
    vi.mocked(auth.useAuth).mockReturnValueOnce({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: logoutMock,
    });

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0]);

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem('courtlistenerMcpApiTokenSession')).toBe('account-token');
      expect(
        screen.getByText('Sign out failed — browser access is still active.'),
      ).toBeInTheDocument();
    });
  });
});

describe('PlaygroundPage', () => {
  function asyncJobSnapshot(
    overrides: Partial<Record<string, unknown>> = {},
  ): Record<string, unknown> {
    return {
      id: 'job-1',
      status: 'queued',
      toolName: 'search_cases',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:05:00.000Z',
      attempts: { current: 0, max: 3 },
      cancellationRequested: false,
      ...overrides,
    };
  }

  function asyncEnvelope(
    job: Record<string, unknown>,
    extras: Record<string, unknown> = {},
  ): { body: unknown; sessionId: string } {
    return {
      body: {
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                mode: 'async',
                job,
                ...extras,
              }),
            },
          ],
        },
      },
      sessionId: 'sid',
    };
  }

  beforeEach(async () => {
    stubBrowserStorage();
    vi.clearAllMocks();
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall).mockReset();
    vi.mocked(api.mcpCall).mockResolvedValue({ body: {}, sessionId: 'sid' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders playground tabs', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    expect(screen.getByRole('tablist', { name: /playground mode/i })).toBeInTheDocument();
  });

  it('shows all three tab buttons', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    expect(screen.getByRole('tab', { name: /ai chat/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /compare/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /raw mcp console/i })).toBeInTheDocument();
  });

  it('AI Chat tab is selected by default', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    const aiTab = screen.getByRole('tab', { name: /ai chat/i });
    expect(aiTab.getAttribute('aria-selected')).toBe('true');
  });

  it('supports arrow-key tab navigation in playground mode tabs', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    const aiTab = screen.getByRole('tab', { name: /ai chat/i });
    const compareTab = screen.getByRole('tab', { name: /compare/i });
    const rawTab = screen.getByRole('tab', { name: /raw mcp console/i });

    aiTab.focus();
    fireEvent.keyDown(aiTab, { key: 'ArrowRight' });
    expect(compareTab).toHaveFocus();
    expect(compareTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(compareTab, { key: 'End' });
    expect(rawTab).toHaveFocus();
    expect(rawTab).toHaveAttribute('aria-selected', 'true');
  });

  it('uses roving tab index for tab focus order', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    const aiTab = screen.getByRole('tab', { name: /ai chat/i });
    const compareTab = screen.getByRole('tab', { name: /compare/i });
    const rawTab = screen.getByRole('tab', { name: /raw mcp console/i });

    expect(aiTab).toHaveAttribute('tabindex', '0');
    expect(compareTab).toHaveAttribute('tabindex', '-1');
    expect(rawTab).toHaveAttribute('tabindex', '-1');

    fireEvent.click(rawTab);
    expect(aiTab).toHaveAttribute('tabindex', '-1');
    expect(rawTab).toHaveAttribute('tabindex', '0');
  });

  it('shows AI Chat panel content by default', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    // AI Chat panel should show empty state message
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });

  it('shows preset buttons in AI Chat tab', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    // Should show AI preset buttons (from AI_PRESETS)
    expect(screen.getByText(/case search/i)).toBeInTheDocument();
    expect(screen.getByText(/citation lookup/i)).toBeInTheDocument();
  });

  it('shows recent prompts when stored locally', async () => {
    localStorage.setItem(
      'clmcp_recent_ai_prompts',
      JSON.stringify(['Find recent cases about ADA website accessibility']),
    );
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    expect(screen.getByText(/recent prompts/i)).toBeInTheDocument();
  });

  it('shows tool catalog toggle button', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    expect(screen.getByText(/show tool catalog/i)).toBeInTheDocument();
  });

  it('shows session badge', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    expect(screen.getByText('No session')).toBeInTheDocument();
  });

  it('shows token missing warning when no token set', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    expect(screen.getByText(/no local mcp credential set/i)).toBeInTheDocument();
  });

  it('shows carried operational recovery status across pages', async () => {
    const { rememberOperationalStatus } = await import('../lib/operational-status');
    rememberOperationalStatus('Auth flow was rate limited. Wait briefly and retry.', 'info');
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    expect(screen.getByText(/auth flow was rate limited/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review account status/i })).toBeInTheDocument();
  });

  it('renders AI Chat input area with textarea and send button', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    expect(screen.getByPlaceholderText(/ask a legal research question/i)).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('renders challenge controls for AI chat when Turnstile is configured', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValueOnce({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: 'site-key-1' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    const turnstile = await import('../lib/turnstile');
    vi.mocked(turnstile.useTurnstileToken).mockReturnValue({
      enabled: true,
      status: 'verified',
      token: 'tok-1',
      error: '',
      containerRef: { current: null },
      refresh: vi.fn(),
    });
    vi.mocked(turnstile.describeTurnstileStatus).mockReturnValue('Challenge verified');

    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });

    expect(
      screen.getByText(/cloudflare turnstile protects hosted browser ai access/i),
    ).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /refresh challenge/i }).length).toBeGreaterThan(0);
  });

  it('blocks AI chat submission until the challenge is verified', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValueOnce({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: 'site-key-1' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    const turnstile = await import('../lib/turnstile');
    vi.mocked(turnstile.useTurnstileToken).mockReturnValue({
      enabled: true,
      status: 'ready',
      token: '',
      error: '',
      containerRef: { current: null },
      refresh: vi.fn(),
    });
    vi.mocked(turnstile.describeTurnstileStatus).mockReturnValue('Challenge ready');

    const api = await import('../lib/api');
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });

    fireEvent.change(screen.getAllByPlaceholderText(/ask a legal research question/i)[0], {
      target: { value: 'Find recent ADA accessibility cases' },
    });
    fireEvent.click(screen.getAllByText('Send')[0]);

    expect(
      await screen.findByText(/complete the cloudflare challenge before using ai chat/i),
    ).toBeTruthy();
    expect(vi.mocked(api.aiChat)).not.toHaveBeenCalled();
  });

  it('Compare tab panel is hidden when not active', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    const comparePanel = document.getElementById('panel-compare');
    expect(comparePanel?.hidden).toBe(true);
  });

  it('Raw MCP Console tab panel is hidden when not active', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    const rawPanel = document.getElementById('panel-raw');
    expect(rawPanel?.hidden).toBe(true);
  });

  it('supports async operator actions (queue, cancel, retry)', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall).mockImplementation(async (args) => {
      if (args.method === 'tools/list')
        return { body: { result: { tools: [] } }, sessionId: 'sid' };
      if (args.method === 'initialize') return { body: {}, sessionId: 'sid' };
      if (args.method !== 'tools/call') return { body: {}, sessionId: 'sid' };
      if (args.params.name === 'mcp_async_cancel_job') {
        return asyncEnvelope(
          asyncJobSnapshot({
            status: 'failed',
            updatedAt: '2025-01-01T00:01:00.000Z',
            error: {
              code: 'cancelled',
              message: 'Job cancelled before execution',
              deadLetter: false,
              attempts: 0,
              history: [],
            },
          }),
        );
      }
      if (
        args.params.name === 'search_cases' &&
        args.params.arguments &&
        '__mcp_async' in args.params.arguments
      ) {
        const requestedJobId = (args.id as number) > 3 ? 'job-2' : 'job-1';
        return asyncEnvelope(asyncJobSnapshot({ id: requestedJobId }));
      }
      return { body: {}, sessionId: 'sid' };
    });

    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('tab', { name: /raw mcp console/i }));
    fireEvent.click(screen.getByRole('button', { name: /connect mcp session/i }));
    await waitFor(() => {
      expect(screen.getByText(/connected\. session/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/run as async job/i));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByText(/job detail: job-1/i)).toBeInTheDocument();
      expect(screen.getByText(/async job job-1 is queued/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => {
      expect(
        vi.mocked(api.mcpCall).mock.calls.some(([call]) => {
          const payload = call as { method?: string; params?: { name?: string } };
          return payload.method === 'tools/call' && payload.params?.name === 'mcp_async_cancel_job';
        }),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^retry$/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
    await waitFor(() => {
      expect(screen.getByText(/job detail: job-2/i)).toBeInTheDocument();
    });
  });

  it('shows operator rate-limit recovery and temporarily blocks async controls', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall).mockImplementation(async (args) => {
      if (args.method === 'tools/list')
        return { body: { result: { tools: [] } }, sessionId: 'sid' };
      if (args.method === 'initialize') return { body: {}, sessionId: 'sid' };
      if (args.method !== 'tools/call') return { body: {}, sessionId: 'sid' };
      if (args.params.name === 'mcp_async_get_job') {
        const error = Object.assign(new Error('Too many requests'), {
          status: 429,
          retry_after_seconds: 3,
        });
        throw error;
      }
      if (
        args.params.name === 'search_cases' &&
        args.params.arguments &&
        '__mcp_async' in args.params.arguments
      ) {
        return asyncEnvelope(asyncJobSnapshot({ id: 'job-rl' }));
      }
      return { body: {}, sessionId: 'sid' };
    });

    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('tab', { name: /raw mcp console/i }));
    fireEvent.click(screen.getByRole('button', { name: /connect mcp session/i }));
    await waitFor(() => {
      expect(screen.getByText(/connected\. session/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/run as async job/i));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => {
      expect(screen.getByText(/job detail: job-rl/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /refresh status/i }));
    await waitFor(() => {
      expect(screen.getByText(/rate limited \(3s\)/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /refresh status/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /get result/i })).toBeDisabled();
    });
  });

  it('opens deep-linked job detail and retrieves async result', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall).mockImplementation(async (args) => {
      if (args.method === 'tools/list')
        return { body: { result: { tools: [] } }, sessionId: 'sid' };
      if (args.method === 'initialize') return { body: {}, sessionId: 'sid' };
      if (args.method !== 'tools/call') return { body: {}, sessionId: 'sid' };
      if (args.params.name === 'mcp_async_get_job') {
        return asyncEnvelope(
          asyncJobSnapshot({ id: 'job-deep', status: 'running', attempts: { current: 1, max: 3 } }),
        );
      }
      if (args.params.name === 'mcp_async_get_job_result') {
        return asyncEnvelope(
          asyncJobSnapshot({
            id: 'job-deep',
            status: 'succeeded',
            attempts: { current: 1, max: 3 },
          }),
          { result: { content: [{ type: 'text', text: '{"ok":true}' }] } },
        );
      }
      return { body: {}, sessionId: 'sid' };
    });

    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    const DeepLinkWrapper = ({ children }: { children: React.ReactNode }) => {
      const queryClient = createTestQueryClient();
      return (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/app/playground?jobId=job-deep']}>
            <TokenProvider>
              <ToastProvider>{children}</ToastProvider>
            </TokenProvider>
          </MemoryRouter>
        </QueryClientProvider>
      );
    };

    render(<PlaygroundPage />, { wrapper: DeepLinkWrapper });
    expect(screen.getByRole('tab', { name: /raw mcp console/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText(/job detail: job-deep/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /connect mcp session/i }));
    await waitFor(() => {
      expect(screen.getByText(/connected\. session/i)).toBeInTheDocument();
    });

    const statusButton =
      screen.queryByRole('button', { name: /load status/i }) ??
      screen.getByRole('button', { name: /refresh status/i });
    fireEvent.click(statusButton);
    await waitFor(() => {
      expect(screen.getByText(/job job-deep is running/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /get result/i }));
    await waitFor(() => {
      expect(screen.getByText(/result retrieved for job-deep/i)).toBeInTheDocument();
    });
  });

  it('uses live tools/list discovery for catalog count when available', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall).mockImplementation(async (args) => {
      if (args.method === 'tools/list') {
        return {
          body: {
            jsonrpc: '2.0',
            result: {
              tools: [
                {
                  name: 'live_lookup_tool',
                  description: 'Live-discovered tool',
                  inputSchema: {
                    type: 'object',
                    properties: { citation: { type: 'string' } },
                    required: ['citation'],
                  },
                  metadata: { category: 'Live' },
                },
              ],
              metadata: { categories: ['Live'] },
            },
          },
          sessionId: 'sid',
        };
      }
      return { body: {}, sessionId: 'sid' };
    });

    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /show tool catalog \(1\)/i })).toBeInTheDocument();
    });
    expect(vi.mocked(api.mcpCall)).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'tools/list' }),
      'test-token',
    );
  });

  it('falls back to static catalog when tools/list discovery fails', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall).mockImplementation(async (args) => {
      if (args.method === 'tools/list') throw new Error('discovery failed');
      return { body: {}, sessionId: 'sid' };
    });

    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(vi.mocked(api.mcpCall)).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'tools/list' }),
        'test-token',
      );
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /show tool catalog/i }).textContent).not.toContain(
        '(1)',
      );
    });
  });

  it('builds schema-driven tool arguments in Raw MCP Console', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall).mockImplementation(async (args) => {
      if (args.method === 'tools/list') {
        return {
          body: {
            result: {
              tools: [
                {
                  name: 'live_lookup_tool',
                  description: 'Live-discovered tool',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      citation: { type: 'string', description: 'Citation text' },
                      page_size: { type: 'integer', description: 'Number of results' },
                    },
                    required: ['citation'],
                  },
                  metadata: { category: 'Live' },
                },
              ],
              metadata: { categories: ['Live'] },
            },
          },
          sessionId: 'sid',
        };
      }
      if (args.method === 'initialize') return { body: {}, sessionId: 'sid' };
      if (args.method === 'tools/call') return { body: { result: { ok: true } }, sessionId: 'sid' };
      return { body: {}, sessionId: 'sid' };
    });

    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('tab', { name: /raw mcp console/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/citation/i)).toBeInTheDocument();
    });

    const citationInput = screen.getByLabelText(/citation/i);
    const pageSizeInput = screen.getByLabelText(/page_size/i);
    expect(citationInput).toBeInTheDocument();
    expect(pageSizeInput).toHaveAttribute('type', 'number');
  });

  it('validates required schema fields before tool call', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall).mockImplementation(async (args) => {
      if (args.method === 'tools/list') {
        return {
          body: {
            result: {
              tools: [
                {
                  name: 'live_lookup_tool',
                  description: 'Live-discovered tool',
                  inputSchema: {
                    type: 'object',
                    properties: { citation: { type: 'string' } },
                    required: ['citation'],
                  },
                  metadata: { category: 'Live' },
                },
              ],
              metadata: { categories: ['Live'] },
            },
          },
          sessionId: 'sid',
        };
      }
      if (args.method === 'initialize') return { body: {}, sessionId: 'sid' };
      return { body: {}, sessionId: 'sid' };
    });

    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('tab', { name: /raw mcp console/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/citation/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /connect mcp session/i }));
    await waitFor(() => {
      expect(screen.getByText(/connected\. session/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      const discoveryCalls = vi
        .mocked(api.mcpCall)
        .mock.calls.filter(([call]) => (call as { method?: string }).method === 'tools/list');
      expect(discoveryCalls.length).toBeGreaterThanOrEqual(2);
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByText(/fix argument errors before sending/i)).toBeInTheDocument();
    });
    expect(
      vi
        .mocked(api.mcpCall)
        .mock.calls.some(([call]) => (call as { method?: string }).method === 'tools/call'),
    ).toBe(false);
  });
});
