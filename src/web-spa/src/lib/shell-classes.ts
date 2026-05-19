import { cn } from './cn';

/** Tailwind compositions for the authenticated workspace shell (Shell.tsx). */

export const workspaceShellClass =
  'workspace-shell grid min-h-[var(--size-viewport-full)] w-full max-w-none bg-transparent';

export const workspaceMainLayoutClass = cn(
  'workspace-main-layout grid min-h-[var(--size-viewport-full)] items-stretch',
  'grid-cols-[var(--layout-shell-grid)] max-shell:grid-cols-1 max-shell:min-h-0',
);

export const mobileSidebarBackdropClass = cn(
  'mobile-sidebar-backdrop hidden border-0 p-0 max-shell:block max-shell:fixed max-shell:inset-0 max-shell:z-[var(--z-backdrop)]',
  'max-shell:bg-[color:var(--shell-sidebar-overlay)] max-shell:backdrop-blur-[length:var(--blur-xs)]',
);

export function workspaceSidebarClassName(open: boolean): string {
  return cn(
    'workspace-sidebar flex flex-col sticky top-0 self-start min-h-[var(--size-viewport-full)] max-h-[var(--size-viewport-full)] overflow-y-auto',
    'border-r border-[length:var(--size-border-sm)] border-[color:var(--shell-sidebar-border)] bg-[color:var(--shell-sidebar-bg)]',
    'px-(--space-5-5) pt-(--space-6-5) pb-(--space-5)',
    'max-shell:fixed max-shell:top-0 max-shell:left-0 max-shell:bottom-0 max-shell:z-[var(--z-drawer)]',
    'max-shell:hidden max-shell:h-[var(--size-viewport-full)] max-shell:max-h-none max-shell:w-[min(var(--size-mobile-drawer),92vw)]',
    'max-shell:rounded-none max-shell:border-0 max-shell:border-r max-shell:border-[color:var(--shell-sidebar-border)]',
    'max-shell:shadow-[var(--shell-sidebar-shadow)] max-shell:pt-[calc(var(--space-5)+env(safe-area-inset-top))]',
    'max-shell:pb-[calc(var(--space-5)+env(safe-area-inset-bottom))]',
    open && 'open max-shell:block',
  );
}

export const appSidebarHeaderClass = cn(
  'app-sidebar-header flex items-start justify-between gap-(--space-3) border-b border-[length:var(--size-border-sm)] border-[color:var(--shell-sidebar-divider)] pb-(--space-5-5)',
  'max-shell:items-center',
);

export const appSidebarBrandBlockClass = cn(
  'app-sidebar-brand-block flex items-start gap-(--space-3) max-shell:items-center',
);

export const appSidebarBrandMarkClass = cn(
  'app-sidebar-brand-mark inline-flex size-[var(--size-icon-lg)] items-center justify-center rounded-full',
  'bg-[color:var(--shell-sidebar-brand-mark-bg)] text-[length:var(--text-sm)] font-bold tracking-[var(--tracking-label)] text-[color:var(--shell-sidebar-brand-mark-text)]',
);

export const mobileSidebarCloseClass =
  'mobile-sidebar-close hidden max-shell:inline-flex max-shell:shrink-0';

export const shellMenuClass = cn(
  'menu grid flex-[var(--flex-auto)] gap-(--space-5-5) pt-(--space-5)',
);

export function menuGroupClassName(active: boolean): string {
  return cn('menu-group grid gap-(--space-2)', active && 'menu-group-active');
}

export const menuGroupHeaderClass = 'menu-group-header flex items-center gap-(--space-3)';

export const menuGroupDisclosureClass = cn(
  'menu-group-disclosure flex min-h-[var(--size-touch-sm)] w-full cursor-pointer appearance-none items-center justify-between gap-(--space-3)',
  'border-0 bg-transparent px-0 py-(--space-2)',
  'hover:bg-[color:var(--hero-note-bg)] focus-visible:rounded-portal-sm focus-visible:outline focus-visible:outline-[length:var(--size-focus-ring-sm)] focus-visible:outline-offset-[var(--size-focus-offset-lg)] focus-visible:outline-[color:var(--shell-focus-ring)]',
  'hover:[&_.menu-group-toggle-icon]:text-[color:var(--shell-sidebar-text-strong)]',
);

export function menuGroupLabelClassName(active: boolean): string {
  return cn(
    'menu-group-label m-0 text-[length:var(--text-base-sm)] font-bold tracking-[var(--tracking-wide)] text-[color:var(--shell-sidebar-text-muted)] uppercase',
    active &&
      'inline-flex items-center gap-(--space-1-5) text-[color:var(--shell-sidebar-text-strong)] before:size-[var(--size-dot-sm)] before:rounded-full before:bg-[color:var(--shell-sidebar-link-active-indicator)] before:content-[""]',
  );
}

export const menuGroupToggleIconClass =
  'menu-group-toggle-icon text-[length:var(--text-base)] leading-none';

const sidebarSectionVariantClass: Record<string, string> = {
  utility: 'sidebar-utility mt-auto gap-(--space-4) pt-(--space-5)',
  support: 'sidebar-support mt-(--space-4-5) gap-(--space-3) pt-(--space-4-5)',
};

export function sidebarSecondarySectionClassName(variant: string): string {
  return cn(
    'sidebar-secondary-section grid border-t border-[length:var(--size-border-sm)] border-[color:var(--shell-sidebar-divider)]',
    `sidebar-${variant}`,
    sidebarSectionVariantClass[variant],
  );
}

export function sidebarSecondaryLabelClassName(variant: string): string {
  return cn(
    'sidebar-secondary-label m-0 uppercase',
    `sidebar-${variant}-label`,
    variant === 'utility' &&
      'text-[length:var(--text-base-sm)] font-bold tracking-[var(--tracking-label)] text-[color:var(--shell-sidebar-text-strong)]',
    variant === 'support' &&
      'text-[length:var(--text-xs)] font-bold tracking-[var(--tracking-label)] text-[color:var(--shell-sidebar-text-muted)]',
  );
}

export function sidebarSecondaryLinksClassName(variant: string): string {
  return cn(
    'sidebar-secondary-links grid',
    `sidebar-${variant}-links`,
    variant === 'utility' && 'gap-(--space-1)',
    variant === 'support' && 'gap-(--space-0-5)',
  );
}

export function sidebarSecondaryNavLinkClassName(variant: string): string {
  return cn(
    'sidebar-secondary-link min-h-0 rounded-none border-0 bg-transparent px-0 py-(--space-2) font-semibold text-[color:var(--shell-sidebar-text-muted)]',
    `${variant}-nav-link`,
    'before:hidden hover:bg-transparent hover:text-[color:var(--shell-sidebar-link-hover-text)] hover:underline',
    'focus-visible:bg-transparent focus-visible:text-[color:var(--shell-sidebar-link-hover-text)] focus-visible:underline',
    '[&.active]:font-bold [&.active]:text-[color:var(--shell-sidebar-link-active-text)]',
  );
}

export const accountSupportCardClass = cn(
  'account-support-card border-dashed border-[color:var(--surface-border-strong)] bg-[color:var(--workspace-card-hover-bg)] shadow-none',
  '[&_h2]:text-[length:var(--text-xl)] [&_.muted]:text-[length:var(--text-md)]',
);

export const navCardLinkTextClass = 'nav-card-link-text inline';

export const navCardLinkMetaClass = cn(
  'nav-card-link-meta ml-auto text-[length:var(--text-2xs)] font-bold tracking-[var(--tracking-label)] text-[color:var(--shell-sidebar-text-muted)] uppercase',
);

export const shellMainColumnClass = cn(
  'shell-main-column grid min-w-0 grid-rows-[auto_auto_1fr] gap-(--space-5)',
  'px-[clamp(var(--space-5-5),3vw,var(--space-7))] pt-(--space-5) pb-(--space-7-5) max-shell:gap-(--space-5-5) max-shell:px-(--space-4) max-shell:pb-(--space-6-5) max-shell:pt-(--space-4-5)',
);

export const workspaceStatusStackClass = 'workspace-status-stack grid gap-(--space-4)';

export const workspaceTopbarClass = cn(
  'workspace-topbar flex items-center justify-between gap-(--space-4) border-b border-[length:var(--size-border-sm)] border-[color:var(--shell-topbar-border)] bg-[color:var(--shell-topbar-bg)] pb-(--space-4) backdrop-blur-[length:var(--blur-md)]',
  'max-sm:flex-col max-sm:items-stretch max-sm:gap-(--space-3) max-sm:px-(--space-3-5) max-sm:pt-(--space-3)',
);

export const topbarContextShellClass =
  'topbar-context-shell flex min-w-0 flex-[var(--flex-auto)] items-center p-0 max-sm:w-full';

export const topbarContextClass =
  'topbar-context grid min-w-0 flex-[var(--flex-auto)] gap-(--space-0-5) max-sm:gap-(--space-1-5)';

export const topbarContextValueClass = cn(
  'topbar-context-value block text-[length:var(--text-lg)] font-bold leading-[var(--leading-medium)] tracking-[var(--tracking-subtle)]',
  'max-shell:text-[length:var(--text-md-plus)]',
);

export const topbarContextDescriptionClass = cn(
  'topbar-context-description max-w-[var(--width-prose-sm)] text-[length:var(--text-base-plus)] leading-[var(--leading-ui)] text-[color:var(--shell-account-menu-text-subtle)]',
  'max-shell:text-[length:var(--text-md-sm)] max-topbar:max-w-none',
);

export const topbarActionsClass = cn(
  'topbar-actions flex min-w-0 flex-[var(--flex-none)] items-center justify-end gap-(--space-3)',
  'max-shell:flex-row max-shell:items-center max-shell:justify-end max-shell:gap-(--space-2-5)',
  'max-topbar:w-full max-topbar:justify-stretch max-topbar:items-stretch',
);

export const topActionsUtilityClass = cn(
  'top-actions top-actions-utility flex flex-wrap items-center justify-end gap-(--space-2-5)',
  'max-shell:gap-(--space-2)',
  'max-topbar:w-full max-topbar:justify-stretch max-topbar:items-stretch',
);

export const toolbarButtonClass = cn(
  'toolbar-button rounded-portal-sm max-sm:w-auto max-topbar:min-h-[var(--size-touch-sm)]',
);

export const toolbarUtilityButtonClass = cn(
  'toolbar-utility-button border-transparent bg-transparent shadow-none text-[color:var(--shell-account-menu-text-subtle)]',
  'hover:border-[color:var(--shell-button-secondary-border)] hover:bg-[color:var(--shell-button-secondary-bg)] hover:text-[color:var(--shell-button-secondary-text)]',
  'focus-visible:border-[color:var(--shell-button-secondary-border)] focus-visible:bg-[color:var(--shell-button-secondary-bg)] focus-visible:text-[color:var(--shell-button-secondary-text)]',
  'max-topbar:px-(--space-2-5)',
);

export const mobileMenuBtnClass = cn(
  'mobile-menu-btn toolbar-button hidden max-shell:inline-flex max-topbar:flex-[var(--flex-half)] max-topbar:min-w-0 max-topbar:px-(--space-2-5)',
);

export const themeToggleButtonClass = cn(
  'theme-toggle toolbar-button min-w-[var(--size-toolbar-min)] max-topbar:flex-[var(--flex-icon-fixed)] max-topbar:w-[var(--size-touch-sm)] max-topbar:px-0 max-topbar:px-(--space-2-5)',
);

export const themeToggleIconClass = 'theme-toggle-icon text-[length:var(--text-lg)] leading-none';

export const srOnlyClass =
  'sr-only absolute m-[calc(-1*var(--size-border-sm))] h-[var(--size-sr-only)] w-[var(--size-sr-only)] overflow-hidden border-0 p-0 whitespace-nowrap [clip:rect(0,0,0,0)]';

export const accountMenuClass = cn(
  'account-menu relative',
  'max-topbar:flex max-topbar:flex-[var(--flex-half)] max-topbar:min-w-0',
);

export function accountMenuTriggerClassName(options: { open: boolean; warning: boolean }): string {
  return cn(
    toolbarButtonClass,
    'account-menu-trigger inline-flex min-w-[var(--size-toolbar-label-min)] items-center gap-(--space-2)',
    'border-[color:var(--shell-button-secondary-border)] bg-[color:var(--shell-button-secondary-bg)] font-bold text-[color:var(--shell-button-secondary-text)] shadow-[var(--shell-button-primary-shadow)]',
    'hover:border-[color:var(--shell-sidebar-link-hover-border)] hover:bg-[color:var(--shell-sidebar-link-bg)] hover:text-[color:var(--shell-sidebar-link-hover-text)]',
    'focus-visible:border-[color:var(--shell-sidebar-link-hover-border)] focus-visible:bg-[color:var(--shell-sidebar-link-bg)] focus-visible:text-[color:var(--shell-sidebar-link-hover-text)]',
    'max-topbar:w-full max-topbar:min-w-0 max-topbar:justify-center',
    options.open && 'open [&_.account-menu-trigger-icon]:rotate-[var(--motion-rotate-flip)]',
    options.warning &&
      'warning border-[color:var(--shell-button-danger-border)] bg-[color:var(--account-menu-trigger-warning-bg)] text-[color:var(--shell-button-danger-text)]',
  );
}

export const accountMenuTriggerBadgeClass = cn(
  'account-menu-trigger-badge inline-flex size-[var(--size-icon-1-3)] items-center justify-center rounded-full',
  'bg-[color:var(--shell-button-danger-border)] text-[length:var(--text-sm-plus)] font-bold text-[color:var(--shell-button-danger-text)]',
);

export const accountMenuTriggerIconClass =
  'account-menu-trigger-icon text-[length:var(--text-base-sm)] leading-none transition-transform';

export function accountMenuPanelClassName(warning: boolean): string {
  return cn(
    'account-menu-panel absolute top-[calc(100%+var(--size-account-menu-offset))] right-0 z-[var(--z-overlay)] grid w-[min(var(--size-account-menu),calc(100vw-var(--space-6)))] gap-(--space-3-5)',
    'rounded-portal-lg border border-[length:var(--size-border-sm)] border-[color:var(--shell-account-menu-border)] bg-[color:var(--shell-account-menu-bg)] p-(--space-5-5) shadow-[var(--shell-account-menu-shadow)]',
    'max-topbar:w-[min(var(--size-mobile-drawer-sm),92vw)]',
    warning &&
      cn(
        'warning border-[color:var(--shell-button-danger-border)]',
        '[&.warning_.account-status-block]:border-[color:var(--shell-button-danger-border)] [&.warning_.account-status-block]:bg-[color:var(--account-status-warning-bg)]',
        '[&.warning_.account-status-eyebrow]:text-[color:var(--shell-button-danger-text)] [&.warning_.account-status-title]:text-[color:var(--shell-button-danger-text)]',
      ),
  );
}

export const accountStatusBlockClass =
  'account-status-block grid gap-(--space-2-5) rounded-portal-md border border-[length:var(--size-border-sm)] border-[color:var(--shell-account-menu-border)] bg-[color:var(--account-status-block-bg)] p-(--space-4)';

export const accountMenuPrimaryClass = 'account-menu-primary grid gap-(--space-2-5)';

export const accountStatusEyebrowClass =
  'account-status-eyebrow m-0 text-[length:var(--text-xs-tight)] font-bold tracking-[var(--tracking-label)] text-[color:var(--shell-sidebar-text-muted)] uppercase';

export const accountStatusTitleClass =
  'account-status-title m-0 text-[length:var(--text-lg)] font-bold leading-[var(--leading-medium)] text-[color:var(--shell-sidebar-text-strong)]';

export const accountStatusDetailClass =
  'account-status-detail m-0 text-[length:var(--text-md)] leading-[var(--leading-normal)] text-[color:var(--shell-account-menu-text-subtle)]';

export const accountMenuActionClass = 'account-menu-action w-full justify-center';

export const workspaceContentClass = cn(
  'workspace-content grid min-h-0 min-w-0 gap-(--space-5) py-(--space-2) pb-(--space-5)',
  'animate-[fade-in_var(--duration-fast)_var(--easing-out)]',
  'focus:outline-none focus-visible:outline focus-visible:outline-[length:var(--size-focus-ring-sm)] focus-visible:outline-offset-(--space-1-5) focus-visible:outline-[color:var(--shell-focus-ring)]',
);
