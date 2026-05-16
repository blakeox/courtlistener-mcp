import { cn } from './cn';

/** Tailwind compositions for the marketing landing page (hook classes preserved for tests). */

export const landingPageClass = cn(
  'landing-page min-h-[var(--size-viewport-full)] bg-[color:var(--landing-color-paper)] text-[color:var(--landing-color-text-primary)]',
  '[&_svg]:size-[var(--size-icon-md)]',
);

export const landingContainerClass = cn(
  'landing-container mx-auto max-w-[var(--size-layout-max)] px-(--space-6) max-md:px-(--space-5-5)',
);

export const landingHeaderClass = cn(
  'landing-header sticky top-0 z-[var(--z-sticky)] min-h-[var(--size-header)] border-b border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-light)] bg-[color:var(--landing-header-bg)] backdrop-blur-[length:var(--blur-md)]',
);

export const landingHeaderInnerClass = cn(
  'landing-header-inner flex min-h-[var(--size-header)] items-center justify-between gap-(--space-5)',
);

export const landingMenuToggleClass = cn(
  'landing-menu-toggle hidden max-md:inline-flex',
  'rounded-[var(--landing-radius-md)] border border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-light)] bg-[color:var(--landing-color-white)] px-(--space-4) py-(--space-3) font-bold text-[color:var(--landing-color-text-primary)]',
);

export function landingNavClassName(open: boolean, className?: string): string {
  return cn(
    'landing-nav flex items-center gap-(--space-5-5)',
    'max-md:absolute max-md:top-[calc(100%+var(--space-2))] max-md:right-(--space-5-5) max-md:left-(--space-5-5) max-md:flex-col max-md:items-stretch max-md:rounded-[var(--landing-radius-lg)] max-md:border max-md:border-[color:var(--landing-color-border-light)] max-md:bg-[color:var(--landing-color-white)] max-md:p-(--space-4) max-md:shadow-[var(--landing-shadow-card)]',
    open ? 'open max-md:flex' : 'max-md:hidden',
    'max-md:[&_.landing-button-primary]:w-full',
    '[&_.landing-text-link]:font-semibold [&_.landing-text-link]:text-[color:var(--landing-color-text-secondary)] [&_.landing-text-link]:no-underline hover:[&_.landing-text-link]:text-[color:var(--landing-color-text-primary)]',
    '[&_.landing-button-primary]:text-[color:var(--landing-color-white)] hover:[&_.landing-button-primary]:text-[color:var(--landing-color-white)]',
    '[&_.landing-button-secondary]:text-[color:var(--landing-color-text-inverse)] hover:[&_.landing-button-secondary]:text-[color:var(--landing-color-text-inverse)]',
    className,
  );
}

export const landingHeroClass = cn(
  'landing-hero relative overflow-hidden bg-[image:var(--hero-bg)]',
  '[&_.landing-button-secondary]:border-[color:var(--landing-glass-border-strong)] [&_.landing-button-secondary]:bg-[color:var(--landing-glass-bg)] [&_.landing-button-secondary]:text-[color:var(--landing-color-text-inverse)]',
);

export const landingHeroBackdropClass =
  'landing-hero-backdrop pointer-events-none absolute inset-0';

export const landingHeroGridPatternClass = cn(
  'landing-grid-pattern absolute inset-0 opacity-[var(--opacity-grid)]',
  'bg-[radial-gradient(var(--hero-grid-dot)_var(--size-border-sm),transparent_var(--size-border-sm))] bg-size-[var(--size-grid-dot)_var(--size-grid-dot)]',
);

export const landingCourthouseSilhouetteClass = cn(
  'landing-courthouse-silhouette absolute bottom-[var(--offset-silhouette-bottom)] right-[var(--offset-silhouette-right)] h-[var(--size-hero-silhouette-height)] w-[min(var(--size-hero-silhouette),48vw)] opacity-[var(--opacity-silhouette)] blur-[length:var(--blur-hairline)]',
  '[clip-path:polygon(8%_78%,18%_33%,50%_10%,82%_33%,92%_78%,100%_78%,100%_84%,0_84%,0_78%)]',
  'bg-[linear-gradient(to_top,var(--landing-silhouette-highlight),transparent_70%),repeating-linear-gradient(90deg,transparent_0,transparent_11%,var(--landing-silhouette-highlight)_11%,var(--landing-silhouette-highlight)_15%,transparent_15%,transparent_21%)]',
);

export const landingHeroGridClass = cn(
  'landing-hero-grid relative grid min-h-[var(--size-hero-min)] items-center gap-(--space-8) py-(--space-9)',
  'grid-cols-[var(--layout-grid-split)] max-[1080px]:grid-cols-[var(--layout-grid-split)] max-md:min-h-0 max-md:grid-cols-1 max-md:gap-(--space-7) max-md:py-(--space-8)',
);

export const landingHeroCopyClass = 'landing-hero-copy relative z-[var(--z-raised)]';

export const landingHeroTitleClass = cn(
  'mt-(--space-4) text-[length:clamp(var(--text-display-lg),6vw,var(--text-display-2xl))] font-extrabold leading-[var(--leading-snug)] tracking-[var(--tracking-tighter)] text-[color:var(--landing-color-text-inverse)]',
  'max-md:text-[length:var(--text-display-md)]',
  '[&_span]:text-accent-muted',
);

export const landingHeroTextClass =
  'landing-hero-text mt-(--space-5) max-w-[var(--width-prose-md)] text-[length:var(--text-lg-plus)] leading-[var(--leading-loose)] text-[color:var(--landing-color-text-inverse-muted)]';

export const landingButtonRowClass = cn(
  'landing-button-row mt-(--space-6) max-md:flex-col max-md:[&_.landing-button]:w-full',
);

export const landingTrustCopyClass =
  'landing-trust-copy mt-(--space-5-5) font-semibold text-[color:var(--landing-color-text-inverse-muted)]';

export const landingHeroVisualClass = cn(
  'landing-hero-visual relative z-[var(--z-raised)] grid justify-items-end gap-(--space-5-5) max-md:justify-items-stretch',
);

export const landingHeroNoteClass = cn(
  'landing-hero-note flex w-full max-w-[var(--size-hero-note-max)] items-start gap-(--space-4) rounded-[var(--landing-radius-lg)] border border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-dark)] bg-[color:var(--landing-hero-note-bg)] p-(--space-4) text-[color:var(--landing-color-text-inverse)] max-md:w-full',
  '[&_strong]:mb-(--space-1) [&_strong]:block',
);

export const landingHeroNoteDescriptionClass = cn(
  'landing-hero-note-description',
  'leading-[var(--leading-body)] text-[color:var(--landing-color-text-inverse-muted)]',
);

export const landingSectionClass = cn('landing-section py-(--space-9)');

export const landingSectionLightClass = cn(
  landingSectionClass,
  'landing-section-light bg-[color:var(--landing-color-white)]',
);

const landingResponsiveGrid = (columns: string, lastChildSpan = false) =>
  cn(
    `grid-cols-[var(${columns})] max-[1080px]:grid-cols-[var(--layout-grid-split)] max-md:grid-cols-1`,
    lastChildSpan &&
      'max-[1080px]:[&_article:last-child]:col-span-2 max-md:[&_article:last-child]:col-span-auto',
  );

export const landingFeatureGridClass = cn(
  'landing-feature-grid grid gap-(--space-5)',
  landingResponsiveGrid('--layout-grid-4', true),
);

export const landingTrustGridClass = cn(
  'landing-trust-grid grid gap-(--space-5)',
  landingResponsiveGrid('--layout-grid-3', true),
);

export const landingOpenSourceStatsClass = cn(
  'landing-open-source-stats grid gap-(--space-5)',
  landingResponsiveGrid('--layout-grid-3', true),
);

export const landingSetupLayoutClass = cn(
  'landing-setup-layout grid items-start gap-(--space-5)',
  'grid-cols-[var(--layout-grid-asymmetric)] max-[1080px]:grid-cols-[var(--layout-grid-split)] max-md:grid-cols-1',
);

export const landingOpenSourceGridClass = cn(
  'landing-open-source-grid grid items-center gap-(--space-5)',
  'grid-cols-[var(--layout-grid-asymmetric-wide)] max-[1080px]:grid-cols-[var(--layout-grid-split)] max-md:grid-cols-1',
);

export const landingOpenSourceSectionClass =
  'landing-open-source bg-[image:var(--landing-open-source-gradient)]';

export const landingStatCardClass = cn(
  'landing-stat-card landing-card grid min-h-[var(--size-card-stat-min)] content-end gap-(--space-3) rounded-[var(--landing-radius-lg)] border border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-light)] bg-[color:var(--landing-color-white)] p-(--space-6-5) shadow-[var(--landing-shadow-card)]',
);

export const landingFooterClass = cn(
  'landing-footer border-t border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-light)] bg-[color:var(--landing-color-paper)] text-[color:var(--landing-color-text-muted)]',
);

export const landingFooterInnerClass = 'landing-footer-inner py-(--space-5)';

export const landingFooterBrandClass =
  'landing-footer-brand font-bold text-[color:var(--landing-color-text-primary)]';

export const landingFooterLinksClass = cn(
  'landing-footer-links justify-end max-md:justify-start',
  '[&_.landing-text-link]:font-semibold [&_.landing-text-link]:text-inherit [&_.landing-text-link]:no-underline hover:[&_.landing-text-link]:text-[color:var(--landing-color-text-primary)]',
);

export const landingFooterStackClass = 'max-md:flex-col max-md:items-start';

export const landingCodeCardClass = cn(
  'landing-code-card w-full max-w-[var(--size-hero-note-max)] rounded-[var(--landing-radius-lg)] border border-[length:var(--size-border-sm)] border-[color:var(--landing-code-border)] bg-[color:var(--landing-code-bg)] p-(--space-5-5) shadow-[var(--landing-shadow-hero-card)] backdrop-blur-[length:var(--blur-sm)] max-md:w-full',
  '[&_.row.between]:mb-(--space-4)',
  '[&_.raw-response-code]:m-0 [&_.raw-response-code]:overflow-x-auto [&_.raw-response-code]:text-[length:var(--text-base-ui)] [&_.raw-response-code]:leading-[var(--leading-extra)] [&_.raw-response-code]:text-[color:var(--landing-color-text-inverse)]',
);

export const landingPillClass = cn(
  'landing-pill inline-flex items-center text-[length:var(--text-base-sm)] font-bold tracking-[var(--tracking-label)] uppercase text-accent-muted',
);

export const landingSectionLabelClass = cn(
  'landing-section-label inline-flex items-center text-[length:var(--text-base-sm)] font-bold tracking-[var(--tracking-label)] uppercase text-accent-muted',
);

export const landingStatLabelClass = cn(
  'landing-stat-label inline-flex items-center text-[length:var(--text-base-sm)] font-bold tracking-[var(--tracking-label)] uppercase text-[color:var(--landing-color-text-muted)]',
);

export const brandLinkBadgeClass = cn(
  'brand-link-badge rounded-portal-pill border border-[length:var(--size-border-sm)] border-[color:var(--landing-accent-soft-border)] bg-[color:var(--landing-accent-soft-bg)] px-(--space-2) py-(--space-1) text-[length:var(--text-base-sm)] font-bold tracking-[var(--tracking-label)] uppercase text-accent',
);

export const landingTextLinkClass = 'landing-text-link text-inherit no-underline';

export const landingFeatureCardClass = cn(
  'landing-card landing-feature-card rounded-[var(--landing-radius-lg)] border border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-light)] bg-[color:var(--landing-color-white)] p-(--space-6-5) shadow-[var(--landing-shadow-card)]',
);

export const landingTrustCardClass = cn(
  'landing-card landing-trust-card rounded-[var(--landing-radius-lg)] border border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-light)] bg-[color:var(--landing-color-white)] p-(--space-6-5) shadow-[var(--landing-shadow-card)]',
);

export const landingSetupPanelClass = cn(
  'landing-setup-panel landing-card h-full rounded-[var(--landing-radius-lg)] border border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-light)] bg-[color:var(--landing-color-white)] p-(--space-6-5) shadow-[var(--landing-shadow-card)]',
);

export const landingSetupTabsClass =
  'landing-setup-tabs mb-(--space-5) flex flex-wrap gap-(--space-3)';

export function landingTabButtonClassName(selected: boolean, className?: string): string {
  return cn(
    'landing-tab cursor-pointer rounded-[var(--landing-radius-md)] border border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-light)] bg-[color:var(--landing-color-paper)] px-(--space-3-5) py-(--space-3-5) font-bold text-[color:var(--landing-color-text-secondary)]',
    selected &&
      'active border-[color:var(--landing-accent-active-border)] bg-[color:var(--landing-accent-soft-bg)] text-accent',
    className,
  );
}

export const landingSetupCopyClass = 'landing-setup-copy';

export const landingSetupCodeClass = cn(
  'landing-card landing-setup-code h-full rounded-[var(--landing-radius-lg)] border border-[length:var(--size-border-sm)] border-[color:var(--landing-color-border-light)] bg-[color:var(--landing-color-white)] p-(--space-6-5) shadow-[var(--landing-shadow-card)]',
);

export const landingNumberedListClass = cn(
  'landing-numbered-list mt-(--space-5) pl-(--space-5-5) text-[color:var(--landing-color-text-secondary)]',
  '[&_li+li]:mt-(--space-3)',
);

export const landingCommandRowClass = cn(
  'landing-command-row row mb-(--space-5-5) flex flex-wrap items-start gap-(--space-2) max-md:flex-col max-md:items-start',
);

export const landingCommandCaptionClass = cn(
  'landing-command-caption mt-(--space-2-5) max-w-[var(--width-prose-sm)] text-[length:var(--text-base-ui)] leading-[var(--leading-relaxed)] text-[color:var(--landing-color-text-secondary)]',
);

export const landingInlineLinksClass = cn(
  'landing-inline-links mt-(--space-3-5)',
  '[&_.landing-text-link]:font-bold [&_.landing-text-link]:text-accent hover:[&_.landing-text-link]:underline',
);

export const landingCommandChipClass = cn(
  'landing-command-chip text-[length:var(--text-base-sm)] font-bold tracking-[var(--tracking-label)] uppercase text-accent',
);

export const landingCodeTabsClass = 'landing-code-tabs flex flex-wrap items-center gap-(--space-3)';

export const landingCodeFormatBadgeClass = cn(
  'landing-code-format-badge text-[length:var(--text-base-sm)] font-bold tracking-[var(--tracking-label)] uppercase text-[color:var(--landing-color-text-inverse-muted)] border-[color:var(--landing-code-border-strong)] bg-[color:var(--landing-code-chip-bg)]',
);

export const landingCodeKeyClass = 'landing-code-key text-accent-muted';

export const landingCodeStringClass = 'landing-code-string text-[color:var(--code-syntax-string)]';

export const landingCodeArrayClass = 'landing-code-array text-[color:var(--code-syntax-string)]';

export const landingCodePunctuationClass =
  'landing-code-punctuation text-[color:var(--code-syntax-muted)]';

export const landingFooterTextLinkClass = cn(
  'landing-text-link font-semibold text-inherit no-underline hover:text-[color:var(--landing-color-text-primary)]',
);
