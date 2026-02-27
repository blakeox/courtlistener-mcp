function parseHashParams(): URLSearchParams {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  return new URLSearchParams(raw);
}

function parseSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function readRecoveryType(): string {
  const hashType = (parseHashParams().get('type') || '').trim().toLowerCase();
  if (hashType) return hashType;
  return (parseSearchParams().get('type') || '').trim().toLowerCase();
}

export function isRecoveryHash(): boolean {
  if (readRecoveryType() !== 'recovery') return false;
  const hashParams = parseHashParams();
  const searchParams = parseSearchParams();
  const accessToken = (hashParams.get('access_token') || searchParams.get('access_token') || '').trim();
  const tokenHash = (searchParams.get('token_hash') || hashParams.get('token_hash') || '').trim();
  return Boolean(accessToken || tokenHash);
}

export function getRecoveryToken(): string {
  const params = parseHashParams();
  const flowType = readRecoveryType();
  const tokenType = (params.get('token_type') || '').trim().toLowerCase();
  const searchAccessToken = (parseSearchParams().get('access_token') || '').trim();
  const accessToken = (params.get('access_token') || searchAccessToken).trim();
  if (flowType !== 'recovery') return '';
  if (!accessToken) return '';
  if (tokenType && tokenType !== 'bearer') return '';
  return accessToken;
}

export function getRecoveryTokenHash(): string {
  const flowType = readRecoveryType();
  if (flowType !== 'recovery') return '';
  const searchParams = parseSearchParams();
  const hashParams = parseHashParams();
  return (searchParams.get('token_hash') || hashParams.get('token_hash') || '').trim();
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
  const hashParams = parseHashParams();
  const searchParams = parseSearchParams();
  const recoverySearch = new URLSearchParams();
  const recoveryHash = new URLSearchParams();

  const tokenHash = (searchParams.get('token_hash') || hashParams.get('token_hash') || '').trim();
  const accessToken = (hashParams.get('access_token') || searchParams.get('access_token') || '').trim();
  const tokenType = (hashParams.get('token_type') || '').trim();

  if (tokenHash) recoverySearch.set('token_hash', tokenHash);
  if (tokenHash) recoverySearch.set('type', 'recovery');

  if (accessToken) recoveryHash.set('access_token', accessToken);
  if (tokenType) recoveryHash.set('token_type', tokenType);
  if (accessToken) recoveryHash.set('type', 'recovery');

  const search = recoverySearch.toString();
  const hash = recoveryHash.toString();
  const target = `/app/reset-password${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`;
  window.location.replace(target);
}
