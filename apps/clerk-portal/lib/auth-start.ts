import { MCP_ADDITIONAL_ORIGINS, MCP_ORIGIN } from './config';

export interface AuthStartReturnTarget {
  value: string;
  isExplicit: boolean;
}

const DIRECT_OAUTH_ORIGINS = new Set([MCP_ORIGIN, ...MCP_ADDITIONAL_ORIGINS]);

export function resolveDirectOauthWorkerOrigin(returnTo: string): string | null {
  try {
    const url = new URL(returnTo);
    if (url.pathname !== '/authorize') {
      return null;
    }
    return DIRECT_OAUTH_ORIGINS.has(url.origin) ? url.origin : null;
  } catch {
    return null;
  }
}

export function isDirectOauthReturnTarget(returnTo: string): boolean {
  return resolveDirectOauthWorkerOrigin(returnTo) !== null;
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
    return { value: new URL(value).toString(), isExplicit: true };
  } catch {
    return { value: '/', isExplicit: true };
  }
}
