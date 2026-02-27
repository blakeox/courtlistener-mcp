import React from 'react';
import { readToken, saveToken, clearToken, isPersistedToken } from './storage';

interface TokenContextValue {
  token: string;
  persisted: boolean;
  setToken: (token: string, persist: boolean) => void;
  clear: () => void;
}

const TokenContext = React.createContext<TokenContextValue | null>(null);

export function TokenProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [token, setTokenState] = React.useState(() => readToken());
  const [persisted, setPersisted] = React.useState(() => isPersistedToken());

  const setToken = React.useCallback((value: string, persist: boolean) => {
    saveToken(value, persist);
    setTokenState(value);
    setPersisted(persist);
  }, []);

  const clear = React.useCallback(() => {
    clearToken();
    setTokenState('');
    setPersisted(false);
  }, []);

  const value = React.useMemo<TokenContextValue>(
    () => ({ token, persisted, setToken, clear }),
    [token, persisted, setToken, clear],
  );

  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

export function useToken(): TokenContextValue {
  const value = React.useContext(TokenContext);
  if (!value) {
    throw new Error('useToken must be used within TokenProvider');
  }
  return value;
}
