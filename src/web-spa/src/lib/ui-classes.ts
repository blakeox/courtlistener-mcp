import { cn } from './cn';

/** Shared Tailwind compositions for portal UI primitives (tokens via arbitrary properties). */

export const eyebrowLabelClass = cn(
  'eyebrow-label workspace-card-label',
  'text-foreground text-ui-sm font-bold tracking-[var(--tracking-label)] uppercase',
);

/** Keep `text-link` after utilities — tailwind-merge drops it if listed before `text-accent`. */
export const textLinkClass = cn(
  'font-semibold text-accent underline decoration-[color:var(--action-focus-ring)] underline-offset-2 transition-colors',
  'text-link',
);

export const mutedTextClass = cn('muted mt-(--space-2) text-foreground');

/** Muted body copy without extra block spacing (metric cards, empty states). */
export const mutedCopyClass = 'muted text-foreground';

export const cardClass = cn(
  'ui-card',
  'rounded-portal-md border border-border-subtle bg-panel p-(--space-5) shadow-[var(--surface-shadow)]',
  'max-sm:p-(--space-3)',
);

export const cardSpotlightClass = cn(
  cardClass,
  'card-spotlight bg-[image:var(--card-spotlight-gradient)]',
);

export const cardTitleClass = 'm-0 text-ui-xl tracking-[var(--tracking-snug)] text-foreground';

export const panelClass = cn(
  'panel-card',
  'grid gap-(--space-2) rounded-portal-md border border-border-subtle bg-panel p-(--space-4-5)',
);

export const panelInverseClass = cn(
  panelClass,
  'inverse gap-(--space-1-5) rounded-portal-lg border-[color:var(--hero-note-border)] bg-[color:var(--hero-note-bg)] p-(--space-3-5) text-[color:var(--hero-note-text)] [&_p]:m-0 [&_p]:text-[color:var(--hero-note-text)]',
);

export const pageHeaderClass = cn(
  'page-header',
  'flex flex-wrap items-end justify-between gap-(--space-5-5) max-md:items-start',
);

export const pageHeaderMainClass = cn(
  'page-header-main',
  'grid min-w-0 flex-[var(--flex-header)] gap-(--space-3)',
);

export const pageHeaderTitleClass = cn(
  'm-0 text-[length:clamp(var(--text-display-sm),3vw,var(--text-display-md))] leading-[var(--leading-snug)] tracking-[var(--tracking-tight)]',
);

export const pageHeaderDescriptionClass = cn(
  'page-header-description',
  'm-0 max-w-[var(--width-prose-2xl)] text-ui-lg leading-[var(--leading-loose)] text-faint',
);

export const pageHeaderSideClass = cn(
  'page-header-side',
  'grid flex-[var(--flex-side)] justify-items-start gap-(--space-3)',
);

export const pageHeaderMetaClass = cn('page-header-meta', 'm-0 font-semibold text-faint');

export const pageHeaderActionsClass = cn('page-header-actions', 'flex flex-wrap gap-(--space-2)');

export const pageHeroClass = cn(
  'page-hero relative overflow-hidden rounded-portal-lg border border-[length:var(--size-border-sm)] border-[color:var(--surface-border-strong)] bg-[image:var(--hero-bg)] p-(--space-7) shadow-[var(--surface-shadow-strong)]',
  'before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(var(--hero-grid-dot)_var(--size-border-sm),transparent_var(--size-border-sm))] before:bg-size-[var(--size-grid-dot)_var(--size-grid-dot)] before:opacity-[var(--opacity-grid)] before:content-[""]',
  '[&>*]:relative [&>*]:z-[var(--z-raised)]',
);

export const pageHeroLayoutClass = cn(
  'page-hero-layout',
  'grid items-center gap-(--space-6) [grid-template-columns:var(--layout-page-hero)] max-md:[grid-template-columns:var(--layout-grid-1)]',
);

export const pageHeroMainClass = cn(
  'page-hero-main',
  'relative z-[var(--z-raised)] grid gap-(--space-4-5)',
);

export const pageHeroTitleClass = cn(
  'm-0 text-[length:clamp(var(--text-display-hero-sm),5vw,var(--text-display-xl))] font-extrabold leading-[var(--leading-tight)] tracking-[var(--tracking-tighter)] text-[color:var(--shell-sidebar-text-strong)]',
);

export const pageHeroDescriptionClass = cn(
  'page-hero-description',
  'm-0 max-w-[var(--width-prose-lg)] text-[length:var(--text-lg-plus)] leading-[var(--leading-loose)] text-[color:var(--hero-note-text)]',
);

export const pageHeroActionsClass = cn('page-hero-actions', 'flex flex-wrap gap-(--space-2)');

export const pageHeroAsideClass = cn(
  'page-hero-aside',
  'relative z-[var(--z-raised)] grid gap-(--space-4)',
);

export const infoBlockClass = cn('info-block', 'grid gap-(--space-1) [&_p]:m-0');

/** Flex row for definition-list values (badges, chips) inside `<dd>`. */
export const inlineGroupRowClass = cn('row flex flex-wrap items-center gap-(--space-2)');

export const inlineGroupClass = (
  justify?: 'start' | 'between',
  gap?: 'default' | 'tight' | 'spacious',
  className?: string,
) =>
  cn(
    'row flex flex-wrap items-center',
    justify === 'between' && 'between justify-between',
    gap === 'tight' && 'row-tight gap-(--space-1-5)',
    gap === 'spacious' &&
      'row-spacious gap-(--space-3) max-md:flex-col max-md:items-start max-md:gap-(--space-2)',
    gap !== 'tight' && gap !== 'spacious' && 'gap-(--space-2)',
    className,
  );

const interactiveButtonBase = cn(
  'inline-flex cursor-pointer items-center justify-center rounded-portal-sm border border-[length:var(--size-border-sm)] border-[color:var(--surface-button-border)] bg-[color:var(--surface-button-bg)] px-(--space-3-5) py-(--space-2-5) font-bold text-foreground no-underline transition-[transform,box-shadow,filter,border-color,background,color] duration-200',
  'min-h-[var(--size-touch-md)]',
  'enabled:hover:brightness-[var(--motion-brightness-hover)]',
  'enabled:active:scale-[var(--motion-scale-press)]',
  'disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]',
);

const buttonBase = cn(
  'btn',
  interactiveButtonBase,
  'rounded-[var(--shell-button-radius)] max-sm:w-full max-sm:justify-center',
);

export function buttonClassName(
  variant: 'primary' | 'secondary' | 'danger' | 'ghost',
  size: 'default' | 'compact' | 'tiny',
  className?: string,
): string {
  return cn(
    buttonBase,
    variant === 'primary' &&
      'primary border-[color:var(--action-primary-border)] bg-[image:var(--action-primary-bg)] text-[color:var(--action-primary-fg)] shadow-[var(--action-primary-shadow)]',
    variant === 'secondary' &&
      'secondary border-[color:var(--action-secondary-border)] bg-[color:var(--action-secondary-bg)] text-[color:var(--action-secondary-fg)] shadow-none',
    variant === 'danger' &&
      'danger border-[color:var(--shell-button-danger-border)] bg-[color:var(--shell-button-danger-bg)] text-[color:var(--shell-button-danger-text)] shadow-none',
    variant === 'ghost' &&
      cn(
        'ghost border-transparent bg-transparent shadow-none text-[color:var(--shell-account-menu-text-faint)]',
        'hover:border-[color:var(--action-secondary-border)] hover:bg-[color:var(--action-secondary-bg)] hover:text-[color:var(--action-secondary-fg)]',
        'focus-visible:border-[color:var(--action-secondary-border)] focus-visible:bg-[color:var(--action-secondary-bg)] focus-visible:text-[color:var(--action-secondary-fg)]',
      ),
    size === 'compact' && 'btn-compact text-base px-(--space-3) py-(--space-2)',
    size === 'tiny' && 'btn-tiny rounded-portal-sm px-(--space-2) py-(--space-1) text-ui-sm',
    className,
  );
}

export function pillClassName(primary: boolean, className?: string): string {
  return cn(buttonBase, 'pill', primary && 'primary', className);
}

export function landingButtonClassName(
  variant: 'primary' | 'secondary',
  className?: string,
): string {
  return cn(
    interactiveButtonBase,
    'landing-button rounded-portal-sm border-transparent px-(--space-3-5) py-(--space-3-5)',
    'enabled:hover:-translate-y-px',
    variant === 'primary' &&
      cn(
        'landing-button-primary primary border-[color:var(--action-primary-border)] bg-[image:var(--action-primary-bg)] text-[color:var(--action-primary-fg)] shadow-[var(--action-primary-shadow)]',
        'enabled:hover:shadow-[var(--shell-button-primary-hover-shadow)]',
      ),
    variant === 'secondary' &&
      'landing-button-secondary secondary border-[color:var(--action-secondary-border)] bg-[color:var(--action-secondary-bg)] text-[color:var(--action-secondary-fg)]',
    className,
  );
}

export function badgeClassName(tone: 'neutral' | 'ok' | 'warn', className?: string): string {
  return cn(
    'chip inline-block rounded-full border border-[length:var(--size-border-sm)] border-border px-(--space-2) py-(--space-1) text-[length:var(--text-base-compact)] font-bold',
    tone === 'ok' &&
      'active border-[color:var(--surface-status-success-border)] bg-[color:var(--surface-control-bg)] text-foreground',
    tone === 'warn' &&
      'warn border-[color:var(--surface-status-warn-border)] bg-[color:var(--surface-status-warn-bg)] text-[color:var(--surface-status-warn-text-strong)]',
    className,
  );
}

const controlFocusClass =
  'focus-visible:outline-[length:var(--size-focus-ring)] focus-visible:outline-[color:var(--action-focus-ring)] focus-visible:outline-offset-[var(--size-focus-offset)]';

export function iconButtonClassName(chrome: 'boxed' | 'inline', className?: string): string {
  return cn(
    'icon-btn cursor-pointer',
    chrome === 'inline'
      ? 'inline h-auto w-auto border-0 bg-transparent p-0.5 px-1 text-inherit opacity-60'
      : 'size-[30px] rounded-portal-sm border border-border bg-[color:var(--surface-control-bg)]',
    controlFocusClass,
    className,
  );
}

export function statusBannerClassName(
  type: 'ok' | 'error' | 'info' | 'warn',
  className?: string,
): string {
  return cn(
    'status mt-(--space-3) rounded-portal-sm border border-[length:var(--size-border-sm)] px-(--space-3-5) py-(--space-3-5)',
    type === 'info' &&
      'info text-foreground bg-[color:var(--surface-status-info-bg)] border-border-subtle',
    type === 'ok' &&
      'ok text-status-success bg-[color:var(--status-success-bg)] border-[color:var(--status-success-border)]',
    type === 'warn' &&
      'warn text-status-warn bg-[color:var(--status-warn-bg)] border-[color:var(--status-warn-border)]',
    type === 'error' &&
      'error text-foreground bg-[color:var(--surface-control-bg)] border-[color:var(--status-error-border)]',
    className,
  );
}

export const statusActionsClass = 'status-actions mt-(--space-2)';

export const loadingClass = cn(
  'loading rounded-portal-md border border-border bg-[color:var(--surface-control-bg)] p-3',
);

export const skeletonClass = cn(
  'skeleton my-2 h-[var(--size-skeleton-height)] rounded-portal-sm bg-[image:var(--surface-skeleton-bg)] bg-size-[var(--size-skeleton-shimmer)] animate-[skeleton-pulse_var(--duration-skeleton)_ease-in-out_infinite]',
);

export const skeletonLineClass = cn(
  skeletonClass,
  'skeleton-line h-[var(--size-skeleton-line)] w-full',
);

export const skeletonLineShortClass = cn(
  skeletonLineClass,
  'skeleton-line short w-[var(--size-skeleton-line-short)]',
);

export const emptyStateClass = cn(
  'empty-state px-(--space-4) py-(--space-6) text-center text-muted',
);

export const emptyStateIconClass = 'empty-state-icon text-[length:var(--text-display-sm)]';

export const emptyStateHintClass =
  'empty-state-hint text-[length:var(--text-base-plus)] opacity-60';

export function comparisonCardClassName(
  tone: 'default' | 'mcp',
  size: 'default' | 'large',
  className?: string,
): string {
  return cn(
    'comparison-card rounded-portal-sm border-2 border-border bg-panel p-(--space-3)',
    size === 'large' && 'comparison-card-lg p-(--space-4)',
    tone === 'mcp'
      ? 'comparison-card-mcp border-[color:var(--brand)] bg-[color:var(--surface-active-soft-bg-subtle)]'
      : 'comparison-card-plain',
    className,
  );
}

export function comparisonCardHeaderClassName(size: 'default' | 'large'): string {
  return cn(
    'comparison-card-header mb-(--space-2) flex items-center gap-1.5 border-b border-border pb-1.5',
    size === 'large' && 'comparison-card-header-lg mb-2.5 gap-(--space-2) border-b-0 pb-0',
  );
}

export function comparisonIconClassName(size: 'default' | 'large'): string {
  return cn(
    'comparison-icon text-base',
    size === 'large' && 'comparison-icon-lg text-[length:var(--text-lg-plus)]',
  );
}

export function comparisonCardTitleClassName(size: 'default' | 'large'): string {
  return cn(
    'comparison-card-title text-[length:var(--text-base-sm)]',
    size === 'large' && 'comparison-card-title-lg text-[length:var(--text-base-plus)]',
  );
}

export const comparisonCardBodyClass =
  'comparison-card-body text-[length:var(--text-base-plus)] leading-[var(--leading-copy)]';

export function skipLinkClassName(tone: 'default' | 'landing', className?: string): string {
  return cn(
    'skip-link absolute font-bold no-underline',
    tone === 'landing'
      ? cn(
          'skip-link-landing left-4 top-[-48px] z-20 rounded-portal-md bg-[color:var(--landing-color-white)] px-4 py-3 text-[color:var(--landing-color-text-primary)] shadow-[var(--landing-shadow-card)] focus:top-4',
        )
      : cn(
          'left-[-9999px] top-0 z-[var(--z-skip-link)] rounded-br-portal-sm bg-brand px-4 py-2 text-[color:var(--surface-button-primary-fg)] focus:left-0',
        ),
    className,
  );
}

export const keyValueListClass = cn(
  'key-value-list m-0 grid list-none gap-(--space-3) p-0',
  '[&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-(--space-4) [&_li]:border-t [&_li]:border-[color:var(--surface-border-strong)] [&_li]:pt-(--space-3)',
  '[&_li:first-child]:border-t-0 [&_li:first-child]:pt-0',
  '[&_span]:text-[color:var(--hero-note-text)]',
);

export const metricCardAccentClass = 'metric-card-accent m-0 font-bold text-foreground';

export const metaNoteClass = cn(
  'meta-note mb-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-[4px] border border-border bg-panel px-1.5 py-0.5 text-ui-xs text-muted',
);

export const metaNoteLgClass = cn(
  metaNoteClass,
  'meta-note-lg mb-(--space-2) px-(--space-2) py-1 text-[length:var(--text-base-sm)]',
);

export function metaNoteClassName(size: 'default' | 'large', className?: string): string {
  return cn(size === 'large' ? metaNoteLgClass : metaNoteClass, className);
}

export const metaNoteDetailClass = 'meta-note-detail ml-1 font-normal opacity-80';

export const tokenKeyClass = 'token-key text-accent-muted';

export function sessionBadgeClassName(connected: boolean, className?: string): string {
  return cn(
    'session-badge inline-flex items-center gap-(--space-2) rounded-portal-lg border border-border bg-panel px-(--space-3) py-1 text-ui-sm text-foreground',
    connected &&
      'connected border-[color:var(--surface-status-success-soft-border)] bg-[color:var(--surface-status-success-soft-bg)] text-[color:var(--surface-status-success-soft-text)]',
    className,
  );
}

export const sessionBadgeDotClass =
  'session-badge-dot inline-block size-2 rounded-full bg-[color:var(--surface-dot-muted)]';

export const sessionBadgeDotConnectedClass = 'bg-[color:var(--surface-dot-success)]';

export const sessionBadgeToolsClass = 'session-badge-tools opacity-60';

export function statusPillClassName(
  tone: 'ok' | 'error' | 'info' | 'mcp' | 'plain',
  variant: 'soft' | 'solid',
  className?: string,
): string {
  return cn(
    'status-pill inline-block rounded-full px-(--space-2) py-0.5 text-[length:var(--text-xs)] font-bold',
    variant === 'soft' && 'soft',
    variant === 'solid' &&
      cn(
        'solid px-1.5 py-px text-[length:var(--text-2xs)] font-semibold text-[color:var(--surface-button-primary-fg)]',
        tone === 'mcp' && 'tone-mcp bg-brand',
        tone === 'plain' && 'tone-plain bg-muted',
      ),
    variant === 'soft' &&
      tone === 'ok' &&
      'tone-ok bg-[color:var(--surface-status-success-soft-bg)]',
    variant === 'soft' &&
      tone === 'error' &&
      'tone-error bg-[color:var(--surface-status-error-soft-bg)]',
    variant === 'soft' &&
      tone === 'info' &&
      'tone-info bg-[color:var(--surface-status-info-soft-bg)]',
    `tone-${tone}`,
    className,
  );
}

export function formFieldClassName(compact: boolean, className?: string): string {
  return cn(
    'field',
    compact ? 'compact mt-0' : 'mt-(--space-3)',
    compact &&
      '[&_label]:mb-(--space-1) [&_label]:block [&_label]:text-[length:var(--text-sm-tight)] [&_label]:font-semibold',
    '[&_label]:font-bold',
    'focus-within:border-l-[length:var(--size-border-md)] focus-within:border-[color:var(--accent-border)] focus-within:pl-(--space-3)',
    className,
  );
}

export const hintClass = 'hint mt-(--space-1-5) text-base text-muted';

export const hintInlineClass = 'hint hint-inline text-base text-muted';

export const hintTightClass = 'hint hint-tight text-base text-muted';

export const monoClass = 'mono font-mono';

export const tabsClass = cn(
  'tabs inline-flex w-full max-md:w-full max-md:[&_.tab-btn]:min-w-0 max-md:[&_.tab-btn]:flex-1 max-md:[&_.tab-btn]:px-(--space-2-5) max-md:[&_.tab-btn]:py-(--space-2)',
  'max-sm:[&_.tab-btn]:px-(--space-1-5) max-sm:[&_.tab-btn]:text-[length:var(--text-base-sm)]',
);

export const fieldErrorClass = 'field-error mt-(--space-1-5) text-ui-lg font-bold text-danger';

export const inputControlClass = cn(
  'input-control mt-(--space-1-5) w-full min-h-[var(--size-touch-md)] rounded-portal-sm border border-[length:var(--size-border-sm)] border-[color:var(--surface-control-border)] bg-[color:var(--surface-control-bg)] px-(--space-3) py-(--space-2-5) text-foreground',
  controlFocusClass,
);

export const selectControlClass = cn(inputControlClass, 'select-control');

export const textareaControlClass = cn(inputControlClass, 'textarea-control');

export const checkboxInputClass = 'checkbox-input m-0 w-auto border-0 bg-transparent p-0';

export const checkboxFieldClass = 'checkbox-field inline-flex items-center gap-(--space-2)';

export const stepperClass = 'stepper m-0 grid list-none gap-(--space-2) p-0';

export function stepperItemClassName(state: '' | 'done' | 'active' | 'disabled'): string {
  return cn(
    'grid gap-(--space-2) rounded-portal-sm border border-border bg-[color:var(--surface-control-bg)] px-2.5 py-2 text-muted',
    state === 'done' &&
      'done border-[color:var(--surface-status-success-border)] text-[color:var(--ok)]',
    state === 'active' && 'active border-[color:var(--brand)] font-bold text-brand',
    state === 'disabled' && 'disabled',
  );
}

export const stepperMainClass = 'stepper-main';
export const stepperIconClass = 'stepper-icon';
export const stepperActionClass = 'stepper-action';

export const rawResponseClass = cn(
  'raw-response my-0 max-h-80 min-h-[120px] overflow-auto rounded-portal-sm border border-border bg-canvas-muted p-2.5 whitespace-pre-wrap',
);

export const rawResponseCodeClass = 'raw-response-code m-0 whitespace-pre-wrap';

export const modalClass = cn(
  'modal w-[min(480px,90vw)] max-w-[480px] rounded-portal-lg border border-border p-(--space-4)',
);

export function tabButtonClassName(selected: boolean, className?: string): string {
  return cn(
    'tab-btn cursor-pointer border-0 bg-[color:var(--surface-control-bg)] px-4 py-2 font-[inherit] font-bold text-foreground',
    '[&:not(:last-child)]:border-r [&:not(:last-child)]:border-border',
    selected &&
      'active bg-[image:var(--action-primary-bg)] text-[color:var(--action-primary-fg)] shadow-[var(--action-primary-shadow)]',
    controlFocusClass,
    className,
  );
}

export const dlGridClass = cn(
  'dl-grid grid gap-x-(--space-3) gap-y-(--space-2) [grid-template-columns:minmax(136px,190px)_1fr]',
  'max-md:[grid-template-columns:var(--layout-grid-1)] max-sm:gap-(--space-2)',
  '[&_dt]:text-[length:var(--text-base-sm)] [&_dt]:font-bold [&_dt]:tracking-[var(--tracking-wide)] [&_dt]:text-muted [&_dt]:uppercase',
  '[&_dd]:m-0 [&_dd]:leading-[var(--leading-copy)]',
);

export function brandLinkClassName(
  tone: 'default' | 'landing' | 'shell',
  className?: string,
): string {
  return cn(
    'brand-link inline-flex no-underline',
    tone === 'landing' &&
      cn(
        'brand-link-landing items-center gap-(--space-3-5)',
        '[&_.brand-link-mark]:inline-flex [&_.brand-link-mark]:size-[var(--size-icon-xl)] [&_.brand-link-mark]:items-center [&_.brand-link-mark]:justify-center [&_.brand-link-mark]:rounded-portal-sm [&_.brand-link-mark]:bg-[image:var(--shell-button-primary-bg)] [&_.brand-link-mark]:text-[color:var(--landing-color-white)] [&_.brand-link-mark]:shadow-[var(--shell-button-primary-shadow)]',
        '[&_.brand-link-copy]:gap-0',
      ),
    tone === 'default' &&
      'brand-link-default items-center gap-(--space-3) text-[length:var(--text-lg-plus)] font-bold tracking-[var(--tracking-subtle)]',
    tone === 'shell' &&
      cn(
        'brand-link-default items-center gap-(--space-3) text-[length:var(--text-lg-plus)] font-bold tracking-[var(--tracking-subtle)] text-[color:var(--shell-sidebar-link-active-text)]',
        '[&_.brand-link-subtitle]:text-[color:var(--shell-sidebar-link-text)]',
      ),
    className,
  );
}

export const brandLinkMarkClass = 'brand-link-mark inline-flex items-center justify-center';
export const brandLinkCopyClass = cn('brand-link-copy inline-flex flex-col', 'gap-(--space-0-5)');
export const brandLinkTitleRowClass =
  'brand-link-title-row inline-flex flex-wrap items-center gap-(--space-3)';
export const brandLinkNameClass = 'brand-link-name font-extrabold tracking-[var(--tracking-snug)]';
export const brandLinkSubtitleClass =
  'brand-link-subtitle text-[length:var(--text-xs)] text-faint uppercase tracking-[var(--tracking-label)]';

export function navCardLinkClassName(active: boolean, className?: string): string {
  return cn(
    'nav-card-link relative flex items-center rounded-portal-sm border border-transparent bg-transparent py-(--space-2-5) pr-(--space-3) pl-(--space-4) font-semibold text-[color:var(--shell-sidebar-link-text)] shadow-none no-underline transition-[color,background,border-color] duration-200',
    'before:absolute before:top-(--space-2-5) before:bottom-(--space-2-5) before:left-0 before:w-[var(--size-border-md)] before:rounded-full before:bg-transparent before:content-[""]',
    'hover:border-[color:var(--shell-sidebar-link-hover-border)] hover:bg-[color:var(--shell-sidebar-link-bg)] hover:text-[color:var(--shell-sidebar-link-hover-text)]',
    active &&
      'active border-transparent bg-[color:var(--shell-sidebar-link-active-bg)] text-[color:var(--shell-sidebar-link-active-text)] shadow-none before:bg-[color:var(--shell-sidebar-link-active-indicator)]',
    'min-shell:py-(--space-3) min-shell:pr-(--space-3) min-shell:pl-(--space-4-5)',
    '[&.disabled]:pointer-events-none [&.disabled]:opacity-[var(--opacity-disabled)]',
    className,
  );
}

export const pageHeroNoteClass = cn(
  'page-hero-note grid gap-(--space-4) rounded-portal-md border border-[length:var(--size-border-sm)] border-[color:var(--hero-note-border)] bg-[color:var(--hero-note-bg)] p-(--space-5) text-[color:var(--shell-sidebar-text-strong)] backdrop-blur-[length:var(--blur-sm)]',
);

export const pageHeroNoteTitleClass =
  'page-hero-note-title text-[length:var(--text-3xl)] tracking-[var(--tracking-tight)]';

export const pageHeroNoteTextClass =
  'page-hero-note-text m-0 leading-[var(--leading-copy)] text-[color:var(--hero-note-text)]';

export const sectionHeadingTitleClass = 'm-0 tracking-[var(--tracking-tight)]';

export const sectionHeadingDescriptionClass = cn(
  'm-0 text-[length:var(--text-lg-plus)] leading-[var(--leading-loose)]',
);

export const featureCardTitleClass =
  'text-[length:var(--text-title)] tracking-[var(--tracking-snug)]';

export const featureCardDescriptionClass = cn(
  'm-0 text-[length:var(--text-lg-plus)] leading-[var(--leading-loose)]',
);

export const landingIconWrapClass = cn(
  'landing-icon-wrap mb-(--space-4) inline-flex size-[var(--size-icon-2xl)] h-[var(--size-touch-lg)] items-center justify-center rounded-[var(--radius-md-plus)] bg-[color:var(--landing-accent-soft-bg)] text-accent',
);

export const landingCardClass = cn(
  'landing-card rounded-[var(--landing-radius-lg)] border border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-light)] bg-[color:var(--landing-color-white)] p-(--space-6-5) shadow-[var(--landing-shadow-card)]',
);

export const landingSectionHeadingClass = cn(
  'landing-section-heading mb-(--space-6) max-w-[var(--width-prose-xl)]',
);

export const landingSectionHeadingCompactClass = cn(
  landingSectionHeadingClass,
  'landing-section-heading-compact',
);

export const landingSectionHeadingTitleClass = cn(
  sectionHeadingTitleClass,
  'mt-(--space-3-5) text-[length:var(--text-display-sm)] font-bold leading-[var(--leading-compact)]',
);

export const landingSectionHeadingDescriptionClass = cn(
  sectionHeadingDescriptionClass,
  'mt-(--space-3-5) text-[color:var(--landing-color-text-secondary)]',
);

export const landingFeatureCardDescriptionClass = cn(
  featureCardDescriptionClass,
  'mt-(--space-3-5) text-[color:var(--landing-color-text-secondary)]',
);

export const statCardValueClass = 'text-[length:var(--text-title)] tracking-[var(--tracking-snug)]';
