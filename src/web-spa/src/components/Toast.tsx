import React from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'ok' | 'error' | 'info';
}

interface ToastContextValue {
  toast: (message: string, type?: 'ok' | 'error' | 'info') => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

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
      <div className="toast-container" aria-live="polite" role="status">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.type}`}>
            <span>{item.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = React.useContext(ToastContext);
  if (!value) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return value;
}
