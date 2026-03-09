import { MCP_ORIGIN } from './config';

export interface AuthStartReturnTarget {
  value: string;
  isExplicit: boolean;
}

function canonicalizeHostedAuthorizeUrl(url: URL): string {
  if (url.pathname !== '/authorize') {
    return url.toString();
  }

  const canonical = new URL(url.pathname + url.search + url.hash, MCP_ORIGIN);
  return canonical.toString();
}

export function isDirectOauthReturnTarget(returnTo: string): boolean {
  try {
    const url = new URL(returnTo);
    return url.origin === MCP_ORIGIN && url.pathname === '/authorize';
  } catch {
    return false;
  }
}

export function resolveAuthStartReturnTarget(raw: string | null): AuthStartReturnTarget {
  const value = (raw || '').trim();
  if (!value) {
    return { value: '/', isExplicit: false };
  }
  if (value.startsWith('/')) {
    if (value === '/authorize' || value.startsWith('/authorize?')) {
      return { value: new URL(value, MCP_ORIGIN).toString(), isExplicit: true };
    }
    return { value, isExplicit: true };
  }
  try {
    return { value: canonicalizeHostedAuthorizeUrl(new URL(value)), isExplicit: true };
  } catch {
    return { value: '/', isExplicit: true };
  }
}
