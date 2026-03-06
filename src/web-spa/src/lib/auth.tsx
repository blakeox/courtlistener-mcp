import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSession, logout } from './api';
import { sessionQueryKey } from './query-keys';
import { clearToken } from './storage';
import type { AuthSessionResponse } from './types';

interface AuthContextValue {
  session: AuthSessionResponse | undefined;
  loading: boolean;
  sessionReady: boolean;
  sessionError: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: sessionQueryKey,
    queryFn: getSession,
  });
  const sessionError = React.useMemo(() => {
    if (!sessionQuery.isError) return '';
    const err = sessionQuery.error as { message?: string; error?: string };
    if (typeof err?.message === 'string' && err.message.trim()) return err.message;
    if (typeof err?.error === 'string' && err.error.trim()) return err.error;
    return 'Unable to verify session with server.';
  }, [sessionQuery.error, sessionQuery.isError]);

  const value = React.useMemo<AuthContextValue>(() => ({
    session: sessionQuery.data,
    loading: sessionQuery.isLoading,
    sessionReady: sessionQuery.status !== 'pending',
    sessionError,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
    logout: async () => {
      try {
        await logout();
      } catch {
        // Cloudflare hard-cut mode may not expose a server-side logout route.
      }
      clearToken();
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  }), [queryClient, sessionError, sessionQuery.data, sessionQuery.isLoading, sessionQuery.status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = React.useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
