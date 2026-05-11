import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { RenderResult } from '@testing-library/react';
import { TokenProvider } from '../lib/token-context';
import { ToastProvider } from '../components/Toast';
import {
  createControlledMatchMediaMock,
  createMatchMediaMock,
  stubBrowserStorage,
} from './test-utils';

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
    vi.stubGlobal('matchMedia', createMatchMediaMock(true));
    useColorSchemeMock.mockReturnValue({ scheme: 'light', toggle: vi.fn() });
    useNetworkStatusMock.mockReturnValue({ online: true });
    useSessionHeartbeatMock.mockImplementation(() => {});
    useAuthMock.mockReturnValue({
      session: { authenticated: false, user: null, turnstile_site_key: '' },
      loading: false,
      logout: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('removes the retired collapsed-sidebar preference and leaves desktop collapse disabled', () => {
    localStorage.setItem('clmcp_workspace_sidebar_collapsed', 'true');

    renderShell('/app/playground');

    expect(localStorage.getItem('clmcp_workspace_sidebar_collapsed')).toBeNull();
    expect(screen.queryByRole('button', { name: /collapse sidebar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expand sidebar/i })).not.toBeInTheDocument();
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

  it('keeps both menu and account controls visible on mobile', () => {
    vi.stubGlobal('matchMedia', createMatchMediaMock(false));
    renderShell('/app/playground');

    expect(screen.getByRole('button', { name: /toggle navigation menu/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('closes the mobile drawer and restores body scrolling when the viewport returns to desktop', async () => {
    const controlledMatchMedia = createControlledMatchMediaMock(false);
    vi.stubGlobal('matchMedia', controlledMatchMedia.matchMedia);

    renderShell('/app/playground');

    const menuButton = screen.getByRole('button', { name: /toggle navigation menu/i });
    fireEvent.click(menuButton);

    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.style.overflow).toBe('hidden');

    act(() => {
      controlledMatchMedia.setMatches(true);
    });

    await waitFor(() => {
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      expect(document.body.style.overflow).toBe('');
    });
  });

  it('traps focus inside the mobile drawer when tabbing backwards from the close button', async () => {
    const controlledMatchMedia = createControlledMatchMediaMock(false);
    vi.stubGlobal('matchMedia', controlledMatchMedia.matchMedia);

    renderShell('/app/playground');

    fireEvent.click(screen.getByRole('button', { name: /toggle navigation menu/i }));

    const closeButton = screen.getAllByRole('button', { name: /close navigation menu/i })[1];
    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });

    const brandLink = screen.getByRole('link', { name: /courtlistener mcp/i });
    brandLink.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Credentials' })[0]).toHaveFocus();
    });
  });

  it('reveals the full operate section with a single mobile disclosure', () => {
    vi.stubGlobal('matchMedia', createMatchMediaMock(false));
    renderShell('/app/playground');

    fireEvent.click(screen.getByRole('button', { name: 'Expand Operate section' }));

    expect(screen.getByRole('link', { name: 'Usage' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Observability' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Readiness' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show diagnostics links' }),
    ).not.toBeInTheDocument();
  });

  it('shows desktop nav groups without dead disclosure controls', () => {
    renderShell('/app/playground');

    expect(
      screen.queryByRole('button', { name: 'Expand Operate section' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Expand Setup section' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Readiness' })).toBeInTheDocument();
  });

  it('keeps home separate and shows setup links behind one setup toggle', () => {
    vi.stubGlobal('matchMedia', createMatchMediaMock(false));
    renderShell('/app/playground');

    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connect' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Docs/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Setup section' }));

    expect(screen.getByRole('link', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Docs/i })).toHaveAttribute(
      'href',
      'https://github.com/blakeox/courtlistener-mcp#readme',
    );
  });

  it('prioritizes work routes for returning operators', () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'token-123');

    const { container } = renderShell('/app/playground');
    const groupLabels = Array.from(container.querySelectorAll('.menu-group-label')).map((label) =>
      label.textContent?.trim(),
    );

    expect(groupLabels).toEqual(['Home', 'Work', 'Operate']);
    expect(screen.getByText('Setup & help')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect' })).toBeInTheDocument();
  });

  it('keeps docs access out of the topbar and inside setup navigation', () => {
    renderShell('/app/playground');

    expect(screen.queryByRole('link', { name: /open docs/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Docs/i })).toHaveAttribute(
      'href',
      'https://github.com/blakeox/courtlistener-mcp#readme',
    );
  });

  it('surfaces session repair state on the account trigger', () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'token-123');

    renderShell('/app/playground');

    expect(screen.getByRole('button', { name: /Fix session/i })).toBeInTheDocument();
  });

  it('carries the session repair state into the account panel', () => {
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'token-123');

    renderShell('/app/playground');

    fireEvent.click(screen.getByRole('button', { name: /Fix session/i }));

    const accountMenu = screen.getByRole('group', { name: 'Account panel' });
    expect(within(accountMenu).getByText('Session repair')).toBeInTheDocument();
    expect(within(accountMenu).getByText('Session repair needed')).toBeInTheDocument();
    expect(
      within(accountMenu).getByText(
        'Browser session is signed out, but a local MCP credential is still stored on this device.',
      ),
    ).toBeInTheDocument();
    expect(
      within(accountMenu).getByRole('link', { name: 'Sign in to repair session' }),
    ).toBeInTheDocument();
  });

  it('keeps session and credential links visible in the shell utility section', () => {
    renderShell('/app/playground');

    expect(screen.getByText('Workspace utilities')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Session' })[0]).toHaveAttribute(
      'href',
      '/app/session',
    );
    expect(screen.getAllByRole('link', { name: 'Credentials' })[0]).toHaveAttribute(
      'href',
      '/app/credentials',
    );
  });

  it('opens the account menu with a status block above the primary action', async () => {
    renderShell('/app/playground');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const accountMenu = screen.getByRole('group', { name: 'Account panel' });
    expect(accountMenu).toBeInTheDocument();
    expect(within(accountMenu).getByText('Account status')).toBeInTheDocument();
    expect(within(accountMenu).getByText('Signed out')).toBeInTheDocument();
    expect(
      within(accountMenu).getByText('No local credential loaded on this device.'),
    ).toBeInTheDocument();
    expect(within(accountMenu).getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(within(accountMenu).queryByRole('link', { name: 'Session' })).not.toBeInTheDocument();
    expect(
      within(accountMenu).queryByRole('link', { name: 'Credentials' }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(within(accountMenu).getByRole('link', { name: 'Sign in' })).toHaveFocus();
    });
  });

  it('returns focus to the account trigger when the panel closes with escape', async () => {
    renderShell('/app/playground');

    const accountTrigger = screen.getByRole('button', { name: 'Sign in' });
    fireEvent.click(accountTrigger);
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Account panel' })).not.toBeInTheDocument();
      expect(accountTrigger).toHaveFocus();
    });
  });

  it('returns focus to the account trigger when the panel closes from an outside click', async () => {
    renderShell('/app/playground');

    const accountTrigger = screen.getByRole('button', { name: 'Sign in' });
    fireEvent.click(accountTrigger);
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Account panel' })).not.toBeInTheDocument();
      expect(accountTrigger).toHaveFocus();
    });
  });

  it('lets route navigation move focus to main content when the account panel closes', async () => {
    useAuthMock.mockReturnValue({
      session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
      loading: false,
      logout: vi.fn(),
    });
    renderShell('/app/playground');

    fireEvent.click(screen.getByRole('button', { name: 'Session' }));

    const accountMenu = screen.getByRole('group', { name: 'Account panel' });
    fireEvent.click(within(accountMenu).getByRole('link', { name: 'Manage session' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/app/session');
      expect(screen.queryByRole('group', { name: 'Account panel' })).not.toBeInTheDocument();
      expect(screen.getByRole('main')).toHaveFocus();
    });
  });

  it('shows the current workspace label in the topbar context', () => {
    renderShell('/app/playground');

    const context = screen.getByLabelText('Current workspace route');
    expect(within(context).getByText('Playground')).toBeInTheDocument();
    expect(within(context).getByText('Test tools.')).toBeInTheDocument();
  });

  it('keeps the theme toggle reachable from the topbar', () => {
    const toggleThemeMock = vi.fn();
    useColorSchemeMock.mockReturnValue({ scheme: 'light', toggle: toggleThemeMock });

    renderShell('/app/playground');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(toggleThemeMock).toHaveBeenCalledTimes(1);
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

    fireEvent.click(screen.getByRole('button', { name: 'Session' }));
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
    vi.stubGlobal('matchMedia', createMatchMediaMock(true));
    useColorSchemeMock.mockReturnValue({ scheme: 'light', toggle: vi.fn() });
    useNetworkStatusMock.mockReturnValue({ online: true });
    useSessionHeartbeatMock.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
