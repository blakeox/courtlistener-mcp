import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokenProvider } from '../lib/token-context';
import { ToastProvider } from '../components/Toast';

// Mock the API module to avoid real fetches
vi.mock('../lib/api', () => ({
  getSession: vi.fn().mockResolvedValue({ authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' }),
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
});

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders dashboard card', async () => {
    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows account status', async () => {
    const { OnboardingPage } = await import('../pages/OnboardingPage');
    render(<OnboardingPage />, { wrapper: Wrapper });
    expect(screen.getByText(/logged in/i)).toBeInTheDocument();
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

  it('renders "Bearer token" heading', async () => {
    const { KeysPage } = await import('../pages/KeysPage');
    render(<KeysPage />, { wrapper: Wrapper });
    expect(screen.getByText('Bearer token')).toBeInTheDocument();
  });

  it('shows create key button', async () => {
    const { KeysPage } = await import('../pages/KeysPage');
    render(<KeysPage />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: /create key/i })).toBeInTheDocument();
  });
});

describe('PlaygroundPage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
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
    expect(screen.getByText(/no bearer token set/i)).toBeInTheDocument();
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
});
