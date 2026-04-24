import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TokenProvider } from '../lib/token-context';
import { ToastProvider } from '../components/Toast';
import { stubBrowserStorage } from './test-utils';

const {
  useAuthMock,
  useColorSchemeMock,
  useNetworkStatusMock,
  useSessionHeartbeatMock,
} = vi.hoisted(() => ({
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

function renderShell(initialEntry = '/app/control-center'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TokenProvider>
        <ToastProvider>
          <Routes>
            <Route
              path="*"
              element={(
                <>
                  <Shell
                    steps={[
                      { label: 'Operator session', complete: false, to: '/app/account' },
                      { label: 'Local MCP credential loaded', complete: false, to: '/app/control-center' },
                    ]}
                  >
                    <div>Shell body</div>
                  </Shell>
                  <LocationProbe />
                </>
              )}
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
              element={(
                <>
                  <AuthRequired>
                    <div>Protected body</div>
                  </AuthRequired>
                  <LocationProbe />
                </>
              )}
            />
            <Route
              path="/app/control-center"
              element={(
                <>
                  <div>Control center</div>
                  <LocationProbe />
                </>
              )}
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

    await waitFor(() => {
      expect(sessionStorage.getItem('courtlistenerMcpApiTokenSession')).toBeNull();
      expect(screen.queryByText(/session recovery:/i)).not.toBeInTheDocument();
      expect(screen.getByText('Stored local credential cleared')).toBeInTheDocument();
    });
  });

  it('clears the token, shows a toast, and navigates to account when the session heartbeat expires', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'token-123');
    let onExpired: (() => void) | undefined;
    useAuthMock.mockReturnValue({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      logout: vi.fn(),
    });
    useSessionHeartbeatMock.mockImplementation((_interval: number, options: { enabled: boolean; onExpired: () => void }) => {
      onExpired = options.onExpired;
    });

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

  it('preserves local token and keeps the operator on the current page when topbar logout rejects', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'token-123');
    const logoutMock = vi.fn().mockRejectedValue(new Error('network failed'));
    useAuthMock.mockReturnValue({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      logout: logoutMock,
    });

    renderShell('/app/account');

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
