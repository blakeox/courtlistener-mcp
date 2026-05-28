import { cn } from './cn';

/**
 * Typography and surfaces for workspace content on tan canvas / cream panels.
 * Use these on topbar, account menu, cards, and pages — not on the dark sidebar.
 *
 * Source of truth for colors remains tokens.css (`--workspace-chrome-*`, `--text-*`).
 */

export const workspaceCopyClass = 'text-foreground';

export const workspaceMutedClass = 'text-muted';

/** De-emphasized meta only (not long body copy). */
export const workspaceFaintClass = 'text-faint';

export const workspacePanelSurfaceClass = 'bg-panel border-border-subtle';

export const workspaceTableHeaderClass = cn(
  '[&_th]:text-muted [&_th]:font-bold',
  '[&_td]:text-foreground',
);
