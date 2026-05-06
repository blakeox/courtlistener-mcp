import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { App } from '../App';
import { createMatchMediaMock, renderWithSpaProviders, stubBrowserStorage } from './test-utils';

vi.mock('../lib/hosted-auth', () => ({
  buildHostedAuthStartHref: vi.fn().mockReturnValue('/auth/start?return_to=%2Fapp%2Faccount'),
  redirectToHostedAuth: vi.fn(),
}));

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
  }),
  listKeys: vi.fn().mockResolvedValue({ user_id: 'u1', keys: [] }),
  logout: vi.fn().mockResolvedValue(undefined),
  createKey: vi.fn().mockResolvedValue({
    message: 'ok',
    api_key: { id: 'k1', label: 'test', created_at: '2024-01-01', expires_at: null, token: 'tok' },
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

vi.mock('../lib/telemetry', () => ({
  trackEvent: vi.fn(),
  markSignupStarted: vi.fn(),
  markFirstMcpSuccess: vi.fn(),
}));

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

function renderApp(initialEntry: string): void {
  renderWithSpaProviders(<App />, { initialEntries: [initialEntry] });
}

describe('App auth routing', () => {
  beforeEach(async () => {
    stubBrowserStorage();
    vi.stubGlobal('matchMedia', createMatchMediaMock());
    vi.clearAllMocks();
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValue({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects /app/login into hosted auth', async () => {
    renderApp('/app/login');
    const hostedAuth = await import('../lib/hosted-auth');
    expect(await screen.findByText('Redirecting to sign in')).toBeInTheDocument();
    await waitFor(() => {
      expect(hostedAuth.redirectToHostedAuth).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('link', { name: /continue to hosted auth/i })).toHaveAttribute(
      'href',
      '/auth/start?return_to=%2Fapp%2Faccount',
    );
  });

  it('redirects /app/signup into hosted auth', async () => {
    renderApp('/app/signup');
    const hostedAuth = await import('../lib/hosted-auth');
    expect(await screen.findByText('Redirecting to sign in')).toBeInTheDocument();
    await waitFor(() => {
      expect(hostedAuth.redirectToHostedAuth).toHaveBeenCalledTimes(1);
    });
  });

  it('redirects /app/reset-password into hosted auth', async () => {
    renderApp('/app/reset-password');
    const hostedAuth = await import('../lib/hosted-auth');
    expect(await screen.findByText('Redirecting to sign in')).toBeInTheDocument();
    await waitFor(() => {
      expect(hostedAuth.redirectToHostedAuth).toHaveBeenCalledTimes(1);
    });
  });

  it('redirects /app/keys to the credentials page', async () => {
    renderApp('/app/keys');
    expect(
      await screen.findByRole('heading', { name: 'Credentials & Providers', level: 2 }),
    ).toBeInTheDocument();
  });

  it('renders the public landing page on /', async () => {
    renderApp('/');
    expect(
      await screen.findByRole('heading', {
        name: /connect ai to the law\. responsibly\./i,
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /account/i })[0]).toHaveAttribute(
      'href',
      '/app/account',
    );
    expect(screen.getAllByRole('link', { name: /^sign in$/i })[0]).toHaveAttribute(
      'href',
      '/auth/start?return_to=%2Fapp%2Faccount',
    );
    expect(screen.queryByText(/operator console/i)).not.toBeInTheDocument();
  });

  it('redirects /account to the operator session route', async () => {
    renderApp('/account');
    expect(
      await screen.findByRole('heading', { name: 'Session Control', level: 1 }),
    ).toBeInTheDocument();
  });

  it('shows a primary sign-in entry when signed out on /app/control-center', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValue({
      session: { authenticated: false, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      sessionReady: true,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });

    renderApp('/app/control-center');

    expect(
      await screen.findByRole('heading', { name: /Agent Workspace/i, level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^sign in$/i })[0]).toHaveAttribute(
      'href',
      '/auth/start?return_to=%2Fapp%2Faccount',
    );
    expect(screen.queryByRole('link', { name: /legacy handoff/i })).not.toBeInTheDocument();
  });

  it('waits for auth state before redirecting unknown routes', async () => {
    const auth = await import('../lib/auth');
    vi.mocked(auth.useAuth).mockReturnValue({
      session: undefined,
      loading: true,
      sessionReady: false,
      sessionError: '',
      refresh: vi.fn(),
      logout: vi.fn(),
    });

    renderApp('/app/unknown');

    expect(await screen.findByLabelText('Loading page')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Session Control', level: 1 }),
    ).not.toBeInTheDocument();
  });

  it('sends authenticated unknown routes to /app/session before diagnostics', async () => {
    renderApp('/app/unknown');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Session Control', level: 1 }),
      ).toBeInTheDocument();
    });
  });
});
