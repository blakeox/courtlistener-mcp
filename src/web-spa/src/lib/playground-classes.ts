import { cn } from './cn';

/** Tailwind compositions for Playground chat, compare, and MCP transcript UI. */

export const chatStreamClass = cn(
  'chat-stream min-h-[var(--size-chat-stream-min)] max-h-[var(--size-chat-stream-max)] overflow-auto py-(--space-2)',
);

export const chatEmptyStateClass = 'chat-empty-state px-5 py-10 text-center';

export const chatUserRowClass = 'chat-user-row mb-(--space-3) flex justify-end';

export const chatUserBubbleClass = cn(
  'chat-user-bubble max-w-[80%] rounded-[12px_12px_2px_12px] bg-brand px-3.5 py-2.5 text-[0.9rem] leading-normal text-[color:var(--surface-button-primary-fg)]',
  'max-sm:max-w-full',
);

export const chatComparisonItemClass = 'chat-comparison-item mb-(--space-4)';

export const comparisonGridClass = cn(
  'comparison-grid grid grid-cols-2 gap-2.5 max-md:grid-cols-1',
);

export const comparisonGridWideClass = cn(
  comparisonGridClass,
  'comparison-grid-wide gap-(--space-3)',
);

export const comparisonLatencyClass =
  'comparison-latency mt-(--space-1) text-center text-[0.75rem] text-faint';

export const chatControlsRowClass = cn(
  'chat-controls-row mb-(--space-2) max-md:flex-col max-md:items-stretch max-md:gap-(--space-3)',
);

export const chatControlGrowClass = cn(
  'chat-control-grow min-w-[120px] flex-[1_1_140px] max-md:w-full max-md:flex-auto',
);

export const chatControlFixedClass = cn(
  'chat-control-fixed flex-[0_0_130px] max-md:w-full max-md:flex-auto',
);

export const chatControlActionClass = cn(
  'chat-control-action flex flex-[0_0_auto] items-end max-md:w-full max-md:flex-auto max-md:[&_.btn]:w-full',
);

export const chatInputRowClass = cn(
  'chat-input-row flex items-end gap-(--space-2) max-md:flex-col max-md:items-stretch',
);

export const chatInputTextareaClass = 'chat-input-textarea flex-1 resize-y';

export const chatSendBtnClass = cn(
  'chat-send-btn h-[52px] min-w-[100px] max-md:w-full max-md:min-w-0',
);

export const comparePresetsClass = 'compare-presets mb-2.5';

export const comparisonSummaryClass = 'comparison-summary m-0 text-[0.9rem] leading-[1.6]';

export const playgroundModeSummaryClass = 'playground-mode-summary items-center';

export const transcriptPanelClass = cn(
  'transcript mono min-h-[var(--size-transcript-min)] max-h-[var(--size-transcript-max)] overflow-auto rounded-portal-sm border border-border bg-canvas-muted p-2.5',
);

export const transcriptEntryHeaderClass = 'transcript-entry-header mb-0.5';

export const transcriptEntryRoleClass = 'transcript-entry-role text-[0.8rem] uppercase';

export const transcriptEntryTimeClass = 'transcript-entry-time text-[0.7rem] opacity-50';

export const transcriptEntryActionClass = 'transcript-entry-action ml-auto text-[0.75rem]';

export const transcriptEntryBodyClass = 'transcript-entry-body text-[0.9rem] leading-normal';

const transcriptRoleStyles: Record<string, string> = {
  user: 'border-l-foreground [&_.transcript-entry-role]:text-foreground',
  assistant:
    'border-l-[color:var(--surface-accent-blue)] [&_.transcript-entry-role]:text-[color:var(--surface-accent-blue)]',
  system: 'border-l-muted [&_.transcript-entry-role]:text-faint',
  error:
    'border-l-[color:var(--danger)] text-foreground [&_.transcript-entry-role]:text-foreground [&_.transcript-entry-body]:text-foreground',
};

export function transcriptEntryClassName(role: string): string {
  const normalized =
    role === 'user' || role === 'assistant' || role === 'system' || role === 'error'
      ? role
      : 'system';
  return cn(
    'line transcript-entry relative mb-(--space-2) border-l-[3px] pl-2.5',
    normalized,
    transcriptRoleStyles[normalized],
  );
}

export const gridCompactClass = 'grid-compact grid gap-(--space-2)';

export const mdHeadingSmClass = 'md-heading md-heading-sm mb-(--space-1) mt-(--space-2)';

export const mdHeadingMdClass = 'md-heading md-heading-md mb-(--space-1) mt-2.5';

export const mdHeadingLgClass = 'md-heading md-heading-lg mb-(--space-1) mt-(--space-3)';

export const mdParagraphClass = 'md-paragraph my-(--space-1)';

export const asyncJobListClass = 'async-job-list mt-(--space-3) grid gap-(--space-2)';

export function asyncJobItemClassName(active: boolean): string {
  return cn(
    'async-job-item cursor-pointer rounded-portal-sm border border-border bg-panel px-(--space-2) py-(--space-2) text-left',
    active && 'active border-brand bg-[color:var(--surface-active-soft-bg)]',
  );
}

export const asyncJobItemHeaderClass =
  'async-job-item-header flex flex-wrap items-center justify-between gap-(--space-2)';

export const asyncJobDetailClass = 'async-job-detail mt-3.5 border-t border-border pt-(--space-3)';

export const asyncJobHeadingClass = 'async-job-heading m-0 mb-(--space-2)';

export const asyncJobMetaClass = 'async-job-meta mb-(--space-2)';

export const asyncJobResultClass = 'async-job-result mono mt-(--space-2)';

export const recentPromptsClass = 'recent-prompts mt-2.5';

export const toolCatalogWrapClass = 'tool-catalog-wrap mt-(--space-3)';

export const toolCatalogGroupClass = 'tool-catalog-group mb-(--space-3)';

export const toolCatalogHeadingClass = 'tool-catalog-heading m-0 mb-1.5 text-brand';

export const toolCatalogGridClass = 'tool-catalog-grid grid gap-1.5';

export const toolCatalogItemClass = cn(
  'tool-catalog-item rounded-[6px] border border-border bg-panel px-(--space-3) py-(--space-2) text-[0.9rem]',
);

export const toolCatalogNameClass = 'tool-catalog-name font-semibold';

export const toolCatalogDescriptionClass = 'tool-catalog-description ml-(--space-2) opacity-70';

export const toolCatalogHintClass = 'tool-catalog-hint ml-(--space-2) text-[0.8rem] opacity-50';

export const protocolLogClass = 'protocol-log mt-(--space-2) max-h-[300px] overflow-auto';

const protocolDirectionStyles: Record<'request' | 'response', string> = {
  request:
    'border border-[color:color-mix(in_srgb,var(--surface-accent-blue)_20%,transparent)] bg-[color:var(--surface-accent-blue-soft-bg)]',
  response:
    'border border-[color:color-mix(in_srgb,var(--ok)_20%,transparent)] bg-[color:var(--surface-accent-green-soft-bg)]',
};

const protocolHeadingDirectionStyles: Record<'request' | 'response', string> = {
  request: 'text-[color:var(--surface-accent-blue-soft-text)]',
  response: 'text-[color:var(--surface-accent-green-soft-text)]',
};

function normalizeProtocolDirection(direction: string): 'request' | 'response' {
  return direction === 'request' ? 'request' : 'response';
}

export function protocolEntryClassName(direction: string): string {
  const normalized = normalizeProtocolDirection(direction);
  return cn(
    'protocol-entry mb-(--space-2) rounded px-(--space-2) py-1.5',
    normalized,
    protocolDirectionStyles[normalized],
  );
}

export function protocolEntryHeadingClassName(direction: string): string {
  const normalized = normalizeProtocolDirection(direction);
  return cn(
    'protocol-entry-heading mb-(--space-1) text-[0.75rem] font-semibold',
    normalized,
    protocolHeadingDirectionStyles[normalized],
  );
}

export const protocolEntryTimeClass = 'protocol-entry-time font-normal opacity-50';

export const protocolEntryPayloadClass = cn(
  'protocol-entry-payload mono m-0 max-h-[150px] overflow-auto text-[0.75rem] break-all whitespace-pre-wrap',
);
