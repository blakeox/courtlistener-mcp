export interface WorkspaceLink {
  label: string;
  to: string;
  external?: boolean;
}

export interface WorkspaceNavGroup {
  label: string;
  items: WorkspaceLink[];
}

export const WORKSPACE_GITHUB_URL = 'https://github.com/blakeox/courtlistener-mcp';
export const WORKSPACE_DOCS_URL = 'https://github.com/blakeox/courtlistener-mcp#readme';

export const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    label: 'Get Started',
    items: [
      { label: 'Home', to: '/app' },
      { label: 'Download MCP', to: '/app/download' },
      { label: 'Connect AI Client', to: '/app/connect' },
      { label: 'Browser Playground', to: '/app/playground' },
    ],
  },
  {
    label: 'Agent Workspace',
    items: [
      { label: 'Research Sessions', to: '/app/sessions' },
      { label: 'Workflow Templates', to: '/app/workflows' },
      { label: 'Tool Builder', to: '/app/tools' },
      { label: 'Human Review Queue', to: '/app/review' },
    ],
  },
  {
    label: 'Monitor',
    items: [
      { label: 'Usage & History', to: '/app/usage' },
      { label: 'Agent Observability', to: '/app/observability' },
      { label: 'Runtime Diagnostics', to: '/app/diagnostics' },
      { label: 'Agent Readiness', to: '/app/readiness' },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Credentials & Providers', to: '/app/credentials' },
      { label: 'Session', to: '/app/session' },
      { label: 'Docs', to: '/app/docs' },
      { label: 'GitHub', to: WORKSPACE_GITHUB_URL, external: true },
    ],
  },
];

const WORKSPACE_PATH_META = [
  { path: '/app', label: 'Home', description: 'Default workspace' },
  { path: '/app/download', label: 'Download MCP', description: 'Install locally.' },
  { path: '/app/connect', label: 'Connect AI Client', description: 'Attach a client.' },
  { path: '/app/playground', label: 'Browser Playground', description: 'Test tools.' },
  { path: '/app/sessions', label: 'Research Sessions', description: 'Track research.' },
  { path: '/app/workflows', label: 'Workflow Templates', description: 'Start from templates.' },
  { path: '/app/tools', label: 'Tool Builder', description: 'Compose tool calls.' },
  { path: '/app/review', label: 'Human Review Queue', description: 'Approve actions.' },
  { path: '/app/usage', label: 'Usage & History', description: 'Inspect activity.' },
  { path: '/app/observability', label: 'Agent Observability', description: 'Monitor health.' },
  {
    path: '/app/diagnostics',
    label: 'Runtime Diagnostics',
    description: 'Inspect protocol state.',
  },
  { path: '/app/readiness', label: 'Agent Readiness', description: 'Check readiness.' },
  { path: '/app/credentials', label: 'Credentials & Providers', description: 'Manage providers.' },
  { path: '/app/session', label: 'Session', description: 'Inspect session.' },
  { path: '/app/account', label: 'Session', description: 'Legacy session route.' },
  { path: '/app/control-center', label: 'Home', description: 'Legacy home route.' },
  { path: '/app/docs', label: 'Docs', description: 'Install and troubleshoot.' },
];

export function getWorkspaceMeta(pathname: string): { label: string; description: string } {
  const match = WORKSPACE_PATH_META.find((entry) => pathname === entry.path);
  return match ?? { label: 'Agent Workspace', description: 'Default workspace' };
}
