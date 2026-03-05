import type { ApiError } from './types';

type OperationalStatusType = 'ok' | 'error' | 'info';

interface OperationalStatusPayload {
  message: string;
  type: OperationalStatusType;
}

const OPERATIONAL_STATUS_KEY = 'clmcp_operational_status';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function rememberOperationalStatus(message: string, type: OperationalStatusType = 'info'): void {
  if (!canUseStorage() || !message.trim()) return;
  try {
    window.sessionStorage.setItem(OPERATIONAL_STATUS_KEY, JSON.stringify({ message, type }));
  } catch {
    // Ignore storage errors.
  }
}

export function consumeOperationalStatus(): OperationalStatusPayload | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(OPERATIONAL_STATUS_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(OPERATIONAL_STATUS_KEY);
    const parsed = JSON.parse(raw) as { message?: unknown; type?: unknown };
    if (typeof parsed.message !== 'string' || !parsed.message.trim()) return null;
    const type = parsed.type === 'ok' || parsed.type === 'error' || parsed.type === 'info' ? parsed.type : 'info';
    return { message: parsed.message, type };
  } catch {
    return null;
  }
}

export function withRecoveryHint(error: unknown, baseMessage: string): string {
  const candidate = error as ApiError | undefined;
  if (candidate?.retry_after_seconds && Number.isFinite(candidate.retry_after_seconds)) {
    return `${baseMessage} Wait for the retry timer and try again.`;
  }
  if (candidate?.status === 429) {
    return `${baseMessage} Too many requests right now; wait briefly and retry.`;
  }
  if (typeof candidate?.status === 'number' && candidate.status >= 500) {
    return `${baseMessage} Possible service incident; wait a minute, then retry.`;
  }
  return baseMessage;
}

export function shouldCarryOperationalStatus(error: unknown, message: string): boolean {
  const candidate = error as ApiError | undefined;
  if (candidate?.retry_after_seconds && Number.isFinite(candidate.retry_after_seconds)) return true;
  if (candidate?.status === 429) return true;
  if (typeof candidate?.status === 'number' && candidate.status >= 500) return true;
  const normalized = message.toLowerCase();
  return normalized.includes('service incident') || (normalized.includes('wait') && normalized.includes('retry'));
}
