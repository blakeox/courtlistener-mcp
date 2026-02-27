import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSession, logout } from './api';
import { clearToken } from './storage';
import type { AuthSessionResponse } from './types';

interface AuthContextValue {
  session: AuthSessionResponse | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: getSession,
  });

  const value = React.useMemo<AuthContextValue>(() => ({
    session: sessionQuery.data,
    loading: sessionQuery.isLoading,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    logout: async () => {
      await logout();
      clearToken();
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  }), [queryClient, sessionQuery.data, sessionQuery.isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = React.useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
