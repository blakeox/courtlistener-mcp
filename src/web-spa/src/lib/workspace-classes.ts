import { cn } from './cn';

/** Shared Tailwind compositions for authenticated workspace pages. */

export const stackClass = 'stack grid gap-(--space-3)';

export const twoColClass = cn(
  'two-col grid grid-cols-[1.2fr_1fr] gap-(--space-3) max-md:grid-cols-1 max-sm:gap-(--space-2)',
);

export const twoUpGridClass = cn('two-up-grid grid grid-cols-2 gap-4 max-md:grid-cols-1');

export const pageCardGridClass = cn(
  'page-card-grid grid grid-cols-[var(--layout-grid-2col-even)] items-start gap-(--space-4) max-md:grid-cols-1',
);

export const pageStatusBannerClass = 'page-status-banner mt-(--space-2-5)';

export const turnstileWrapClass = 'turnstile-wrap mt-(--space-3)';

export const orderedListClass = 'ordered mt-2.5 pl-5';

export const tableScrollClass = 'table-scroll w-full overflow-x-auto';

export const tableClass = cn(
  'table mt-(--space-3) w-full min-w-[640px] border-collapse',
  '[&_th]:border-b [&_th]:border-line [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:align-top',
  '[&_td]:border-b [&_td]:border-line [&_td]:px-2 [&_td]:py-2 [&_td]:text-left [&_td]:align-top',
);
