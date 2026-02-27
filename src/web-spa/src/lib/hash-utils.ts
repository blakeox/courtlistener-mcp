function parseHashParams(): URLSearchParams {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  return new URLSearchParams(raw);
}

export function isRecoveryHash(): boolean {
  const params = parseHashParams();
  const flowType = (params.get('type') || '').trim().toLowerCase();
  const accessToken = (params.get('access_token') || '').trim();
  return flowType === 'recovery' && Boolean(accessToken);
}

export function getRecoveryToken(): string {
  const params = parseHashParams();
  const flowType = (params.get('type') || '').trim().toLowerCase();
  const tokenType = (params.get('token_type') || '').trim().toLowerCase();
  const accessToken = (params.get('access_token') || '').trim();
  if (flowType !== 'recovery') return '';
  if (!accessToken) return '';
  if (tokenType && tokenType !== 'bearer') return '';
  return accessToken;
}

export function readLoginHashToken(): string {
  const params = parseHashParams();
  const accessToken = (params.get('access_token') || '').trim();
  const tokenType = (params.get('token_type') || '').trim().toLowerCase();
  const flowType = (params.get('type') || '').trim().toLowerCase();
  if (flowType === 'recovery') return '';
  if (!accessToken) return '';
  if (tokenType && tokenType !== 'bearer') return '';
  return accessToken;
}

/** Pre-render redirect: if current URL has a recovery hash, redirect to /app/reset-password. */
export function redirectRecoveryHashToResetPage(): void {
  if (!isRecoveryHash()) return;
  if (window.location.pathname === '/app/reset-password') return;
  const params = parseHashParams();
  const safeParams = new URLSearchParams();
  const accessToken = params.get('access_token');
  const tokenType = params.get('token_type');
  if (accessToken) safeParams.set('access_token', accessToken);
  if (tokenType) safeParams.set('token_type', tokenType);
  safeParams.set('type', 'recovery');
  window.location.replace(`/app/reset-password#${safeParams.toString()}`);
}
