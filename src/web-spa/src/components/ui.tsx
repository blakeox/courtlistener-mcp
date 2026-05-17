import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { LinkProps, NavLinkProps } from 'react-router-dom';
import { cn } from '../lib/cn';
import {
  badgeClassName,
  brandLinkClassName,
  brandLinkCopyClass,
  brandLinkMarkClass,
  brandLinkNameClass,
  brandLinkSubtitleClass,
  brandLinkTitleRowClass,
  buttonClassName,
  cardClass,
  cardSpotlightClass,
  cardTitleClass,
  checkboxFieldClass,
  checkboxInputClass,
  comparisonCardBodyClass,
  comparisonCardClassName,
  comparisonCardHeaderClassName,
  comparisonCardTitleClassName,
  comparisonIconClassName,
  dlGridClass,
  emptyStateClass,
  emptyStateHintClass,
  emptyStateIconClass,
  eyebrowLabelClass,
  featureCardDescriptionClass,
  featureCardTitleClass,
  fieldErrorClass,
  formFieldClassName,
  hintClass,
  iconButtonClassName,
  infoBlockClass,
  inlineGroupClass,
  inputControlClass,
  keyValueListClass,
  landingButtonClassName,
  landingFeatureCardDescriptionClass,
  landingIconWrapClass,
  landingSectionHeadingClass,
  landingSectionHeadingCompactClass,
  landingSectionHeadingDescriptionClass,
  landingSectionHeadingTitleClass,
  loadingClass,
  metaNoteClassName,
  metricCardAccentClass,
  modalClass,
  mutedTextClass,
  navCardLinkClassName,
  pageHeaderActionsClass,
  pageHeaderClass,
  pageHeaderDescriptionClass,
  pageHeaderMainClass,
  pageHeaderMetaClass,
  pageHeaderSideClass,
  pageHeaderTitleClass,
  pageHeroActionsClass,
  pageHeroAsideClass,
  pageHeroClass,
  pageHeroNoteClass,
  pageHeroNoteTextClass,
  pageHeroNoteTitleClass,
  pageHeroDescriptionClass,
  pageHeroLayoutClass,
  pageHeroMainClass,
  pageHeroTitleClass,
  panelClass,
  panelInverseClass,
  pillClassName,
  rawResponseClass,
  rawResponseCodeClass,
  selectControlClass,
  sessionBadgeClassName,
  sessionBadgeDotClass,
  sessionBadgeDotConnectedClass,
  sessionBadgeToolsClass,
  skeletonLineClass,
  skeletonLineShortClass,
  sectionHeadingDescriptionClass,
  sectionHeadingTitleClass,
  skipLinkClassName,
  statCardValueClass,
  statusActionsClass,
  statusBannerClassName,
  statusPillClassName,
  stepperActionClass,
  stepperClass,
  stepperIconClass,
  stepperItemClassName,
  stepperMainClass,
  tabButtonClassName,
  textLinkClass,
  textareaControlClass,
} from '../lib/ui-classes';
import {
  landingPillClass,
  landingSectionLabelClass,
  landingStatCardClass,
  landingStatLabelClass,
  landingTabButtonClassName,
  landingTextLinkClass,
  brandLinkBadgeClass,
  landingCommandChipClass,
  landingCodeFormatBadgeClass,
  landingFeatureCardClass,
  landingTrustCardClass,
} from '../lib/landing-classes';
import { useToast } from './toast-context';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'default' | 'compact' | 'tiny';
type BadgeTone = 'neutral' | 'ok' | 'warn';
type BadgeVariant = 'default' | 'brand-link' | 'command-chip' | 'code-format';
type EyebrowVariant = 'default' | 'pill' | 'section-label' | 'stat-label';

export function Card(
  props: React.PropsWithChildren<{
    title?: string;
    subtitle?: string;
    tone?: 'default' | 'spotlight';
    className?: string;
  }>,
): React.JSX.Element {
  return (
    <section
      className={cn(props.tone === 'spotlight' ? cardSpotlightClass : cardClass, props.className)}
    >
      {props.title ? <h2 className={cardTitleClass}>{props.title}</h2> : null}
      {props.subtitle ? <p className={mutedTextClass}>{props.subtitle}</p> : null}
      {props.children}
    </section>
  );
}

export function Panel(
  props: React.PropsWithChildren<{
    tone?: 'default' | 'inverse';
    className?: string;
  }>,
): React.JSX.Element {
  return (
    <section
      className={cn(props.tone === 'inverse' ? panelInverseClass : panelClass, props.className)}
    >
      {props.children}
    </section>
  );
}

export function PageHeader(
  props: React.PropsWithChildren<{
    eyebrow?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    meta?: React.ReactNode;
    className?: string;
    eyebrowClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
  }>,
): React.JSX.Element {
  return (
    <section className={cn(pageHeaderClass, props.className)}>
      <div className={pageHeaderMainClass}>
        {props.eyebrow ? (
          <Eyebrow className={props.eyebrowClassName}>{props.eyebrow}</Eyebrow>
        ) : null}
        <h1 className={cn(pageHeaderTitleClass, props.titleClassName)}>{props.title}</h1>
        {props.description ? (
          <p className={cn(pageHeaderDescriptionClass, props.descriptionClassName)}>
            {props.description}
          </p>
        ) : null}
        {props.children}
      </div>
      {props.actions || props.meta ? (
        <div className={pageHeaderSideClass}>
          {props.meta ? <div className={pageHeaderMetaClass}>{props.meta}</div> : null}
          {props.actions ? <div className={pageHeaderActionsClass}>{props.actions}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

export function HeroPanel(
  props: React.PropsWithChildren<{
    eyebrow?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    aside?: React.ReactNode;
    className?: string;
    eyebrowClassName?: string;
  }>,
): React.JSX.Element {
  return (
    <section className={cn(pageHeroClass, props.className)}>
      <div className={pageHeroLayoutClass}>
        <div className={pageHeroMainClass}>
          {props.eyebrow ? (
            <Eyebrow className={props.eyebrowClassName}>{props.eyebrow}</Eyebrow>
          ) : null}
          <h1 className={pageHeroTitleClass}>{props.title}</h1>
          {props.description ? (
            <p className={pageHeroDescriptionClass}>{props.description}</p>
          ) : null}
          {props.actions ? <div className={pageHeroActionsClass}>{props.actions}</div> : null}
          {props.children}
        </div>
        {props.aside ? <aside className={pageHeroAsideClass}>{props.aside}</aside> : null}
      </div>
    </section>
  );
}

export function PageHeroNote(
  props: React.PropsWithChildren<{
    title: React.ReactNode;
    description?: React.ReactNode;
    className?: string;
    titleClassName?: string;
    descriptionClassName?: string;
  }>,
): React.JSX.Element {
  return (
    <div className={cn(pageHeroNoteClass, props.className)}>
      <strong className={cn(pageHeroNoteTitleClass, props.titleClassName)}>{props.title}</strong>
      {props.description ? (
        <p className={cn(pageHeroNoteTextClass, props.descriptionClassName)}>{props.description}</p>
      ) : null}
      {props.children}
    </div>
  );
}

export function SectionHeading(
  props: React.PropsWithChildren<{
    eyebrow: React.ReactNode;
    title: React.ReactNode;
    description: React.ReactNode;
    tone?: 'default' | 'landing';
    compact?: boolean;
    className?: string;
    eyebrowClassName?: string;
    eyebrowVariant?: EyebrowVariant;
  }>,
): React.JSX.Element {
  const isLanding = props.tone === 'landing';
  const isCompact = props.compact === true;
  return (
    <div
      className={cn(
        isLanding && (isCompact ? landingSectionHeadingCompactClass : landingSectionHeadingClass),
        props.className,
      )}
    >
      <Eyebrow variant={props.eyebrowVariant} className={props.eyebrowClassName}>
        {props.eyebrow}
      </Eyebrow>
      <h2 className={isLanding ? landingSectionHeadingTitleClass : sectionHeadingTitleClass}>
        {props.title}
      </h2>
      <p
        className={
          isLanding ? landingSectionHeadingDescriptionClass : sectionHeadingDescriptionClass
        }
      >
        {props.description}
      </p>
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
    <div className={cn(infoBlockClass, props.className)}>
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
    tone?: 'default' | 'landing';
    variant?: 'feature' | 'trust';
    className?: string;
    iconClassName?: string;
  }>,
): React.JSX.Element {
  const isLanding = props.tone === 'landing';
  const landingCardClassName =
    props.variant === 'trust' ? landingTrustCardClass : landingFeatureCardClass;
  return (
    <article className={cn(isLanding ? landingCardClassName : undefined, props.className)}>
      <span
        className={cn(props.iconClassName ?? (isLanding ? landingIconWrapClass : undefined))}
        aria-hidden="true"
      >
        {props.icon}
      </span>
      <h3 className={featureCardTitleClass}>{props.title}</h3>
      <p className={isLanding ? landingFeatureCardDescriptionClass : featureCardDescriptionClass}>
        {props.description}
      </p>
      {props.children}
    </article>
  );
}

export function StatCard(
  props: React.PropsWithChildren<{
    label: React.ReactNode;
    value: React.ReactNode;
    tone?: 'default' | 'landing';
    className?: string;
    labelClassName?: string;
    labelVariant?: EyebrowVariant;
  }>,
): React.JSX.Element {
  return (
    <article className={cn(props.tone === 'landing' && landingStatCardClass, props.className)}>
      <Eyebrow variant={props.labelVariant} className={props.labelClassName}>
        {props.label}
      </Eyebrow>
      <strong className={statCardValueClass}>{props.value}</strong>
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
      {props.accent ? <p className={metricCardAccentClass}>{props.accent}</p> : null}
      {props.children}
    </Card>
  );
}

export function KeyValueList(props: {
  entries: Array<{
    label: React.ReactNode;
    value: React.ReactNode;
  }>;
  className?: string;
}): React.JSX.Element {
  return (
    <ul className={cn(keyValueListClass, props.className)}>
      {props.entries.map((entry) => (
        <li key={`${entry.label}-${entry.value}`}>
          <span>{entry.label}</span>
          <strong>{entry.value}</strong>
        </li>
      ))}
    </ul>
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
  const size = props.size ?? 'default';
  const tone = props.tone ?? 'default';

  return (
    <div className={comparisonCardClassName(tone, size, props.className)}>
      <div className={comparisonCardHeaderClassName(size)}>
        <span className={comparisonIconClassName(size)}>{props.icon}</span>
        <strong className={comparisonCardTitleClassName(size)}>{props.title}</strong>
        {props.badge}
      </div>
      {props.meta}
      <div className={comparisonCardBodyClass}>{props.children}</div>
    </div>
  );
}

export function SkipLink(props: {
  href: string;
  children: React.ReactNode;
  tone?: 'default' | 'landing';
}): React.JSX.Element {
  return (
    <a href={props.href} className={skipLinkClassName(props.tone ?? 'default')}>
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
  return (
    <div className={inlineGroupClass(props.justify, props.gap, props.className)}>
      {props.children}
    </div>
  );
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
    <button type="button" {...props} className={buttonClassName(variant, size, props.className)}>
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
    <button type="button" {...props} className={iconButtonClassName(chrome, props.className)}>
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
  tone?: 'default' | 'landing' | 'shell';
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
      ? cn(landingTextLinkClass, props.className)
      : cn(textLinkClass, props.className);

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
      ? landingButtonClassName(variant, props.className)
      : buttonClassName(variant, size, props.className);

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
  const className = brandLinkClassName(tone, props.className);
  const content = (
    <>
      {props.icon ? (
        <span className={brandLinkMarkClass} aria-hidden="true">
          {props.icon}
        </span>
      ) : null}
      <span className={brandLinkCopyClass}>
        <span className={brandLinkTitleRowClass}>
          <span className={brandLinkNameClass}>{props.label}</span>
          {props.badge}
        </span>
        {props.subtitle ? <span className={brandLinkSubtitleClass}>{props.subtitle}</span> : null}
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
  const baseClassName = navCardLinkClassName(false, props.className);

  if ('href' in props) {
    const { className: _className, children, href, ...anchorProps } = props;
    return (
      <a {...anchorProps} href={href} className={baseClassName}>
        {children}
      </a>
    );
  }

  const { className: _className, children, to, ...navLinkProps } = props;
  return (
    <NavLink
      {...navLinkProps}
      to={to}
      className={({ isActive }) => navCardLinkClassName(isActive, props.className)}
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
  const className = pillClassName(primary, props.className);

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
    <button type="button" {...props} className={pillClassName(primary, props.className)}>
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
      className={statusBannerClassName(props.type ?? 'info', props.className)}
    >
      {props.title ? <strong>{props.title}</strong> : null}
      {props.message ? props.title ? <> {props.message}</> : props.message : null}
      {props.children ? <div className={statusActionsClass}>{props.children}</div> : null}
    </div>
  );
}

export function LoadingState(props: { label: string; message?: string }): React.JSX.Element {
  return (
    <div className={loadingClass} role="status" aria-busy="true" aria-label={props.label}>
      {props.message ? <p className={mutedTextClass}>{props.message}</p> : null}
      <div className={skeletonLineClass} />
      <div className={skeletonLineShortClass} />
    </div>
  );
}

export function Eyebrow(props: {
  children: React.ReactNode;
  variant?: EyebrowVariant;
  className?: string;
}): React.JSX.Element {
  const variant = props.variant ?? 'default';
  return (
    <span
      className={cn(
        eyebrowLabelClass,
        variant === 'pill' && landingPillClass,
        variant === 'section-label' && landingSectionLabelClass,
        variant === 'stat-label' && landingStatLabelClass,
        props.className,
      )}
    >
      {props.children}
    </span>
  );
}

export function EmptyState(props: {
  message: React.ReactNode;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn(emptyStateClass, props.className)}>
      {props.icon ? <div className={emptyStateIconClass}>{props.icon}</div> : null}
      <div>{props.message}</div>
      {props.hint ? <div className={emptyStateHintClass}>{props.hint}</div> : null}
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
    <dl className={dlGridClass}>
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
    <div className={metaNoteClassName(props.size ?? 'default', props.className)}>
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
    <div className={sessionBadgeClassName(props.connected, props.className)}>
      <span
        className={cn(sessionBadgeDotClass, props.connected && sessionBadgeDotConnectedClass)}
      />
      {props.connected ? props.connectedLabel : props.disconnectedLabel}
      {props.connected && props.meta ? (
        <span className={sessionBadgeToolsClass}>{props.meta}</span>
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
    <span className={statusPillClassName(props.tone, variant, props.className)}>
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
  const className = badgeClassName(tone, props.className);

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
    tone?: 'default' | 'landing';
  }
>(function TabButton(
  { controls, selected, tone, className, children, ...buttonProps },
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
      className={
        tone === 'landing'
          ? landingTabButtonClassName(selected, className)
          : tabButtonClassName(selected, className)
      }
      {...buttonProps}
    >
      {children}
    </button>
  );
});

export function Badge(props: {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const tone = props.tone ?? 'neutral';
  const variant = props.variant ?? 'default';
  const className = cn(
    variant === 'brand-link' && brandLinkBadgeClass,
    variant === 'command-chip' && landingCommandChipClass,
    variant === 'code-format' && landingCodeFormatBadgeClass,
    variant === 'default' && badgeClassName(tone, props.className),
    variant !== 'default' && props.className,
  );
  return <span className={className}>{props.children}</span>;
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
    <div className={formFieldClassName(props.compact ?? false, props.className)}>
      <label htmlFor={props.id}>{props.label}</label>
      <div aria-describedby={describedBy} aria-invalid={props.error ? true : undefined}>
        {props.children}
      </div>
      {props.hint ? (
        <div id={`${props.id}-hint`} className={hintClass}>
          {props.hint}
        </div>
      ) : null}
      {props.error ? (
        <div id={`${props.id}-error`} role="alert" className={fieldErrorClass}>
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
    <ol className={stepperClass} aria-label="Setup progress">
      {props.steps.map((step, index) => {
        const stepState = step.active
          ? 'active'
          : step.complete
            ? 'done'
            : step.disabled
              ? 'disabled'
              : '';
        const icon = step.complete ? '✓' : `${index + 1}`;
        const content = (
          <div className={stepperMainClass}>
            <span
              className={stepperIconClass}
              aria-label={step.complete ? 'Completed' : `Step ${index + 1}`}
            >
              {icon}
            </span>
            <span>{step.label}</span>
          </div>
        );
        return (
          <li key={step.label} className={stepperItemClassName(stepState)}>
            {step.to && !step.disabled ? <Link to={step.to}>{content}</Link> : content}
            {step.action ? <div className={stepperActionClass}>{step.action}</div> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input {...props} className={cn(inputControlClass, props.className)} />;
}

export function Checkbox(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>,
): React.JSX.Element {
  return <input type="checkbox" {...props} className={cn(checkboxInputClass, props.className)} />;
}

export function CheckboxField(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
    children: React.ReactNode;
    className?: string;
  },
): React.JSX.Element {
  const { children, className, ...inputProps } = props;
  return (
    <label className={cn(checkboxFieldClass, className)}>
      <Checkbox {...inputProps} />
      <span>{children}</span>
    </label>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select {...props} className={cn(selectControlClass, props.className)} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
): React.JSX.Element {
  return <textarea {...props} className={cn(textareaControlClass, props.className)} />;
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
    <div className={cn(rawResponseClass, props.className)}>
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
      <pre className={rawResponseCodeClass}>
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
    <dialog ref={dialogRef} className={modalClass} aria-label={props.title}>
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
