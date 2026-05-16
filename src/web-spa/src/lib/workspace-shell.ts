export interface WorkspaceLink {
  label: string;
  shortLabel: string;
  to: string;
  external?: boolean;
  priority?: 'primary' | 'secondary';
}

export interface WorkspaceNavGroup {
  id: string;
  label: string;
  items: WorkspaceLink[];
  collapsible?: boolean;
  secondaryExpandLabel?: string;
  secondaryCollapseLabel?: string;
}

export interface WorkspaceSecondaryNavSection {
  id: string;
  label: string;
  variant: 'utility' | 'support';
  items: WorkspaceLink[];
}

export const WORKSPACE_DOCS_URL = 'https://github.com/blakeox/courtlistener-mcp#readme';

const WORKSPACE_UTILITY_LINKS: WorkspaceLink[] = [
  { label: 'Account', shortLabel: 'AC', to: '/app/account' },
  { label: 'Credentials', shortLabel: 'CR', to: '/app/credentials' },
];

export const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    items: [{ label: 'Overview', shortLabel: 'OV', to: '/app' }],
  },
  {
    id: 'setup',
    label: 'Setup',
    collapsible: true,
    secondaryExpandLabel: 'Show setup links',
    secondaryCollapseLabel: 'Hide setup links',
    items: [
      { label: 'Diagnostics', shortLabel: 'DG', to: '/app/diagnostics' },
      { label: 'Account', shortLabel: 'AC', to: '/app/account' },
      { label: 'Docs', shortLabel: 'DC', to: WORKSPACE_DOCS_URL, external: true },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    items: [{ label: 'Playground', shortLabel: 'PG', to: '/app/playground' }],
  },
  {
    id: 'operate',
    label: 'Operate',
    collapsible: true,
    secondaryExpandLabel: 'Show diagnostics links',
    secondaryCollapseLabel: 'Hide diagnostics links',
    items: [
      { label: 'Usage', shortLabel: 'US', to: '/app/usage', priority: 'primary' },
      { label: 'Observability', shortLabel: 'OB', to: '/app/observability', priority: 'primary' },
      { label: 'Diagnostics', shortLabel: 'DG', to: '/app/diagnostics', priority: 'secondary' },
    ],
  },
];

export const WORKSPACE_SECONDARY_NAV_SECTIONS: WorkspaceSecondaryNavSection[] = [
  {
    id: 'workspace-utilities',
    label: 'Workspace utilities',
    variant: 'utility',
    items: WORKSPACE_UTILITY_LINKS,
  },
  {
    id: 'setup-help',
    label: 'Setup & help',
    variant: 'support',
    items: [
      { label: 'Diagnostics', shortLabel: 'DG', to: '/app/diagnostics' },
      { label: 'Docs', shortLabel: 'DC', to: WORKSPACE_DOCS_URL, external: true },
    ],
  },
];

const PRIORITIZED_WORKSPACE_GROUP_IDS = ['home', 'work', 'operate'] as const;

export function getWorkspaceNavGroups(prioritizeWorkNav: boolean): WorkspaceNavGroup[] {
  if (!prioritizeWorkNav) {
    return WORKSPACE_NAV_GROUPS;
  }

  return PRIORITIZED_WORKSPACE_GROUP_IDS.map((groupId) =>
    WORKSPACE_NAV_GROUPS.find((group) => group.id === groupId),
  ).filter((group): group is WorkspaceNavGroup => Boolean(group));
}

export function getWorkspaceSecondaryNavSections(
  prioritizeWorkNav: boolean,
): WorkspaceSecondaryNavSection[] {
  return WORKSPACE_SECONDARY_NAV_SECTIONS.filter(
    (section) => prioritizeWorkNav || section.variant === 'utility',
  );
}

const WORKSPACE_PATH_META = [
  { path: '/app', label: 'Overview', description: 'Review workspace activity and next steps.' },
  { path: '/app/download', label: 'Diagnostics', description: 'Legacy install route.' },
  { path: '/app/connect', label: 'Playground', description: 'Legacy connect route.' },
  { path: '/app/playground', label: 'Playground', description: 'Test tools.' },
  { path: '/app/sessions', label: 'Overview', description: 'Legacy sessions route.' },
  { path: '/app/workflows', label: 'Playground', description: 'Legacy workflows route.' },
  { path: '/app/tools', label: 'Playground', description: 'Legacy tools route.' },
  { path: '/app/review', label: 'Overview', description: 'Legacy review route.' },
  { path: '/app/usage', label: 'Usage', description: 'Inspect activity.' },
  { path: '/app/observability', label: 'Observability', description: 'Monitor health.' },
  { path: '/app/diagnostics', label: 'Diagnostics', description: 'Inspect protocol state.' },
  { path: '/app/readiness', label: 'Diagnostics', description: 'Legacy diagnostics route.' },
  { path: '/app/credentials', label: 'Account', description: 'Legacy credentials route.' },
  { path: '/app/account', label: 'Account', description: 'Manage access and recovery.' },
  { path: '/app/session', label: 'Account', description: 'Legacy account route.' },
  { path: '/app/control-center', label: 'Overview', description: 'Legacy overview route.' },
  { path: '/app/docs', label: 'Docs', description: 'Open repository docs.' },
];

export function getWorkspaceMeta(pathname: string): { label: string; description: string } {
  const match = [...WORKSPACE_PATH_META]
    .sort((left, right) => right.path.length - left.path.length)
    .find((entry) => pathname === entry.path || pathname.startsWith(`${entry.path}/`));
  return match ?? { label: 'Overview', description: 'Review workspace activity and next steps.' };
}
