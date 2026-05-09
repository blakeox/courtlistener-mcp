import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { RenderResult } from '@testing-library/react';
import { TokenProvider } from '../lib/token-context';
import { ToastProvider } from '../components/Toast';
import { stubBrowserStorage } from './test-utils';

const { useAuthMock, useColorSchemeMock, useNetworkStatusMock, useSessionHeartbeatMock } =
  vi.hoisted(() => ({
    useAuthMock: vi.fn(),
    useColorSchemeMock: vi.fn(),
    useNetworkStatusMock: vi.fn(),
    useSessionHeartbeatMock: vi.fn(),
  }));

vi.mock('../lib/auth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('../hooks/useColorScheme', () => ({
  useColorScheme: useColorSchemeMock,
}));

vi.mock('../hooks/useNetworkStatus', () => ({
  useNetworkStatus: useNetworkStatusMock,
}));

vi.mock('../hooks/useSessionHeartbeat', () => ({
  useSessionHeartbeat: useSessionHeartbeatMock,
}));

import { AuthRequired, Shell } from '../components/Shell';

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderShell(initialEntry = '/app/control-center'): RenderResult {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TokenProvider>
        <ToastProvider>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <Shell
                    steps={[
                      { label: 'Operator session', complete: false, to: '/app/account' },
                      {
                        label: 'Local MCP credential loaded',
                        complete: false,
                        to: '/app/control-center',
                      },
                    ]}
                  >
                    <div>Shell body</div>
                  </Shell>
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </ToastProvider>
      </TokenProvider>
    </MemoryRouter>,
  );
}

function renderAuthRequired(initialEntry = '/app/account'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TokenProvider>
        <ToastProvider>
          <Routes>
            <Route
              path="/app/account"
              element={
                <>
                  <AuthRequired>
                    <div>Protected body</div>
                  </AuthRequired>
                  <LocationProbe />
                </>
              }
            />
            <Route
              path="/app/control-center"
              element={
                <>
                  <div>Control center</div>
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </ToastProvider>
      </TokenProvider>
    </MemoryRouter>,
  );
}

describe('Shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubBrowserStorage();
    useColorSchemeMock.mockReturnValue({ scheme: 'light', toggle: vi.fn() });
    useNetworkStatusMock.mockReturnValue({ online: true });
    useSessionHeartbeatMock.mockImplementation(() => {});
    useAuthMock.mockReturnValue({
      session: { authenticated: false, user: null, turnstile_site_key: '' },
      loading: false,
      logout: vi.fn(),
    });
  });

  it('shows session recovery actions and clears the stored credential from the shell banner', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'token-123');

    renderShell();

    expect(screen.getByText(/session recovery:/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear local credential' }));

    await waitFor(
      () => {
        expect(sessionStorage.getItem('courtlistenerMcpApiTokenSession')).toBeNull();
        expect(screen.queryByText(/session recovery:/i)).not.toBeInTheDocument();
        expect(screen.getByText('Stored local credential cleared')).toBeInTheDocument();
      },
      { timeout: 10000 },
    );
  });

  it('clears the token, shows a toast, and navigates to account when the session heartbeat expires', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'token-123');
    let onExpired: (() => void) | undefined;
    useAuthMock.mockReturnValue({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      logout: vi.fn(),
    });
    useSessionHeartbeatMock.mockImplementation(
      (_interval: number, options: { enabled: boolean; onExpired: () => void }) => {
        onExpired = options.onExpired;
      },
    );

    renderShell('/app/playground');

    act(() => {
      onExpired?.();
    });

    await waitFor(() => {
      expect(sessionStorage.getItem('courtlistenerMcpApiTokenSession')).toBeNull();
      expect(screen.getByText('Session expired — review account status.')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent('/app/account');
    });
  });

  it('renders the offline banner when network status reports offline', () => {
    useNetworkStatusMock.mockReturnValue({ online: false });

    renderShell();

    expect(screen.getByText("You're offline — changes may not save.")).toBeInTheDocument();
  });

  it('persists the desktop sidebar collapsed state', () => {
    const firstRender = renderShell('/app/playground');

    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));

    expect(localStorage.getItem('clmcp_workspace_sidebar_collapsed')).toBe('true');
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();

    firstRender.unmount();
    renderShell('/app/playground');

    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Playground' })).toHaveAttribute('title', 'Playground');
  });

  it('opens and closes the mobile navigation drawer affordances', () => {
    renderShell('/app/playground');

    const menuButton = screen.getByRole('button', { name: /toggle navigation menu/i });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menuButton);

    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('button', { name: /close navigation menu/i })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: /close navigation menu/i })[0]);

    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('button', { name: /close navigation menu/i })).toHaveLength(1);
  });

  it('keeps secondary operate links behind a more toggle', () => {
    renderShell('/app/playground');

    fireEvent.click(screen.getByRole('button', { name: 'Expand Operate section' }));

    expect(screen.getByRole('link', { name: 'Usage' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Observability' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Diagnostics' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More routes' }));

    expect(screen.getByRole('link', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Readiness' })).toBeInTheDocument();
  });

  it('keeps secondary setup links behind a setup toggle', () => {
    renderShell('/app/playground');

    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connect' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More setup routes' }));

    expect(screen.getByRole('link', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect' })).toBeInTheDocument();
  });

  it('opens the account menu with status and session links', () => {
    renderShell('/app/playground');

    fireEvent.click(screen.getByRole('button', { name: 'Guest' }));

    const accountMenu = screen.getByRole('menu', { name: 'Account menu' });
    expect(accountMenu).toBeInTheDocument();
    expect(screen.getByText('Signed out')).toBeInTheDocument();
    expect(screen.getByText('No local credential')).toBeInTheDocument();
    expect(within(accountMenu).getByRole('link', { name: 'Session' })).toHaveAttribute(
      'href',
      '/app/session',
    );
    expect(within(accountMenu).getByRole('link', { name: 'Credentials' })).toHaveAttribute(
      'href',
      '/app/credentials',
    );
  });

  it('preserves local token and keeps the operator on the current page when topbar logout rejects', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'token-123');
    const logoutMock = vi.fn().mockRejectedValue(new Error('network failed'));
    useAuthMock.mockReturnValue({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      logout: logoutMock,
    });

    renderShell('/app/account');

    fireEvent.click(screen.getByRole('button', { name: 'u1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem('courtlistenerMcpApiTokenSession')).toBe('token-123');
      expect(screen.getByTestId('location')).toHaveTextContent('/app/account');
      expect(screen.getByText('Logout failed — session is still active.')).toBeInTheDocument();
    });
  });
});

describe('AuthRequired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubBrowserStorage();
    useColorSchemeMock.mockReturnValue({ scheme: 'light', toggle: vi.fn() });
    useNetworkStatusMock.mockReturnValue({ online: true });
    useSessionHeartbeatMock.mockImplementation(() => {});
  });

  it('shows a loading skeleton while auth is still resolving', () => {
    useAuthMock.mockReturnValue({
      session: null,
      loading: true,
      logout: vi.fn(),
    });

    renderAuthRequired();

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('Protected body')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/account');
  });

  it('redirects signed-out users back to the control center', async () => {
    useAuthMock.mockReturnValue({
      session: { authenticated: false, user: null, turnstile_site_key: '' },
      loading: false,
      logout: vi.fn(),
    });

    renderAuthRequired();

    expect(screen.queryByText('Protected body')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Control center')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent('/app/control-center');
    });
  });

  it('renders protected content for authenticated users', () => {
    useAuthMock.mockReturnValue({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      logout: vi.fn(),
    });

    renderAuthRequired();

    expect(screen.getByText('Protected body')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/account');
  });
});
