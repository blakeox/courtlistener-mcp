import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { LinkProps, NavLinkProps } from 'react-router-dom';
import { useToast } from './toast-context';

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'default' | 'compact' | 'tiny';
type BadgeTone = 'neutral' | 'ok' | 'warn';

export function Card(
  props: React.PropsWithChildren<{
    title?: string;
    subtitle?: string;
    tone?: 'default' | 'spotlight' | 'app-landing';
    className?: string;
  }>,
): React.JSX.Element {
  const toneClassName =
    props.tone === 'spotlight'
      ? 'card-spotlight'
      : props.tone === 'app-landing'
        ? 'card-app-landing'
        : '';
  return (
    <section className={`ui-card ${toneClassName} ${props.className ?? ''}`.trim()}>
      {props.title ? <h2>{props.title}</h2> : null}
      {props.subtitle ? <p className="muted">{props.subtitle}</p> : null}
      {props.children}
    </section>
  );
}

export function Panel(
  props: React.PropsWithChildren<{
    tone?: 'default' | 'inverse' | 'app-landing';
    className?: string;
  }>,
): React.JSX.Element {
  const toneClassName =
    props.tone === 'inverse' ? 'inverse' : props.tone === 'app-landing' ? 'panel-app-landing' : '';
  return (
    <section className={`panel-card ${toneClassName} ${props.className ?? ''}`.trim()}>
      {props.children}
    </section>
  );
}

export function SectionHeading(
  props: React.PropsWithChildren<{
    eyebrow: React.ReactNode;
    title: React.ReactNode;
    description: React.ReactNode;
    className?: string;
    eyebrowClassName?: string;
  }>,
): React.JSX.Element {
  return (
    <div className={props.className}>
      <Eyebrow className={props.eyebrowClassName}>{props.eyebrow}</Eyebrow>
      <h2>{props.title}</h2>
      <p>{props.description}</p>
      {props.children}
    </div>
  );
}

export function InfoBlock(
  props: React.PropsWithChildren<{
    title: React.ReactNode;
    description?: React.ReactNode;
    eyebrow?: React.ReactNode;
    className?: string;
    eyebrowClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
    titleAs?: 'strong' | 'h2' | 'h3';
  }>,
): React.JSX.Element {
  const TitleTag = props.titleAs ?? 'strong';
  return (
    <div className={['info-block', props.className ?? ''].join(' ').trim()}>
      {props.eyebrow ? <Eyebrow className={props.eyebrowClassName}>{props.eyebrow}</Eyebrow> : null}
      <TitleTag className={props.titleClassName}>{props.title}</TitleTag>
      {props.description ? <p className={props.descriptionClassName}>{props.description}</p> : null}
      {props.children}
    </div>
  );
}

export function FeatureCard(
  props: React.PropsWithChildren<{
    icon: React.ReactNode;
    title: React.ReactNode;
    description: React.ReactNode;
    className?: string;
    iconClassName?: string;
  }>,
): React.JSX.Element {
  return (
    <article className={props.className}>
      <span className={props.iconClassName} aria-hidden="true">
        {props.icon}
      </span>
      <h3>{props.title}</h3>
      <p>{props.description}</p>
      {props.children}
    </article>
  );
}

export function StatCard(
  props: React.PropsWithChildren<{
    label: React.ReactNode;
    value: React.ReactNode;
    className?: string;
    labelClassName?: string;
  }>,
): React.JSX.Element {
  return (
    <article className={props.className}>
      <Eyebrow className={props.labelClassName}>{props.label}</Eyebrow>
      <strong>{props.value}</strong>
      {props.children}
    </article>
  );
}

export function MetricCard(
  props: React.PropsWithChildren<{
    label: React.ReactNode;
    value: React.ReactNode;
    accent?: React.ReactNode;
    className?: string;
  }>,
): React.JSX.Element {
  return (
    <Card className={props.className}>
      <Eyebrow>{props.label}</Eyebrow>
      <strong>{props.value}</strong>
      {props.accent ? <p className="metric-card-accent">{props.accent}</p> : null}
      {props.children}
    </Card>
  );
}

export function ComparisonCard(
  props: React.PropsWithChildren<{
    icon: React.ReactNode;
    title: React.ReactNode;
    badge?: React.ReactNode;
    meta?: React.ReactNode;
    tone?: 'default' | 'mcp';
    size?: 'default' | 'large';
    className?: string;
  }>,
): React.JSX.Element {
  const sizeClassName = props.size === 'large' ? 'comparison-card-lg' : '';
  const toneClassName = props.tone === 'mcp' ? 'comparison-card-mcp' : 'comparison-card-plain';
  const headerSizeClassName = props.size === 'large' ? 'comparison-card-header-lg' : '';
  const iconSizeClassName = props.size === 'large' ? 'comparison-icon-lg' : '';
  const titleSizeClassName = props.size === 'large' ? 'comparison-card-title-lg' : '';

  return (
    <div
      className={['comparison-card', toneClassName, sizeClassName, props.className ?? '']
        .join(' ')
        .trim()}
    >
      <div className={['comparison-card-header', headerSizeClassName].join(' ').trim()}>
        <span className={['comparison-icon', iconSizeClassName].join(' ').trim()}>
          {props.icon}
        </span>
        <strong className={['comparison-card-title', titleSizeClassName].join(' ').trim()}>
          {props.title}
        </strong>
        {props.badge}
      </div>
      {props.meta}
      <div className="comparison-card-body">{props.children}</div>
    </div>
  );
}

export function SkipLink(props: {
  href: string;
  children: React.ReactNode;
  tone?: 'default' | 'landing';
}): React.JSX.Element {
  return (
    <a
      href={props.href}
      className={`skip-link ${props.tone === 'landing' ? 'skip-link-landing' : ''}`.trim()}
    >
      {props.children}
    </a>
  );
}

export function InlineGroup(
  props: React.PropsWithChildren<{
    justify?: 'start' | 'between';
    gap?: 'default' | 'tight' | 'spacious';
    className?: string;
  }>,
): React.JSX.Element {
  const justifyClassName = props.justify === 'between' ? 'between' : '';
  const gapClassName =
    props.gap === 'tight' ? 'row-tight' : props.gap === 'spacious' ? 'row-spacious' : '';
  return (
    <div
      className={['row', justifyClassName, gapClassName, props.className ?? ''].join(' ').trim()}
    >
      {props.children}
    </div>
  );
}

function getSizeClassName(size: ButtonSize): string {
  if (size === 'compact') return 'btn-compact';
  if (size === 'tiny') return 'btn-tiny';
  return '';
}

function getButtonClassName(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return `btn ${variant} ${getSizeClassName(size)} ${className ?? ''}`.trim();
}

function getPillClassName(primary: boolean, className?: string): string {
  return `pill ${primary ? 'primary' : ''} ${className ?? ''}`.trim();
}

function getBadgeToneClassName(tone: BadgeTone): string {
  return tone === 'ok' ? 'active' : tone === 'warn' ? 'warn' : '';
}

function getBadgeClassName(tone: BadgeTone, className?: string): string {
  return `chip ${getBadgeToneClassName(tone)} ${className ?? ''}`.trim();
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  },
): React.JSX.Element {
  const variant = props.variant ?? 'primary';
  const size = props.size ?? 'default';
  return (
    <button type="button" {...props} className={getButtonClassName(variant, size, props.className)}>
      {props.children}
    </button>
  );
}

export function IconButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    chrome?: 'boxed' | 'inline';
  },
): React.JSX.Element {
  const chrome = props.chrome ?? 'boxed';
  return (
    <button
      type="button"
      {...props}
      className={`icon-btn ${chrome === 'inline' ? 'inline' : ''} ${props.className ?? ''}`.trim()}
    >
      {props.children}
    </button>
  );
}

type ButtonLinkBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: 'default' | 'landing';
  className?: string;
  children: React.ReactNode;
};

type RouterButtonLinkProps = ButtonLinkBaseProps &
  Omit<LinkProps, 'className' | 'children'> & {
    to: LinkProps['to'];
    href?: never;
  };

type AnchorButtonLinkProps = ButtonLinkBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & {
    href: string;
    to?: never;
  };

type BrandLinkBaseProps = {
  label: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'landing';
  className?: string;
};

type RouterBrandLinkProps = BrandLinkBaseProps &
  Omit<LinkProps, 'className' | 'children' | 'to'> & {
    to: LinkProps['to'];
    href?: never;
  };

type AnchorBrandLinkProps = BrandLinkBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & {
    href: string;
    to?: never;
  };

type NavCardLinkBaseProps = {
  className?: string;
  children: React.ReactNode;
};

type RouterNavCardLinkProps = NavCardLinkBaseProps &
  Omit<NavLinkProps, 'className' | 'children'> & {
    to: NavLinkProps['to'];
    href?: never;
  };

type AnchorNavCardLinkProps = NavCardLinkBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & {
    href: string;
    to?: never;
  };

type TextLinkBaseProps = {
  tone?: 'default' | 'landing';
  className?: string;
  children: React.ReactNode;
};

type RouterTextLinkProps = TextLinkBaseProps &
  Omit<LinkProps, 'className' | 'children'> & {
    to: LinkProps['to'];
    href?: never;
  };

type AnchorTextLinkProps = TextLinkBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & {
    href: string;
    to?: never;
  };

export function TextLink(props: RouterTextLinkProps | AnchorTextLinkProps): React.JSX.Element {
  const tone = props.tone ?? 'default';
  const className =
    tone === 'landing'
      ? `landing-text-link ${props.className ?? ''}`.trim()
      : `text-link ${props.className ?? ''}`.trim();

  if ('href' in props) {
    const { tone: _tone, className: _className, children, href, ...anchorProps } = props;
    return (
      <a {...anchorProps} href={href} className={className}>
        {children}
      </a>
    );
  }

  const { tone: _tone, className: _className, children, to, ...linkProps } = props;
  return (
    <Link {...linkProps} to={to} className={className}>
      {children}
    </Link>
  );
}

export function ButtonLink(
  props: RouterButtonLinkProps | AnchorButtonLinkProps,
): React.JSX.Element {
  const variant = props.variant ?? 'primary';
  const size = props.size ?? 'default';
  const tone = props.tone ?? 'default';
  const className =
    tone === 'landing'
      ? `landing-button landing-button-${variant} ${props.className ?? ''}`.trim()
      : getButtonClassName(variant, size, props.className);

  if ('href' in props) {
    const {
      variant: _variant,
      size: _size,
      tone: _tone,
      className: _className,
      children,
      href,
      ...anchorProps
    } = props;
    return (
      <a {...anchorProps} href={href} className={className}>
        {children}
      </a>
    );
  }

  const {
    variant: _variant,
    size: _size,
    tone: _tone,
    className: _className,
    children,
    to,
    ...linkProps
  } = props;
  return (
    <Link {...linkProps} to={to} className={className}>
      {children}
    </Link>
  );
}

export function BrandLink(props: RouterBrandLinkProps | AnchorBrandLinkProps): React.JSX.Element {
  const tone = props.tone ?? 'default';
  const className = [
    'brand-link',
    tone === 'landing' ? 'brand-link-landing' : 'brand-link-default',
    props.className ?? '',
  ]
    .join(' ')
    .trim();
  const content = (
    <>
      {props.icon ? (
        <span className="brand-link-mark" aria-hidden="true">
          {props.icon}
        </span>
      ) : null}
      <span className="brand-link-copy">
        <span className="brand-link-title-row">
          <span className="brand-link-name">{props.label}</span>
          {props.badge}
        </span>
        {props.subtitle ? <span className="brand-link-subtitle">{props.subtitle}</span> : null}
      </span>
    </>
  );

  if ('href' in props) {
    const {
      label: _label,
      subtitle: _subtitle,
      badge: _badge,
      icon: _icon,
      tone: _tone,
      className: _className,
      href,
      ...anchorProps
    } = props;
    return (
      <a {...anchorProps} href={href} className={className}>
        {content}
      </a>
    );
  }

  const {
    label: _label,
    subtitle: _subtitle,
    badge: _badge,
    icon: _icon,
    tone: _tone,
    className: _className,
    to,
    ...linkProps
  } = props;
  return (
    <Link {...linkProps} to={to} className={className}>
      {content}
    </Link>
  );
}

export function NavCardLink(
  props: RouterNavCardLinkProps | AnchorNavCardLinkProps,
): React.JSX.Element {
  const className = `nav-card-link ${props.className ?? ''}`.trim();

  if ('href' in props) {
    const { className: _className, children, href, ...anchorProps } = props;
    return (
      <a {...anchorProps} href={href} className={className}>
        {children}
      </a>
    );
  }

  const { className: _className, children, to, ...navLinkProps } = props;
  return (
    <NavLink
      {...navLinkProps}
      to={to}
      className={({ isActive }) => `${className} ${isActive ? 'active' : ''}`.trim()}
    >
      {children}
    </NavLink>
  );
}

type PillLinkBaseProps = {
  primary?: boolean;
  className?: string;
  children: React.ReactNode;
};

type RouterPillLinkProps = PillLinkBaseProps &
  Omit<LinkProps, 'className' | 'children'> & {
    to: LinkProps['to'];
    href?: never;
  };

type AnchorPillLinkProps = PillLinkBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & {
    href: string;
    to?: never;
  };

export function PillLink(props: RouterPillLinkProps | AnchorPillLinkProps): React.JSX.Element {
  const primary = props.primary ?? false;
  const className = getPillClassName(primary, props.className);

  if ('href' in props) {
    const { primary: _primary, className: _className, children, href, ...anchorProps } = props;
    return (
      <a {...anchorProps} href={href} className={className}>
        {children}
      </a>
    );
  }

  const { primary: _primary, className: _className, children, to, ...linkProps } = props;
  return (
    <Link {...linkProps} to={to} className={className}>
      {children}
    </Link>
  );
}

export function PillButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean },
): React.JSX.Element {
  const primary = props.primary ?? false;
  return (
    <button type="button" {...props} className={getPillClassName(primary, props.className)}>
      {props.children}
    </button>
  );
}

export function StatusBanner(props: {
  role?: 'status' | 'alert';
  title?: string;
  message: string;
  type?: 'ok' | 'error' | 'info' | 'warn';
  id?: string;
  children?: React.ReactNode;
  className?: string;
}): React.JSX.Element | null {
  if (!props.message && !props.children) return null;
  const role = props.role ?? 'status';
  return (
    <div
      id={props.id}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      className={`status ${props.type ?? 'info'} ${props.className ?? ''}`.trim()}
    >
      {props.title ? <strong>{props.title}</strong> : null}
      {props.message ? props.title ? <> {props.message}</> : props.message : null}
      {props.children ? <div className="status-actions">{props.children}</div> : null}
    </div>
  );
}

export function LoadingState(props: { label: string; message?: string }): React.JSX.Element {
  return (
    <div className="loading" role="status" aria-busy="true" aria-label={props.label}>
      {props.message ? <p className="muted">{props.message}</p> : null}
      <div className="skeleton skeleton-line"></div>
      <div className="skeleton skeleton-line short"></div>
    </div>
  );
}

export function Eyebrow(props: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <span className={`workspace-card-label ${props.className ?? ''}`.trim()}>{props.children}</span>
  );
}

export function EmptyState(props: {
  message: React.ReactNode;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={`empty-state ${props.className ?? ''}`.trim()}>
      {props.icon ? <div className="empty-state-icon">{props.icon}</div> : null}
      <div>{props.message}</div>
      {props.hint ? <div className="empty-state-hint">{props.hint}</div> : null}
    </div>
  );
}

export function DefinitionList(props: {
  entries: Array<{
    term: React.ReactNode;
    description: React.ReactNode;
    descriptionClassName?: string;
  }>;
}): React.JSX.Element {
  return (
    <dl className="dl-grid">
      {props.entries.map((entry) => (
        <React.Fragment key={typeof entry.term === 'string' ? entry.term : String(entry.term)}>
          <dt>{entry.term}</dt>
          <dd className={entry.descriptionClassName}>{entry.description}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function MetaNote(
  props: React.PropsWithChildren<{ size?: 'default' | 'large'; className?: string }>,
) {
  return (
    <div
      className={`meta-note ${props.size === 'large' ? 'meta-note-lg' : ''} ${props.className ?? ''}`.trim()}
    >
      {props.children}
    </div>
  );
}

export function ConnectionBadge(props: {
  connected: boolean;
  connectedLabel: React.ReactNode;
  disconnectedLabel: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`session-badge ${props.connected ? 'connected' : ''} ${props.className ?? ''}`.trim()}
    >
      <span className="session-badge-dot" />
      {props.connected ? props.connectedLabel : props.disconnectedLabel}
      {props.connected && props.meta ? (
        <span className="session-badge-tools">{props.meta}</span>
      ) : null}
    </div>
  );
}

export function StatusPill(props: {
  tone: 'ok' | 'error' | 'info' | 'mcp' | 'plain';
  variant?: 'soft' | 'solid';
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const variant = props.variant ?? 'soft';
  return (
    <span className={`status-pill ${variant} tone-${props.tone} ${props.className ?? ''}`.trim()}>
      {props.children}
    </span>
  );
}

type BadgeLinkBaseProps = {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
};

type RouterBadgeLinkProps = BadgeLinkBaseProps &
  Omit<LinkProps, 'className' | 'children'> & {
    to: LinkProps['to'];
    href?: never;
  };

type AnchorBadgeLinkProps = BadgeLinkBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & {
    href: string;
    to?: never;
  };

export function BadgeLink(props: RouterBadgeLinkProps | AnchorBadgeLinkProps): React.JSX.Element {
  const tone = props.tone ?? 'neutral';
  const className = getBadgeClassName(tone, props.className);

  if ('href' in props) {
    const { tone: _tone, className: _className, children, href, ...anchorProps } = props;
    return (
      <a {...anchorProps} href={href} className={className}>
        {children}
      </a>
    );
  }

  const { tone: _tone, className: _className, children, to, ...linkProps } = props;
  return (
    <Link {...linkProps} to={to} className={className}>
      {children}
    </Link>
  );
}

export const TabButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    controls: string;
    selected: boolean;
  }
>(function TabButton(
  { controls, selected, className, children, ...buttonProps },
  ref,
): React.JSX.Element {
  return (
    <button
      type="button"
      ref={ref}
      role="tab"
      aria-selected={selected}
      aria-controls={controls}
      tabIndex={selected ? 0 : -1}
      className={`tab-btn ${selected ? 'active' : ''} ${className ?? ''}`.trim()}
      {...buttonProps}
    >
      {children}
    </button>
  );
});

export function Badge(props: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const tone = props.tone ?? 'neutral';
  return <span className={getBadgeClassName(tone, props.className)}>{props.children}</span>;
}

export function FormField(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const describedBy =
    [props.hint ? `${props.id}-hint` : '', props.error ? `${props.id}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={`field ${props.compact ? 'compact' : ''} ${props.className ?? ''}`.trim()}>
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
  steps: Array<{
    label: string;
    complete: boolean;
    active?: boolean;
    to?: string;
    disabled?: boolean;
    action?: React.ReactNode;
  }>;
}): React.JSX.Element {
  return (
    <ol className="stepper" aria-label="Setup progress">
      {props.steps.map((step, index) => {
        const cls = step.active
          ? 'active'
          : step.complete
            ? 'done'
            : step.disabled
              ? 'disabled'
              : '';
        const icon = step.complete ? '✓' : `${index + 1}`;
        const content = (
          <div className="stepper-main">
            <span
              className="stepper-icon"
              aria-label={step.complete ? 'Completed' : `Step ${index + 1}`}
            >
              {icon}
            </span>
            <span>{step.label}</span>
          </div>
        );
        return (
          <li key={step.label} className={cls}>
            {step.to && !step.disabled ? <Link to={step.to}>{content}</Link> : content}
            {step.action ? <div className="stepper-action">{step.action}</div> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input {...props} className={`input-control ${props.className ?? ''}`.trim()} />;
}

export function Checkbox(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>,
): React.JSX.Element {
  return (
    <input
      type="checkbox"
      {...props}
      className={`checkbox-input ${props.className ?? ''}`.trim()}
    />
  );
}

export function CheckboxField(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
    children: React.ReactNode;
    className?: string;
  },
): React.JSX.Element {
  const { children, className, ...inputProps } = props;
  return (
    <label className={`checkbox-field ${className ?? ''}`.trim()}>
      <Checkbox {...inputProps} />
      <span>{children}</span>
    </label>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select {...props} className={`select-control ${props.className ?? ''}`.trim()} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
): React.JSX.Element {
  return <textarea {...props} className={`textarea-control ${props.className ?? ''}`.trim()} />;
}

export function CodeSurface(props: {
  code: string;
  title?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  copyable?: boolean;
  copyLabel?: string;
  copySuccessMessage?: string;
  copyErrorMessage?: string;
}): React.JSX.Element {
  const { toast } = useToast();

  async function onCopy(): Promise<void> {
    if (!navigator?.clipboard?.writeText) {
      toast(props.copyErrorMessage ?? 'Clipboard copy is unavailable in this browser.', 'error');
      return;
    }
    await navigator.clipboard.writeText(props.code);
    toast(props.copySuccessMessage ?? 'Copied to clipboard.', 'ok');
  }

  return (
    <div className={`raw-response ${props.className ?? ''}`.trim()}>
      {props.title || props.copyable ? (
        <InlineGroup justify="between">
          {props.title ? <strong>{props.title}</strong> : null}
          {props.copyable ? (
            <Button variant="secondary" size="compact" onClick={() => void onCopy()}>
              {props.copyLabel ?? 'Copy'}
            </Button>
          ) : null}
        </InlineGroup>
      ) : null}
      <pre className="raw-response-code">
        <code>{props.children ?? props.code}</code>
      </pre>
    </div>
  );
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
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
    <dialog ref={dialogRef} className="modal" aria-label={props.title}>
      <InlineGroup justify="between">
        <h3>{props.title}</h3>
        <IconButton aria-label="Close dialog" onClick={props.onClose}>
          ✕
        </IconButton>
      </InlineGroup>
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
