const TOKEN_LOCAL_KEY = 'courtlistenerMcpApiToken';
const TOKEN_SESSION_KEY = 'courtlistenerMcpApiTokenSession';

export function readToken(): string {
  return sessionStorage.getItem(TOKEN_SESSION_KEY) || localStorage.getItem(TOKEN_LOCAL_KEY) || '';
}

export function saveToken(token: string, persist: boolean): void {
  if (!token.trim()) return;
  if (persist) {
    localStorage.setItem(TOKEN_LOCAL_KEY, token.trim());
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    return;
  }
  sessionStorage.setItem(TOKEN_SESSION_KEY, token.trim());
  localStorage.removeItem(TOKEN_LOCAL_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_LOCAL_KEY);
  sessionStorage.removeItem(TOKEN_SESSION_KEY);
}

export function isPersistedToken(): boolean {
  return Boolean(localStorage.getItem(TOKEN_LOCAL_KEY));
}
