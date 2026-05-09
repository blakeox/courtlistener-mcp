export interface WorkspaceLink {
  label: string;
  shortLabel: string;
  to: string;
  external?: boolean;
  priority?: 'primary' | 'secondary';
}

export interface WorkspaceNavGroup {
  label: string;
  items: WorkspaceLink[];
  collapsible?: boolean;
}

export const WORKSPACE_DOCS_URL = 'https://github.com/blakeox/courtlistener-mcp#readme';

export const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    label: 'Get started',
    items: [
      { label: 'Overview', shortLabel: 'OV', to: '/app' },
      { label: 'Download', shortLabel: 'DL', to: '/app/download', priority: 'secondary' },
      { label: 'Connect', shortLabel: 'CN', to: '/app/connect', priority: 'secondary' },
      { label: 'Credentials', shortLabel: 'ID', to: '/app/credentials' },
      { label: 'Session', shortLabel: 'SE', to: '/app/session' },
    ],
  },
  {
    label: 'Work',
    items: [
      { label: 'Playground', shortLabel: 'PG', to: '/app/playground' },
      { label: 'Sessions', shortLabel: 'SS', to: '/app/sessions' },
      { label: 'Workflows', shortLabel: 'WF', to: '/app/workflows' },
      { label: 'Tools', shortLabel: 'TL', to: '/app/tools' },
      { label: 'Review', shortLabel: 'RV', to: '/app/review' },
    ],
  },
  {
    label: 'Operate',
    collapsible: true,
    items: [
      { label: 'Usage', shortLabel: 'US', to: '/app/usage', priority: 'primary' },
      { label: 'Observability', shortLabel: 'OB', to: '/app/observability', priority: 'primary' },
      { label: 'Diagnostics', shortLabel: 'DG', to: '/app/diagnostics', priority: 'secondary' },
      { label: 'Readiness', shortLabel: 'RD', to: '/app/readiness', priority: 'secondary' },
    ],
  },
];

const WORKSPACE_PATH_META = [
  { path: '/app', label: 'Overview', description: 'Review workspace activity and next steps.' },
  { path: '/app/download', label: 'Download', description: 'Install locally.' },
  { path: '/app/connect', label: 'Connect', description: 'Attach a client.' },
  { path: '/app/playground', label: 'Playground', description: 'Test tools.' },
  { path: '/app/sessions', label: 'Sessions', description: 'Track research.' },
  { path: '/app/workflows', label: 'Workflows', description: 'Start from templates.' },
  { path: '/app/tools', label: 'Tools', description: 'Compose tool calls.' },
  { path: '/app/review', label: 'Review', description: 'Approve actions.' },
  { path: '/app/usage', label: 'Usage', description: 'Inspect activity.' },
  { path: '/app/observability', label: 'Observability', description: 'Monitor health.' },
  { path: '/app/diagnostics', label: 'Diagnostics', description: 'Inspect protocol state.' },
  { path: '/app/readiness', label: 'Readiness', description: 'Check readiness.' },
  { path: '/app/credentials', label: 'Credentials', description: 'Manage providers.' },
  { path: '/app/session', label: 'Session', description: 'Inspect session.' },
  { path: '/app/account', label: 'Session', description: 'Legacy session route.' },
  { path: '/app/control-center', label: 'Overview', description: 'Legacy overview route.' },
  { path: '/app/docs', label: 'Docs', description: 'Install and troubleshoot.' },
];

export function getWorkspaceMeta(pathname: string): { label: string; description: string } {
  const match = WORKSPACE_PATH_META.find((entry) => pathname === entry.path);
  return match ?? { label: 'Overview', description: 'Review workspace activity and next steps.' };
}
