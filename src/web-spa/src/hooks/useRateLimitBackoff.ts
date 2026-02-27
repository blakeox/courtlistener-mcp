import React from 'react';
import type { ApiError } from '../lib/types';

/**
 * Returns a backoff state derived from an ApiError's retry_after_seconds.
 * While blocked, `blocked` is true and `secondsLeft` counts down.
 */
export function useRateLimitBackoff(): {
  blocked: boolean;
  secondsLeft: number;
  trigger: (error: unknown) => void;
} {
  const [secondsLeft, setSecondsLeft] = React.useState(0);

  React.useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft > 0]);

  const trigger = React.useCallback((error: unknown) => {
    const candidate = error as ApiError | undefined;
    if (candidate?.retry_after_seconds && Number.isFinite(candidate.retry_after_seconds)) {
      setSecondsLeft(Math.ceil(candidate.retry_after_seconds));
    }
  }, []);

  return { blocked: secondsLeft > 0, secondsLeft, trigger };
}
