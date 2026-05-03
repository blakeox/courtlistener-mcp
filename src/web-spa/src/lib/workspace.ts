import type { WorkspaceLink } from './workspace-shell';

export interface WorkspaceMetric {
  label: string;
  value: string;
  detail?: string;
}

export interface WorkspaceCardData {
  title: string;
  body: string;
  items?: string[];
  action?: WorkspaceLink;
}

export interface WorkspaceCodeBlock {
  title: string;
  code: string;
}

export interface WorkspaceTableData {
  title: string;
  columns: string[];
  rows: string[][];
}

export interface WorkspaceSection {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  actions?: WorkspaceLink[];
  metrics?: WorkspaceMetric[];
  cards?: WorkspaceCardData[];
  table?: WorkspaceTableData;
  codeBlocks?: WorkspaceCodeBlock[];
}

const WORKSPACE_GITHUB_URL = 'https://github.com/blakeox/courtlistener-mcp';

export const WORKSPACE_RECENT_SESSIONS = [
  ['Qualified Immunity - 6th Circuit', 'Search opinions from the last 5 years', 'Active', '2m ago'],
  ['Adverse Inference Sanctions', 'Federal appellate cases', 'Awaiting Review', '1h ago'],
  ['Docket Background - ABC Corp', 'Bankruptcy docket and related cases', 'Completed', 'Yesterday'],
  ['Judge Profile - Jane Doe', 'Orders and opinions by judge', 'Active', '2 days ago'],
  ['Recent Copyright Cases', 'Last 180 days', 'Completed', '3 days ago'],
];

export const WORKSPACE_SECTIONS: Record<string, WorkspaceSection> = {
  download: {
    key: 'download',
    eyebrow: 'Get started',
    title: 'Download MCP',
    description: 'Install locally, build, then verify the runtime.',
    actions: [
      { label: 'Open docs', to: '/app/docs' },
      { label: 'Connect client', to: '/app/connect' },
    ],
    metrics: [
      { label: 'Runtime', value: 'Node 18+' },
      { label: 'Transport', value: '/mcp' },
    ],
    cards: [
      { title: 'Install flow', body: 'Install deps, build, then run doctor.' },
      {
        title: 'Next step',
        body: 'Wire a client and validate readiness.',
        action: { label: 'View readiness', to: '/app/readiness' },
      },
    ],
    codeBlocks: [
      { title: 'Install command', code: 'pnpm install && npm run build && pnpm run doctor' },
    ],
  },
  connect: {
    key: 'connect',
    eyebrow: 'Get started',
    title: 'Connect AI Client',
    description: 'Configure a desktop, IDE, or custom MCP client.',
    actions: [
      { label: 'Download MCP', to: '/app/download' },
      { label: 'Open playground', to: '/app/playground' },
    ],
    metrics: [
      { label: 'Clients', value: 'Desktop + IDE' },
      { label: 'Auth', value: 'OAuth + BYOK' },
    ],
    cards: [
      {
        title: 'Connection flow',
        body: 'Add config, load credentials, and verify with a simple tool call.',
      },
    ],
    codeBlocks: [
      {
        title: 'Config snippet',
        code: '{"mcpServers":{"courtlistener":{"command":"node","args":["dist/index.js"]}}}',
      },
    ],
  },
  sessions: {
    key: 'sessions',
    eyebrow: 'Agent workspace',
    title: 'Research Sessions',
    description: 'Track persistent research work with visible status and export state.',
    actions: [
      { label: 'Start research session', to: '/app' },
      { label: 'Open review queue', to: '/app/review' },
    ],
    metrics: [
      { label: 'Active', value: '12' },
      { label: 'Awaiting review', value: '4' },
    ],
    cards: [
      {
        title: 'Session model',
        body: 'Keep the question, transcript, approvals, and outputs together.',
      },
      { title: 'Layout', body: 'Use a timeline, filters, and export action.' },
    ],
    table: {
      title: 'Recent research sessions',
      columns: ['Session', 'Query / Description', 'Status', 'Last Updated'],
      rows: WORKSPACE_RECENT_SESSIONS,
    },
  },
  workflows: {
    key: 'workflows',
    eyebrow: 'Agent workspace',
    title: 'Workflow Templates',
    description: 'Practical starting points for repeatable research jobs.',
    actions: [
      { label: 'Start from dashboard', to: '/app' },
      { label: 'Open tool builder', to: '/app/tools' },
    ],
    metrics: [
      { label: 'Templates', value: '6' },
      { label: 'Trace defaults', value: 'On' },
    ],
    cards: [
      {
        title: 'Suggested templates',
        body: 'Qualified immunity, judge profile, and docket background are strong starters.',
      },
      { title: 'Template anatomy', body: 'Declare inputs, tool sequence, and output shape.' },
    ],
  },
  tools: {
    key: 'tools',
    eyebrow: 'Agent workspace',
    title: 'Tool Builder',
    description: 'Build MCP calls from plain language and inspect the JSON before running.',
    actions: [
      { label: 'Open playground', to: '/app/playground' },
      { label: 'Open diagnostics', to: '/app/diagnostics' },
    ],
    metrics: [
      { label: 'Mode', value: 'Natural language + JSON' },
      { label: 'Catalog', value: 'Live MCP tools' },
    ],
    cards: [
      { title: 'Builder flow', body: 'Translate request -> edit arguments -> approve -> run.' },
      { title: 'Guardrails', body: 'Show required fields and recovery hints before sending.' },
    ],
    codeBlocks: [
      {
        title: 'Example payload',
        code: '{"name":"search_cases","arguments":{"query":"qualified immunity","page_size":5}}',
      },
    ],
  },
  review: {
    key: 'review',
    eyebrow: 'Agent workspace',
    title: 'Human Review Queue',
    description: 'Keep pending approvals explicit and reviewable.',
    actions: [
      { label: 'Open sessions', to: '/app/sessions' },
      { label: 'Open docs', to: '/app/docs' },
    ],
    metrics: [
      { label: 'Pending', value: '3' },
      { label: 'Retention', value: 'Trace logged' },
    ],
    cards: [
      {
        title: 'Approval card',
        body: 'Show the tool, arguments, reason, and session context together.',
      },
      {
        title: 'Review ergonomics',
        body: 'Favor readable payloads and obvious approve/reject actions.',
      },
    ],
  },
  observability: {
    key: 'observability',
    eyebrow: 'Monitor',
    title: 'Agent Observability',
    description: 'Inspect volume, latency, failures, and tool mix in one view.',
    actions: [
      { label: 'Usage & history', to: '/app/usage' },
      { label: 'Runtime diagnostics', to: '/app/diagnostics' },
    ],
    metrics: [
      { label: 'Requests 24h', value: '342' },
      { label: 'Avg latency', value: '812ms' },
    ],
    cards: [
      { title: 'Key views', body: 'Track latency, errors, and session replay links.' },
      {
        title: 'Legal workflow signals',
        body: 'Show approval lag, trace coverage, and heavy research paths.',
      },
    ],
  },
  usage: {
    key: 'usage',
    eyebrow: 'Monitor',
    title: 'Usage & History',
    description: 'Summarize operator activity and route usage quickly.',
    actions: [
      { label: 'Open session', to: '/app/session' },
      { label: 'View observability', to: '/app/observability' },
    ],
    metrics: [
      { label: 'Scope', value: 'User + route' },
      { label: 'Billing', value: 'BYOK first' },
    ],
    cards: [
      { title: 'Usage tiles', body: 'Current day requests, top routes, and last-seen timestamps.' },
      { title: 'History panel', body: 'Recent session starts and recoverable failures.' },
    ],
  },
  readiness: {
    key: 'readiness',
    eyebrow: 'Monitor',
    title: 'Agent Readiness',
    description: 'Show whether the environment is ready for agent workflows.',
    actions: [
      { label: 'Open diagnostics', to: '/app/diagnostics' },
      { label: 'Open session', to: '/app/session' },
    ],
    metrics: [
      { label: 'Checks', value: '7' },
      { label: 'Score', value: '0-100' },
    ],
    cards: [
      {
        title: 'Recommended checks',
        body: 'MCP reachable, OAuth active, tools available, playground ready.',
      },
      {
        title: 'Recovery',
        body: 'Send auth issues to Session and protocol issues to Diagnostics.',
      },
    ],
  },
  credentials: {
    key: 'credentials',
    eyebrow: 'Account',
    title: 'Credentials & Providers',
    description: 'Bring your own keys and keep provider posture visible.',
    actions: [
      { label: 'Open session', to: '/app/session' },
      { label: 'Open docs', to: '/app/docs' },
    ],
    metrics: [
      { label: 'Model provider', value: 'OpenAI' },
      { label: 'AI Gateway', value: 'Cloudflare' },
    ],
    cards: [
      {
        title: 'Provider status',
        body: 'OpenAI, Cloudflare AI Gateway, and CourtListener stay visible.',
      },
      { title: 'Storage mode', body: 'Keys are encrypted at rest and deletable by the user.' },
    ],
  },
  docs: {
    key: 'docs',
    eyebrow: 'Account',
    title: 'Docs',
    description: 'Keep install, connection, and troubleshooting docs close by.',
    actions: [
      { label: 'Open repository', to: WORKSPACE_GITHUB_URL, external: true },
      { label: 'Download MCP', to: '/app/download' },
    ],
    metrics: [
      { label: 'Core docs', value: 'Install + auth + runtime' },
      { label: 'Source', value: 'GitHub README' },
    ],
    cards: [
      {
        title: 'Recommended docs',
        body: 'Install MCP, connect clients, verify auth, and run the playground.',
      },
      { title: 'Useful links', body: 'README and repository links should stay visible.' },
    ],
    codeBlocks: [{ title: 'Build and typecheck', code: 'npm run build && npm run typecheck' }],
  },
};
