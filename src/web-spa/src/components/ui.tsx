import React from 'react';
import { Link } from 'react-router-dom';

export function Card(props: React.PropsWithChildren<{ title?: string; subtitle?: string; className?: string }>): React.JSX.Element {
  return (
    <section className={`ui-card ${props.className ?? ''}`}>
      {props.title ? <h2>{props.title}</h2> : null}
      {props.subtitle ? <p className="muted">{props.subtitle}</p> : null}
      {props.children}
    </section>
  );
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' },
): React.JSX.Element {
  const variant = props.variant ?? 'primary';
  return (
    <button type="button" {...props} className={`btn ${variant} ${props.className ?? ''}`.trim()}>
      {props.children}
    </button>
  );
}

export function StatusBanner(props: {
  role?: 'status' | 'alert';
  message: string;
  type?: 'ok' | 'error' | 'info';
  id?: string;
}): React.JSX.Element | null {
  if (!props.message) return null;
  const role = props.role ?? 'status';
  return (
    <div
      id={props.id}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      className={`status ${props.type ?? 'info'}`}
    >
      {props.message}
    </div>
  );
}

export function FormField(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const describedBy = [props.hint ? `${props.id}-hint` : '', props.error ? `${props.id}-error` : '']
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <div aria-describedby={describedBy} aria-invalid={props.error ? true : undefined}>
        {props.children}
      </div>
      {props.hint ? (
        <div id={`${props.id}-hint`} className="hint">
          {props.hint}
        </div>
      ) : null}
      {props.error ? (
        <div id={`${props.id}-error`} role="alert" className="field-error">
          {props.error}
        </div>
      ) : null}
    </div>
  );
}

export function Stepper(props: {
  steps: Array<{ label: string; complete: boolean; active?: boolean; to?: string; disabled?: boolean }>;
}): React.JSX.Element {
  return (
    <ol className="stepper" aria-label="Setup progress">
      {props.steps.map((step, index) => {
        const cls = step.active ? 'active' : step.complete ? 'done' : step.disabled ? 'disabled' : '';
        const icon = step.complete ? '✓' : `${index + 1}`;
        const content = (
          <>
            <span className="stepper-icon" aria-label={step.complete ? 'Completed' : `Step ${index + 1}`}>{icon}</span>
            <span>{step.label}</span>
          </>
        );
        return (
          <li key={step.label} className={cls}>
            {step.to && !step.disabled ? (
              <Link to={step.to}>{content}</Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input {...props} />;
}

export function Modal(props: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}): React.JSX.Element | null {
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      dialog.showModal();
    } else if (!props.open && dialog.open) {
      dialog.close();
    }
  }, [props.open]);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = () => props.onClose();
    dialog.addEventListener('close', handler);
    return () => dialog.removeEventListener('close', handler);
  }, [props.onClose]);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) focusable[0].focus();

    function trapFocus(e: KeyboardEvent): void {
      if (e.key !== 'Tab' || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    dialog.addEventListener('keydown', trapFocus);
    return () => dialog.removeEventListener('keydown', trapFocus);
  });

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-label={props.title}
    >
      <div className="row between">
        <h3>{props.title}</h3>
        <button type="button" className="icon-btn" aria-label="Close dialog" onClick={props.onClose}>
          ✕
        </button>
      </div>
      {props.children}
    </dialog>
  );
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
