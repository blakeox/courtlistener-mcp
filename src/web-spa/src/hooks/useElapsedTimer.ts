import React from 'react';

/**
 * Returns elapsed seconds since `running` became true.
 * Resets to 0 when `running` becomes false.
 */
export function useElapsedTimer(running: boolean): number {
  const [elapsed, setElapsed] = React.useState(0);
  const startRef = React.useRef(0);

  React.useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    startRef.current = performance.now();
    const id = setInterval(() => {
      setElapsed(Number(((performance.now() - startRef.current) / 1000).toFixed(1)));
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  return elapsed;
}
