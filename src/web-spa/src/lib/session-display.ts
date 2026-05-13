import type { AuthSessionResponse } from './types';

export function getSessionDisplayLabel(
  user: AuthSessionResponse['user'],
  fallback = 'Research operator',
): string {
  return user?.email?.trim() || user?.displayName?.trim() || user?.id || fallback;
}
