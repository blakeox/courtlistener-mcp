import React from 'react';

export interface ToastContextValue {
  toast: (message: string, type?: 'ok' | 'error' | 'info') => void;
}

export const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = React.useContext(ToastContext);
  if (!value) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return value;
}
