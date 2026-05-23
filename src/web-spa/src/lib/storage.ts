const TOKEN_LOCAL_KEY = 'courtlistenerMcpApiToken';
const TOKEN_SESSION_KEY = 'courtlistenerMcpApiTokenSession';

export function normalizeMcpCredential(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('Bearer ') ? trimmed.slice(7).trim() : trimmed;
}

export function readToken(): string {
  return sessionStorage.getItem(TOKEN_SESSION_KEY) || localStorage.getItem(TOKEN_LOCAL_KEY) || '';
}

export function saveToken(token: string, persist: boolean): void {
  const normalized = normalizeMcpCredential(token);
  if (!normalized) return;
  if (persist) {
    localStorage.setItem(TOKEN_LOCAL_KEY, normalized);
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    return;
  }
  sessionStorage.setItem(TOKEN_SESSION_KEY, normalized);
  localStorage.removeItem(TOKEN_LOCAL_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_LOCAL_KEY);
  sessionStorage.removeItem(TOKEN_SESSION_KEY);
}

export function isPersistedToken(): boolean {
  return Boolean(localStorage.getItem(TOKEN_LOCAL_KEY));
}
