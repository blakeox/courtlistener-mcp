import React from 'react';

/** Returns a ref to attach to a scrollable container. Scrolls to bottom whenever `deps` change. */
export function useAutoScroll<T extends HTMLElement>(deps: unknown[]): React.RefObject<T | null> {
  const ref = React.useRef<T | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, deps);

  return ref;
}
