import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionMock, logoutMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  logoutMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  getSession: getSessionMock,
  logout: logoutMock,
}));

import { AuthProvider, useAuth } from '../lib/auth';
import { renderWithSpaProviders, stubBrowserStorage } from './test-utils';

function TestConsumer(): React.JSX.Element {
  const auth = useAuth();
  const [logoutError, setLogoutError] = React.useState('');

  return (
    <div>
      <div data-testid="status">{auth.session?.user?.id ?? 'none'}</div>
      <div data-testid="ready">{String(auth.sessionReady)}</div>
      <div data-testid="error">{auth.sessionError}</div>
      <div data-testid="logout-error">{logoutError}</div>
      <button onClick={() => void auth.refresh()}>refresh</button>
      <button
        onClick={() =>
          void auth.logout().catch((error: unknown) => {
            setLogoutError(error instanceof Error ? error.message : String(error));
          })
        }
      >
        logout
      </button>
    </div>
  );
}

function renderWithProvider(): void {
  renderWithSpaProviders(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
    { includeRouter: false },
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubBrowserStorage();
    getSessionMock.mockResolvedValue({
      authenticated: true,
      user: { id: 'u1' },
      turnstile_site_key: '',
    });
    logoutMock.mockResolvedValue(undefined);
  });

  it('surfaces the server message as sessionError when getSession fails', async () => {
    getSessionMock.mockRejectedValueOnce({ message: 'Session expired.' });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Session expired.');
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
  });

  it('uses the fallback session error message when the failure has no message', async () => {
    getSessionMock.mockRejectedValueOnce({});

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent(
        'Unable to verify session with server.',
      );
    });
  });

  it('refresh invalidates and re-fetches the session query', async () => {
    getSessionMock
      .mockResolvedValueOnce({ authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' })
      .mockResolvedValueOnce({ authenticated: true, user: { id: 'u2' }, turnstile_site_key: '' });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('u1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('u2');
      expect(getSessionMock).toHaveBeenCalledTimes(2);
    });
  });

  it('preserves local tokens and surfaces the failure when logout rejects', async () => {
    logoutMock.mockRejectedValueOnce(new Error('network failed'));
    localStorage.setItem('courtlistenerMcpApiToken', 'persisted-token');
    sessionStorage.setItem('courtlistenerMcpApiTokenSession', 'session-token');

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('u1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('courtlistenerMcpApiToken')).toBe('persisted-token');
      expect(sessionStorage.getItem('courtlistenerMcpApiTokenSession')).toBe('session-token');
      expect(screen.getByTestId('logout-error')).toHaveTextContent('network failed');
    });
  });
});
