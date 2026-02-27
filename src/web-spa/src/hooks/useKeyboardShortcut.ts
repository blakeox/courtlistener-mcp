import React from 'react';

/**
 * Calls `handler` when the given key combo is pressed.
 * @param key - The key to listen for (e.g. 'Enter')
 * @param handler - Callback to invoke
 * @param options - modifier keys: meta (Cmd/Win), ctrl, shift
 */
export function useKeyboardShortcut(
  key: string,
  handler: () => void,
  options: { meta?: boolean; ctrl?: boolean; shift?: boolean; disabled?: boolean } = {},
): void {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    if (options.disabled) return;

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== key) return;
      if (options.meta && !e.metaKey) return;
      if (options.ctrl && !e.ctrlKey) return;
      if (options.shift && !e.shiftKey) return;
      // Require at least one modifier to avoid hijacking normal typing
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      handlerRef.current();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, options.meta, options.ctrl, options.shift, options.disabled]);
}
