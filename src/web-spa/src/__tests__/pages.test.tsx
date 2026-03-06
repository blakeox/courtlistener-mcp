import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokenProvider } from '../lib/token-context';
import { ToastProvider } from '../components/Toast';

// Mock the API module to avoid real fetches
vi.mock('../lib/api', () => ({
  getSession: vi.fn().mockResolvedValue({ authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' }),
  getUsage: vi.fn().mockResolvedValue({
    userId: 'u1',
    totalRequests: 0,
    dailyRequests: 0,
    currentDay: '2026-03-05',
    lastSeenAt: null,
    byRoute: {},
  }),
  listKeys: vi.fn().mockResolvedValue({ user_id: 'u1', keys: [] }),
  login: vi.fn().mockResolvedValue({ message: 'ok' }),
  loginByAccessToken: vi.fn().mockResolvedValue({ message: 'ok' }),
  logout: vi.fn().mockResolvedValue(undefined),
  signup: vi.fn().mockResolvedValue({ message: 'ok' }),
  requestPasswordReset: vi.fn().mockResolvedValue({ message: 'ok' }),
  resetPassword: vi.fn().mockResolvedValue({ message: 'ok' }),
  createKey: vi.fn().mockResolvedValue({ message: 'ok', api_key: { id: 'k1', label: 'test', created_at: '2024-01-01', expires_at: null, token: 'tok' } }),
  revokeKey: vi.fn().mockResolvedValue(undefined),
  mcpCall: vi.fn().mockResolvedValue({ body: {}, sessionId: 'sid' }),
  aiChat: vi.fn().mockResolvedValue({ test_mode: true, fallback_used: false, mode: 'cheap', tool: 'search_cases', tool_reason: 'Default search', session_id: 'sid', ai_response: 'resp', mcp_result: {} }),
  aiPlain: vi.fn().mockResolvedValue({ ai_response: 'plain resp', mode: 'cheap' }),
  toErrorMessage: vi.fn().mockReturnValue('Error'),
}));

// Mock telemetry
vi.mock('../lib/telemetry', () => ({
  trackEvent: vi.fn(),
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

function createStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TokenProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </TokenProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders login form', async () => {
    const { LoginPage } = await import('../pages/LoginPage');
    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('renders help card', async () => {
    const { LoginPage } = await import('../pages/LoginPage');
    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText(/need help/i)).toBeInTheDocument();
  });

  it('shows rate-limit recovery guidance when login is throttled', async () => {
    const api = await import('../lib/api');
    vi.mocked(api.login).mockRejectedValueOnce({ status: 429, retry_after_seconds: 4, message: 'Too many requests' });
    const { LoginPage } = await import('../pages/LoginPage');
    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secret123!' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText(/wait for the retry timer and try again/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /rate limited \(4s\)/i })).toBeInTheDocument();
  });
});

describe('SignupPage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders signup form', async () => {
    const { SignupPage } = await import('../pages/SignupPage');
    render(<SignupPage />, { wrapper: Wrapper });
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows password requirements', async () => {
    const { SignupPage } = await import('../pages/SignupPage');
    render(<SignupPage />, { wrapper: Wrapper });
    expect(screen.getByText(/password requirements/i)).toBeInTheDocument();
  });

  it('shows rate-limit recovery guidance when signup is throttled', async () => {
    const api = await import('../lib/api');
    vi.mocked(api.signup).mockRejectedValueOnce({ status: 429, retry_after_seconds: 6, message: 'Too many requests' });
    const { SignupPage } = await import('../pages/SignupPage');
    render(<SignupPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Secret123!' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/wait for the retry timer and try again/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /rate limited \(6s\)/i })).toBeInTheDocument();
  });
});

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders control center card', async () => {
    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });
    expect(screen.getByText('Control Center')).toBeInTheDocument();
  });

  it('shows auth status', async () => {
    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });
    expect(screen.getByText(/authenticated/i)).toBeInTheDocument();
  });

  it('shows loading skeleton while checking session posture', async () => {
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
    expect(screen.getByText(/checking server session/i)).toBeInTheDocument();
  });

  it('shows protocol explorer surfaces from live readiness metadata', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.listKeys).mockResolvedValueOnce({
      user_id: 'u1',
      keys: [{ id: 'k1', label: 'Primary', is_active: true, revoked_at: null, expires_at: null, created_at: '2024-01-01' }],
    });
    vi.mocked(api.mcpCall)
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'courtlistener-mcp', version: '0.1.0' },
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
            tools: [{
              name: 'search_cases',
              description: 'Search legal cases',
              inputSchema: {
                type: 'object',
                properties: { page_size: { type: 'integer', minimum: 1, maximum: 20 } },
                required: ['page_size'],
              },
              metadata: { category: 'search' },
            }],
            metadata: { categories: ['search'] },
          },
        },
        sessionId: 'sid-observe',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            resources: [{ uri: 'courtlistener://status', name: 'status', description: 'Service status' }],
          },
        },
        sessionId: 'sid-observe',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            prompts: [{ name: 'summarize_case', description: 'Summarize opinion', arguments: [{ name: 'citation' }] }],
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

  it('shows session recovery actions when token exists but session is signed out', async () => {
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

    expect(screen.getByText(/not authenticated \(token-only mode still supported\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear stored token/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open account page/i })).toHaveAttribute('href', '/app/account');
  });

  it('shows protocol mismatch recovery guidance', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.listKeys).mockResolvedValueOnce({
      user_id: 'u1',
      keys: [{ id: 'k1', label: 'Primary', is_active: true, revoked_at: null, expires_at: null, created_at: '2024-01-01' }],
    });
    vi.mocked(api.mcpCall)
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'courtlistener-mcp', version: '0.1.0' },
            capabilities: { tools: {} },
          },
        },
        sessionId: 'sid-mismatch',
      })
      .mockResolvedValueOnce({ body: { result: { tools: [{ name: 'search_cases', inputSchema: { type: 'object', required: ['q'] } }] } }, sessionId: 'sid-mismatch' })
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

describe('AccountPage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders account heading', async () => {
    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('shows session info area', async () => {
    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });
    expect(screen.getByText('Authenticated')).toBeInTheDocument();
  });

  it('surfaces protocol observability counts when token is available', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'test-token');
    const api = await import('../lib/api');
    vi.mocked(api.mcpCall)
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'courtlistener-mcp', version: '0.1.0' },
            capabilities: { tools: {}, prompts: { listChanged: true } },
          },
        },
        sessionId: 'sid-account',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            tools: [{
              name: 'search_cases',
              inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
            }],
          },
        },
        sessionId: 'sid-account',
      })
      .mockResolvedValueOnce({ body: { result: { resources: [{ uri: 'courtlistener://status', name: 'status' }] } }, sessionId: 'sid-account' })
      .mockResolvedValueOnce({ body: { result: { prompts: [{ name: 'summarize_case', arguments: [] }] } }, sessionId: 'sid-account' });

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/2025-06-18/)).toBeInTheDocument();
      expect(screen.getByText('1 tools · 1 resources · 1 prompts')).toBeInTheDocument();
      expect(screen.getByText(/Protocol session active: sid-account/i)).toBeInTheDocument();
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
            serverInfo: { name: 'courtlistener-mcp', version: '0.1.0' },
            capabilities: { tools: {} },
          },
        },
        sessionId: 'sid-account',
      })
      .mockResolvedValueOnce({ body: { result: { tools: [{ name: 'search_cases', inputSchema: { type: 'object', required: ['q'] } }] } }, sessionId: 'sid-account' })
      .mockResolvedValueOnce({ body: { result: { resources: [] } }, sessionId: 'sid-account' })
      .mockResolvedValueOnce({ body: { result: { prompts: [] } }, sessionId: 'sid-account' });

    const { AccountPage } = await import('../pages/AccountPage');
    render(<AccountPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getAllByText(/protocol mismatch/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/blocked by protocol mismatch/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /re-check protocol/i })).toBeInTheDocument();
    });
  });
});

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders "Reset password" heading', async () => {
    const { ResetPasswordPage } = await import('../pages/ResetPasswordPage');
    render(<ResetPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByText('Reset password')).toBeInTheDocument();
  });

  it('shows password fields when recovery token exists', async () => {
    window.location.hash = '#access_token=test-token&type=recovery';
    const { ResetPasswordPage } = await import('../pages/ResetPasswordPage');
    render(<ResetPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    window.location.hash = '';
  });

  it('shows password fields when recovery token_hash exists', async () => {
    window.history.replaceState({}, document.title, '/app/reset-password?type=recovery&token_hash=test-hash');
    const { ResetPasswordPage } = await import('../pages/ResetPasswordPage');
    render(<ResetPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    window.history.replaceState({}, document.title, '/');
  });

  it('shows warning when no recovery token', async () => {
    window.location.hash = '';
    const { ResetPasswordPage } = await import('../pages/ResetPasswordPage');
    render(<ResetPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByText(/missing or expired/i)).toBeInTheDocument();
  });
});

describe('KeysPage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders "Local MCP credential" heading', async () => {
    const { KeysPage } = await import('../pages/KeysPage');
    render(<KeysPage />, { wrapper: Wrapper });
    expect(screen.getByText('Local MCP credential')).toBeInTheDocument();
  });

  it('shows create key button', async () => {
    const { KeysPage } = await import('../pages/KeysPage');
    render(<KeysPage />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: /create key/i })).toBeInTheDocument();
  });
});

describe('PlaygroundPage', () => {
  function asyncJobSnapshot(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
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

  function asyncEnvelope(job: Record<string, unknown>, extras: Record<string, unknown> = {}): { body: unknown; sessionId: string } {
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

  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
    vi.clearAllMocks();
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
    localStorage.setItem('clmcp_recent_ai_prompts', JSON.stringify(['Find recent cases about ADA website accessibility']));
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
    // SessionBadge shows session status
    expect(screen.getByText(/session/i)).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: /review session status/i })).toBeInTheDocument();
  });

  it('renders AI Chat input area with textarea and send button', async () => {
    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    render(<PlaygroundPage />, { wrapper: Wrapper });
    expect(screen.getByPlaceholderText(/ask a legal research question/i)).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
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
      if (args.method === 'tools/list') return { body: { result: { tools: [] } }, sessionId: 'sid' };
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
      if (args.params.name === 'search_cases' && args.params.arguments && '__mcp_async' in args.params.arguments) {
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
      expect(vi.mocked(api.mcpCall).mock.calls.some(([call]) => {
        const payload = call as { method?: string; params?: { name?: string } };
        return payload.method === 'tools/call' && payload.params?.name === 'mcp_async_cancel_job';
      })).toBe(true);
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
      if (args.method === 'tools/list') return { body: { result: { tools: [] } }, sessionId: 'sid' };
      if (args.method === 'initialize') return { body: {}, sessionId: 'sid' };
      if (args.method !== 'tools/call') return { body: {}, sessionId: 'sid' };
      if (args.params.name === 'mcp_async_get_job') {
        const error = Object.assign(new Error('Too many requests'), { status: 429, retry_after_seconds: 3 });
        throw error;
      }
      if (args.params.name === 'search_cases' && args.params.arguments && '__mcp_async' in args.params.arguments) {
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
      if (args.method === 'tools/list') return { body: { result: { tools: [] } }, sessionId: 'sid' };
      if (args.method === 'initialize') return { body: {}, sessionId: 'sid' };
      if (args.method !== 'tools/call') return { body: {}, sessionId: 'sid' };
      if (args.params.name === 'mcp_async_get_job') {
        return asyncEnvelope(asyncJobSnapshot({ id: 'job-deep', status: 'running', attempts: { current: 1, max: 3 } }));
      }
      if (args.params.name === 'mcp_async_get_job_result') {
        return asyncEnvelope(
          asyncJobSnapshot({ id: 'job-deep', status: 'succeeded', attempts: { current: 1, max: 3 } }),
          { result: { content: [{ type: 'text', text: '{"ok":true}' }] } },
        );
      }
      return { body: {}, sessionId: 'sid' };
    });

    const { PlaygroundPage } = await import('../pages/PlaygroundPage');
    const DeepLinkWrapper = ({ children }: { children: React.ReactNode }) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    expect(screen.getByRole('tab', { name: /raw mcp console/i })).toHaveAttribute('aria-selected', 'true');
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
              tools: [{
                name: 'live_lookup_tool',
                description: 'Live-discovered tool',
                inputSchema: { type: 'object', properties: { citation: { type: 'string' } }, required: ['citation'] },
                metadata: { category: 'Live' },
              }],
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
    expect(vi.mocked(api.mcpCall)).toHaveBeenCalledWith(expect.objectContaining({ method: 'tools/list' }), 'test-token');
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
      expect(vi.mocked(api.mcpCall)).toHaveBeenCalledWith(expect.objectContaining({ method: 'tools/list' }), 'test-token');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /show tool catalog/i }).textContent).not.toContain('(1)');
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
              tools: [{
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
              }],
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
              tools: [{
                name: 'live_lookup_tool',
                description: 'Live-discovered tool',
                inputSchema: {
                  type: 'object',
                  properties: { citation: { type: 'string' } },
                  required: ['citation'],
                },
                metadata: { category: 'Live' },
              }],
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
      const discoveryCalls = vi.mocked(api.mcpCall).mock.calls.filter(([call]) => (call as { method?: string }).method === 'tools/list');
      expect(discoveryCalls.length).toBeGreaterThanOrEqual(2);
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByText(/fix argument errors before sending/i)).toBeInTheDocument();
    });
    expect(vi.mocked(api.mcpCall).mock.calls.some(([call]) => (call as { method?: string }).method === 'tools/call')).toBe(false);
  });
});
