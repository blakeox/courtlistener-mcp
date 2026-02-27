import React from 'react';
import { getSession } from '../lib/api';

/**
 * Periodically checks session validity. Calls `onExpired` if the session
 * becomes unauthenticated while the user is active.
 */
export function useSessionHeartbeat(
  intervalMs: number,
  options: { enabled: boolean; onExpired: () => void },
): void {
  const onExpiredRef = React.useRef(options.onExpired);
  onExpiredRef.current = options.onExpired;

  React.useEffect(() => {
    if (!options.enabled || intervalMs <= 0) return;

    const id = setInterval(async () => {
      try {
        const session = await getSession();
        if (!session.authenticated) {
          onExpiredRef.current();
        }
      } catch {
        // Network error — don't treat as session expiry
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs, options.enabled]);
}
