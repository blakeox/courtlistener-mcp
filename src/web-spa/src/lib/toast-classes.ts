import { cn } from './cn';

/** Tailwind compositions for toast notifications (hook classes preserved for tests). */

export const toastContainerClass = cn(
  'toast-container pointer-events-none fixed bottom-5 right-5 z-[1000] grid max-w-[calc(100vw-40px)] gap-(--space-2)',
  'max-sm:bottom-(--space-2-5) max-sm:left-(--space-2-5) max-sm:right-(--space-2-5) max-sm:max-w-none',
);

const toastToneClass: Record<'ok' | 'error' | 'info', string> = {
  ok: 'toast-ok border border-[color:var(--surface-status-success-border)] bg-[color:var(--surface-status-success-bg)] text-ok',
  error:
    'toast-error border border-[color:var(--surface-status-error-border)] bg-[color:var(--surface-status-error-bg)] text-danger',
  info: 'toast-info border border-border bg-[color:var(--surface-status-info-bg)] text-foreground',
};

export function toastClassName(type: 'ok' | 'error' | 'info'): string {
  return cn(
    'toast pointer-events-auto flex items-center gap-(--space-2) rounded-portal-sm px-4 py-2.5 text-[0.9rem] font-bold shadow-[var(--toast-shadow)]',
    'animate-[toast-in_0.3s_ease-out]',
    toastToneClass[type],
  );
}

export const toastDismissClass =
  'toast-dismiss ml-auto px-0.5 text-[0.85rem] opacity-80 hover:opacity-100';
