import React from 'react';
import { toastClassName, toastContainerClass, toastDismissClass } from '../lib/toast-classes';
import { IconButton } from './ui';
import { ToastContext } from './toast-context';

interface ToastItem {
  id: number;
  message: string;
  type: 'ok' | 'error' | 'info';
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const timersRef = React.useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  React.useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  const toast = React.useCallback((message: string, type: 'ok' | 'error' | 'info' = 'info') => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, message, type }]);
    const timer = setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
      timersRef.current.delete(timer);
    }, 4000);
    timersRef.current.add(timer);
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={toastContainerClass} aria-live="polite" role="status">
        {items.map((item) => (
          <div key={item.id} className={toastClassName(item.type)}>
            <span>{item.message}</span>
            <IconButton
              chrome="inline"
              className={toastDismissClass}
              onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
              aria-label="Dismiss notification"
            >
              ✕
            </IconButton>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export { useToast } from './toast-context';
