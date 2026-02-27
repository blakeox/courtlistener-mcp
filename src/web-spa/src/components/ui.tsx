import React from 'react';

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
    <button {...props} className={`btn ${variant} ${props.className ?? ''}`.trim()}>
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
    .join(' ');

  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      {React.cloneElement(props.children as React.ReactElement, {
        id: props.id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': props.error ? true : undefined,
      })}
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

export function Stepper(props: { steps: Array<{ label: string; complete: boolean; active?: boolean }> }): React.JSX.Element {
  return (
    <ol className="stepper" aria-label="Setup progress">
      {props.steps.map((step) => (
        <li key={step.label} className={step.active ? 'active' : step.complete ? 'done' : ''}>
          <span>{step.label}</span>
        </li>
      ))}
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
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!props.open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', handler);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', handler);
  }, [props.open, props.onClose]);

  if (!props.open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={props.onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row between">
          <h3>{props.title}</h3>
          <button type="button" className="icon-btn" aria-label="Close dialog" onClick={props.onClose}>
            x
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}
