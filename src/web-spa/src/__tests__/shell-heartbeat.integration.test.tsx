import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TokenProvider } from '../lib/token-context';
import { ToastProvider } from '../components/Toast';
import { Shell } from '../components/Shell';
import { createMatchMediaMock, stubBrowserStorage } from './test-utils';

const {
  getSessionMock,
  useAuthMock,
  useColorSchemeMock,
  useNetworkStatusMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  useAuthMock: vi.fn(),
  useColorSchemeMock: vi.fn(),
  useNetworkStatusMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  getSession: getSessionMock,
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

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderShell(initialEntry = '/app/playground'): void {
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

describe('Shell heartbeat integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    stubBrowserStorage();
    vi.stubGlobal('matchMedia', createMatchMediaMock());
    useColorSchemeMock.mockReturnValue({ scheme: 'light', toggle: vi.fn() });
    useNetworkStatusMock.mockReturnValue({ online: true });
    useAuthMock.mockReturnValue({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      logout: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('clears the local token, shows recovery UI, and navigates to account when heartbeat detects expiry', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'token-123');
    getSessionMock.mockResolvedValue({ authenticated: false, user: null, turnstile_site_key: '' });

    renderShell();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('courtlistenerMcpApiTokenSession')).toBeNull();
    expect(screen.getByText('Session expired — review account status.')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/account');
  });

  it('keeps the operator in place when the heartbeat request fails', async () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'token-123');
    getSessionMock.mockRejectedValue(new Error('network failed'));

    renderShell();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('courtlistenerMcpApiTokenSession')).toBe('token-123');
    expect(screen.queryByText('Session expired — review account status.')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/playground');
  });

  it('does not poll session state when the browser session is already signed out', async () => {
    useAuthMock.mockReturnValue({
      session: { authenticated: false, user: null, turnstile_site_key: '' },
      loading: false,
      logout: vi.fn(),
    });

    renderShell('/app/control-center');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    });

    expect(getSessionMock).not.toHaveBeenCalled();
  });
});
