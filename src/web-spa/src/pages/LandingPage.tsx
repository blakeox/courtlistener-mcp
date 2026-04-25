import React from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const REPOSITORY_URL = 'https://github.com/blakeox/courtlistener-mcp';
const DOCUMENTATION_URL = `${REPOSITORY_URL}#readme`;
const DOWNLOAD_ZIP_URL = `${REPOSITORY_URL}/archive/refs/heads/main.zip`;
const DOWNLOAD_TAR_URL = `${REPOSITORY_URL}/archive/refs/heads/main.tar.gz`;
const INSTALL_COMMAND =
  'git clone https://github.com/blakeox/courtlistener-mcp.git && cd courtlistener-mcp && pnpm install && pnpm build';
const featureItems = [
  {
    title: 'Search Opinions',
    description: 'Find federal court opinions by query, citation, docket, and more.',
    icon: SearchIcon,
  },
  {
    title: 'Lookup Cases',
    description: 'Retrieve case metadata, parties, filings, and procedural history.',
    icon: CaseLookupIcon,
  },
  {
    title: 'Explore Courts',
    description: 'Browse courts, judges, jurisdictions, and related metadata.',
    icon: CourtIcon,
  },
  {
    title: 'AI-Ready',
    description: 'Built for LLMs and agents using the Model Context Protocol.',
    icon: BracketsIcon,
  },
] as const;

const trustItems = [
  {
    title: 'Public Data Only',
    description: 'Connects to publicly available legal data sources.',
    icon: ShieldCheckIcon,
  },
  {
    title: 'Read-Only by Design',
    description: 'Retrieves legal information without modifying court records or external systems.',
    icon: ReadOnlyIcon,
  },
  {
    title: 'Human Review Expected',
    description: 'Supports legal research workflows rather than replacing professional judgment.',
    icon: HumanReviewIcon,
  },
] as const;

const openSourceStats = [
  { label: 'Repository', value: 'blakeox/courtlistener-mcp' },
  { label: 'License', value: 'MIT' },
  { label: 'Download', value: 'ZIP or tar.gz' },
] as const;

const setupClients = [
  {
    id: 'claude',
    label: 'Claude Desktop',
    eyebrow: 'Desktop client',
    description:
      'Add CourtListener MCP to Claude Desktop so local or hosted AI workflows can query federal court data through MCP.',
    steps: [
      'Clone the repository, install dependencies with pnpm, and build the dist output.',
      'Add the JSON snippet below to your Claude Desktop MCP configuration.',
      'Restart Claude Desktop and confirm CourtListener appears as an available MCP server.',
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    eyebrow: 'Editor workflow',
    description:
      'Wire the server into Cursor for research-heavy drafting, citation checks, and legal context directly inside developer workflows.',
    steps: [
      'Open Cursor MCP settings or client configuration.',
      'Register the courtlistener server with the same node command, args, and cwd.',
      'Reload Cursor, then verify tool discovery succeeds before relying on the workflow.',
    ],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT / MCP client',
    eyebrow: 'Protocol-compatible clients',
    description:
      'Use the same MCP server definition in any compatible client that accepts command-based MCP server registrations.',
    steps: [
      'Create a new MCP server entry in your client settings.',
      'Use the node command, args, and cwd shown here with the server name courtlistener.',
      'Verify the client can enumerate tools before using the server in research flows.',
    ],
  },
  {
    id: 'local',
    label: 'Local development',
    eyebrow: 'Contributor setup',
    description:
      'Run the package directly during local development when you want to test the server or inspect MCP behavior end to end.',
    steps: [
      'Clone the repository and install dependencies with pnpm.',
      'Use node dist/index.js for quick validation or run local scripts for development workflows.',
      'Point your MCP-capable client at the local command while iterating on tools and auth posture.',
    ],
  },
] as const;

type SetupClientId = (typeof setupClients)[number]['id'];

export function LandingPage(props: { initialSectionId?: string }): React.JSX.Element {
  useDocumentTitle('Connect AI to the Law');
  const [navOpen, setNavOpen] = React.useState(false);
  const [activeSetup, setActiveSetup] = React.useState<SetupClientId>('claude');

  React.useEffect(() => {
    if (!props.initialSectionId) return;
    const target = document.getElementById(props.initialSectionId);
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [props.initialSectionId]);

  const activeClient = setupClients.find((client) => client.id === activeSetup) ?? setupClients[0];

  return (
    <div className="landing-page">
      <a href="#landing-main" className="landing-skip-link">
        Skip to content
      </a>
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link to="/" className="landing-brand" aria-label="CourtListener MCP home">
            <span className="landing-brand-mark" aria-hidden="true">
              <ScaleLogoIcon />
            </span>
            <span className="landing-brand-copy">
              <span className="landing-brand-name">CourtListener MCP</span>
              <span className="landing-brand-badge">Beta</span>
            </span>
          </Link>

          <button
            type="button"
            className="landing-menu-toggle"
            aria-expanded={navOpen}
            aria-controls="landing-primary-nav"
            onClick={() => setNavOpen((current) => !current)}
          >
            Menu
          </button>

          <nav
            id="landing-primary-nav"
            className={`landing-nav ${navOpen ? 'open' : ''}`.trim()}
            aria-label="Primary"
          >
            <a href={DOCUMENTATION_URL} target="_blank" rel="noreferrer">
              Documentation
            </a>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link to="/app/account">Account</Link>
            <Link to="/get-started" className="landing-button landing-button-primary">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main id="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-backdrop" aria-hidden="true">
            <div className="landing-grid-pattern"></div>
            <div className="landing-courthouse-silhouette"></div>
          </div>
          <div className="landing-container landing-hero-grid">
            <div className="landing-hero-copy">
              <span className="landing-pill">Model Context Protocol</span>
              <h1>
                Connect AI to the Law. <span>Responsibly.</span>
              </h1>
              <p className="landing-hero-text">
                CourtListener MCP gives AI systems secure, structured access to U.S. federal court
                data via the Model Context Protocol.
              </p>
              <div className="landing-button-row">
                <Link to="/get-started" className="landing-button landing-button-primary">
                  Get Started
                </Link>
                <a
                  href={REPOSITORY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="landing-button landing-button-secondary"
                >
                  View on GitHub
                </a>
              </div>
              <p className="landing-trust-copy">
                Read-only access · No API key required · Public data only
              </p>
            </div>

            <div className="landing-hero-visual">
              <CodePreviewCard />
              <div className="landing-hero-note">
                <ShieldCheckIcon />
                <div>
                  <strong>Structured and defensible</strong>
                  <span>
                    Built for developer workflows, AI clients, and responsible legal research
                    support.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section landing-section-light" id="features">
          <div className="landing-container">
            <div className="landing-section-heading">
              <span className="landing-section-label">Capabilities</span>
              <h2>Powerful legal data tools for AI applications</h2>
              <p>
                CourtListener MCP exposes vetted tools for legal research, enabling AI applications
                to retrieve structured data from federal courts.
              </p>
            </div>

            <div className="landing-feature-grid">
              {featureItems.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="landing-card landing-feature-card">
                    <span className="landing-icon-wrap" aria-hidden="true">
                      <Icon />
                    </span>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="landing-section" id="setup">
          <div className="landing-container">
            <div className="landing-section-heading">
              <span className="landing-section-label">Developer setup</span>
              <h2>Add CourtListener MCP to your AI client</h2>
              <p>
                Start from the source checkout workflow below, then register the built MCP server in
                the client you already use for research or developer workflows.
              </p>
            </div>

            <div className="landing-setup-layout">
              <div className="landing-setup-panel landing-card">
                <div
                  className="landing-setup-tabs"
                  role="tablist"
                  aria-label="Supported MCP clients"
                >
                  {setupClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      role="tab"
                      className={`landing-tab ${activeSetup === client.id ? 'active' : ''}`.trim()}
                      aria-selected={activeSetup === client.id}
                      onClick={() => setActiveSetup(client.id)}
                    >
                      {client.label}
                    </button>
                  ))}
                </div>

                <div className="landing-setup-copy">
                  <span className="landing-section-label">{activeClient.eyebrow}</span>
                  <h3>{activeClient.label}</h3>
                  <p>{activeClient.description}</p>
                  <ol className="landing-numbered-list">
                    {activeClient.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="landing-card landing-setup-code">
                <div className="landing-command-row">
                  <div>
                    <span className="landing-section-label">Install command</span>
                    <h3>{INSTALL_COMMAND}</h3>
                    <p className="landing-command-caption">
                      The npm package is not published yet, so local stdio setup currently runs from
                      a repository checkout.
                    </p>
                    <div className="landing-inline-links">
                      <a href={DOWNLOAD_ZIP_URL} target="_blank" rel="noreferrer">
                        Download ZIP
                      </a>
                      <a href={DOWNLOAD_TAR_URL} target="_blank" rel="noreferrer">
                        Download tar.gz
                      </a>
                    </div>
                  </div>
                  <span className="landing-command-chip">MCP server</span>
                </div>
                <CodeBlock />
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section landing-section-light" id="trust">
          <div className="landing-container">
            <div className="landing-section-heading">
              <span className="landing-section-label">Trust and safety</span>
              <h2>Designed for responsible legal AI workflows</h2>
              <p>
                This server is meant to support serious research workflows with guardrails that are
                clear to both developers and legal practitioners.
              </p>
            </div>

            <div className="landing-trust-grid">
              {trustItems.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="landing-card landing-trust-card">
                    <span className="landing-icon-wrap" aria-hidden="true">
                      <Icon />
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="landing-section landing-open-source" id="open-source">
          <div className="landing-container landing-open-source-grid">
            <div className="landing-section-heading landing-section-heading-compact">
              <span className="landing-section-label">Open source</span>
              <h2>Open-source infrastructure for legal AI</h2>
              <p>
                CourtListener MCP is an open-source project built to make legal data more accessible
                to AI systems through a standard protocol.
              </p>
              <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noreferrer"
                className="landing-button landing-button-primary"
              >
                View on GitHub
              </a>
              <a
                href={DOWNLOAD_ZIP_URL}
                target="_blank"
                rel="noreferrer"
                className="landing-button landing-button-secondary"
              >
                Download ZIP
              </a>
            </div>

            <div className="landing-open-source-stats">
              {openSourceStats.map((stat) => (
                <article key={stat.label} className="landing-card landing-stat-card">
                  <span className="landing-stat-label">{stat.label}</span>
                  <strong>{stat.value}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <span className="landing-footer-brand">CourtListener MCP</span>
          <div className="landing-footer-links">
            <a href={DOCUMENTATION_URL} target="_blank" rel="noreferrer">
              Documentation
            </a>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link to="/app/account">Account</Link>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              Privacy
            </a>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              Terms
            </a>
            <span>Built with MCP</span>
            <span>Open-source infrastructure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CodePreviewCard(): React.JSX.Element {
  return (
    <section className="landing-code-card" aria-label="Example MCP configuration">
      <div className="landing-code-tabs">
        <span className="active">MCP Config</span>
        <span>JSON</span>
      </div>
      <CodeBlock />
    </section>
  );
}

function CodeBlock(): React.JSX.Element {
  return (
    <pre className="landing-code-block">
      <code>
        <span className="landing-code-punctuation">{'{'}</span>
        {'\n'}
        {'  '}
        <span className="landing-code-key">"mcpServers"</span>
        <span className="landing-code-punctuation">: {'{'}</span>
        {'\n'}
        {'    '}
        <span className="landing-code-key">"courtlistener"</span>
        <span className="landing-code-punctuation">: {'{'}</span>
        {'\n'}
        {'      '}
        <span className="landing-code-key">"command"</span>
        <span className="landing-code-punctuation">:</span>{' '}
        <span className="landing-code-string">"node"</span>
        <span className="landing-code-punctuation">,</span>
        {'\n'}
        {'      '}
        <span className="landing-code-key">"args"</span>
        <span className="landing-code-punctuation">:</span>{' '}
        <span className="landing-code-array">["dist/index.js"]</span>
        <span className="landing-code-punctuation">,</span>
        {'\n'}
        {'      '}
        <span className="landing-code-key">"cwd"</span>
        <span className="landing-code-punctuation">:</span>{' '}
        <span className="landing-code-string">"/path/to/courtlistener-mcp"</span>
        {'\n'}
        {'    '}
        <span className="landing-code-punctuation">{'}'}</span>
        {'\n'}
        {'  '}
        <span className="landing-code-punctuation">{'}'}</span>
        {'\n'}
        <span className="landing-code-punctuation">{'}'}</span>
      </code>
    </pre>
  );
}

function IconBase(props: React.PropsWithChildren): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

function ScaleLogoIcon(): React.JSX.Element {
  return (
    <IconBase>
      <path d="M12 4v16" />
      <path d="M7 7h10" />
      <path d="M6 7l-3 5h6l-3-5Z" />
      <path d="M18 7l-3 5h6l-3-5Z" />
      <path d="M8 20h8" />
    </IconBase>
  );
}

function SearchIcon(): React.JSX.Element {
  return (
    <IconBase>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.2-4.2" />
    </IconBase>
  );
}

function CaseLookupIcon(): React.JSX.Element {
  return (
    <IconBase>
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M15 4v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </IconBase>
  );
}

function CourtIcon(): React.JSX.Element {
  return (
    <IconBase>
      <path d="M3 10h18" />
      <path d="M5 10v8" />
      <path d="M10 10v8" />
      <path d="M14 10v8" />
      <path d="M19 10v8" />
      <path d="M2 20h20" />
      <path d="m12 4 9 4H3z" />
    </IconBase>
  );
}

function BracketsIcon(): React.JSX.Element {
  return (
    <IconBase>
      <path d="M8 4H5v16h3" />
      <path d="M16 4h3v16h-3" />
      <path d="m10 8 4 4-4 4" />
    </IconBase>
  );
}

function ShieldCheckIcon(): React.JSX.Element {
  return (
    <IconBase>
      <path d="M12 3 5 6v6c0 5 3.5 8 7 9 3.5-1 7-4 7-9V6z" />
      <path d="m9.5 12.5 1.8 1.8 3.7-4" />
    </IconBase>
  );
}

function ReadOnlyIcon(): React.JSX.Element {
  return (
    <IconBase>
      <path d="M4 12a8 8 0 1 0 16 0" />
      <path d="M7 12h10" />
      <path d="M12 7v10" />
    </IconBase>
  );
}

function HumanReviewIcon(): React.JSX.Element {
  return (
    <IconBase>
      <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </IconBase>
  );
}
