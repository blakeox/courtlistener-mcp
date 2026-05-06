import React from 'react';
import {
  Badge,
  BrandLink,
  Button,
  ButtonLink,
  CodeSurface,
  Eyebrow,
  FeatureCard,
  InfoBlock,
  InlineGroup,
  SectionHeading,
  SkipLink,
  StatCard,
  StatusPill,
  TabButton,
  TextLink,
} from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';

const REPOSITORY_URL = 'https://github.com/blakeox/courtlistener-mcp';
const DOCUMENTATION_URL = `${REPOSITORY_URL}#readme`;
const DOWNLOAD_ZIP_URL = `${REPOSITORY_URL}/archive/refs/heads/main.zip`;
const DOWNLOAD_TAR_URL = `${REPOSITORY_URL}/archive/refs/heads/main.tar.gz`;
const INSTALL_COMMAND =
  'git clone https://github.com/blakeox/courtlistener-mcp.git && cd courtlistener-mcp && pnpm install && pnpm build';
const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "courtlistener": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/courtlistener-mcp"
    }
  }
}`;
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

function setupTabId(clientId: SetupClientId): string {
  return `landing-setup-tab-${clientId}`;
}

function setupPanelId(clientId: SetupClientId): string {
  return `landing-setup-panel-${clientId}`;
}

export function LandingPage(props: { initialSectionId?: string }): React.JSX.Element {
  useDocumentTitle('Connect AI to the Law');
  const [navOpen, setNavOpen] = React.useState(false);
  const [activeSetup, setActiveSetup] = React.useState<SetupClientId>('claude');
  const authStartHref = buildHostedAuthStartHref();

  React.useEffect(() => {
    if (!props.initialSectionId) return;
    const target = document.getElementById(props.initialSectionId);
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [props.initialSectionId]);

  return (
    <div className="landing-page">
      <SkipLink href="#landing-main" tone="landing">
        Skip to content
      </SkipLink>
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <BrandLink
            to="/"
            tone="landing"
            aria-label="CourtListener MCP home"
            label="CourtListener MCP"
            icon={<ScaleLogoIcon />}
            badge={<Badge className="brand-link-badge">Beta</Badge>}
          />

          <Button
            variant="secondary"
            size="compact"
            className="landing-menu-toggle"
            aria-expanded={navOpen}
            aria-controls="landing-primary-nav"
            onClick={() => setNavOpen((current) => !current)}
          >
            Menu
          </Button>

          <nav
            id="landing-primary-nav"
            className={`landing-nav ${navOpen ? 'open' : ''}`.trim()}
            aria-label="Primary"
          >
            <TextLink href={DOCUMENTATION_URL} target="_blank" rel="noreferrer" tone="landing">
              Documentation
            </TextLink>
            <TextLink href={REPOSITORY_URL} target="_blank" rel="noreferrer" tone="landing">
              GitHub
            </TextLink>
            <ButtonLink href={authStartHref} variant="primary" tone="landing">
              Sign in
            </ButtonLink>
            <TextLink to="/app/account" tone="landing">
              Account
            </TextLink>
            <ButtonLink to="/get-started" variant="primary" tone="landing">
              Get Started
            </ButtonLink>
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
              <Eyebrow className="landing-pill">Model Context Protocol</Eyebrow>
              <h1>
                Connect AI to the Law. <span>Responsibly.</span>
              </h1>
              <p className="landing-hero-text">
                CourtListener MCP gives AI systems secure, structured access to U.S. federal court
                data via the Model Context Protocol.
              </p>
              <InlineGroup gap="spacious" className="landing-button-row">
                <ButtonLink href={authStartHref} variant="primary" tone="landing">
                  Sign in
                </ButtonLink>
                <ButtonLink to="/get-started" variant="secondary" tone="landing">
                  Get Started
                </ButtonLink>
                <ButtonLink
                  href={REPOSITORY_URL}
                  target="_blank"
                  rel="noreferrer"
                  variant="secondary"
                  tone="landing"
                >
                  View on GitHub
                </ButtonLink>
              </InlineGroup>
              <p className="landing-trust-copy">
                Read-only access · No API key required · Public data only
              </p>
            </div>

            <div className="landing-hero-visual">
              <CodePreviewCard />
              <div className="landing-hero-note">
                <ShieldCheckIcon />
                <InfoBlock
                  title="Structured and defensible"
                  titleAs="strong"
                  description="Built for developer workflows, AI clients, and responsible legal research support."
                  descriptionClassName="landing-hero-note-description"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section landing-section-light" id="features">
          <div className="landing-container">
            <SectionHeading
              className="landing-section-heading"
              eyebrow="Capabilities"
              eyebrowClassName="landing-section-label"
              title="Powerful legal data tools for AI applications"
              description="CourtListener MCP exposes vetted tools for legal research, enabling AI applications to retrieve structured data from federal courts."
            />

            <div className="landing-feature-grid">
              {featureItems.map((feature) => {
                const Icon = feature.icon;
                return (
                  <FeatureCard
                    key={feature.title}
                    className="landing-card landing-feature-card"
                    icon={<Icon />}
                    iconClassName="landing-icon-wrap"
                    title={feature.title}
                    description={feature.description}
                  />
                );
              })}
            </div>
          </div>
        </section>

        <section className="landing-section" id="setup">
          <div className="landing-container">
            <SectionHeading
              className="landing-section-heading"
              eyebrow="Developer setup"
              eyebrowClassName="landing-section-label"
              title="Add CourtListener MCP to your AI client"
              description="Start from the source checkout workflow below, then register the built MCP server in the client you already use for research or developer workflows."
            />

            <div className="landing-setup-layout">
              <div className="landing-setup-panel landing-card">
                <div
                  className="landing-setup-tabs"
                  role="tablist"
                  aria-label="Supported MCP clients"
                >
                  {setupClients.map((client) => (
                    <TabButton
                      key={client.id}
                      id={setupTabId(client.id)}
                      className="landing-tab"
                      controls={setupPanelId(client.id)}
                      selected={activeSetup === client.id}
                      onClick={() => setActiveSetup(client.id)}
                    >
                      {client.label}
                    </TabButton>
                  ))}
                </div>

                {setupClients.map((client) => (
                  <div
                    key={client.id}
                    id={setupPanelId(client.id)}
                    role="tabpanel"
                    aria-labelledby={setupTabId(client.id)}
                    hidden={activeSetup !== client.id}
                    className="landing-setup-copy"
                  >
                    <InfoBlock
                      eyebrow={client.eyebrow}
                      eyebrowClassName="landing-section-label"
                      title={client.label}
                      titleAs="h3"
                      description={client.description}
                    />
                    <ol className="landing-numbered-list">
                      {client.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>

              <div className="landing-card landing-setup-code">
                <InlineGroup justify="between" gap="spacious" className="landing-command-row">
                  <div>
                    <InfoBlock
                      eyebrow="Install command"
                      eyebrowClassName="landing-section-label"
                      title={INSTALL_COMMAND}
                      titleAs="h3"
                      description="The npm package is not published yet, so local stdio setup currently runs from a repository checkout."
                      descriptionClassName="landing-command-caption"
                    />
                    <InlineGroup gap="spacious" className="landing-inline-links">
                      <TextLink
                        href={DOWNLOAD_ZIP_URL}
                        target="_blank"
                        rel="noreferrer"
                        tone="landing"
                      >
                        Download ZIP
                      </TextLink>
                      <TextLink
                        href={DOWNLOAD_TAR_URL}
                        target="_blank"
                        rel="noreferrer"
                        tone="landing"
                      >
                        Download tar.gz
                      </TextLink>
                    </InlineGroup>
                  </div>
                  <Badge className="landing-command-chip">MCP server</Badge>
                </InlineGroup>
                <CodeSurface code={MCP_CONFIG_SNIPPET}>{renderLandingConfigSnippet()}</CodeSurface>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section landing-section-light" id="trust">
          <div className="landing-container">
            <SectionHeading
              className="landing-section-heading"
              eyebrow="Trust and safety"
              eyebrowClassName="landing-section-label"
              title="Designed for responsible legal AI workflows"
              description="This server is meant to support serious research workflows with guardrails that are clear to both developers and legal practitioners."
            />

            <div className="landing-trust-grid">
              {trustItems.map((item) => {
                const Icon = item.icon;
                return (
                  <FeatureCard
                    key={item.title}
                    className="landing-card landing-trust-card"
                    icon={<Icon />}
                    iconClassName="landing-icon-wrap"
                    title={item.title}
                    description={item.description}
                  />
                );
              })}
            </div>
          </div>
        </section>

        <section className="landing-section landing-open-source" id="open-source">
          <div className="landing-container landing-open-source-grid">
            <SectionHeading
              className="landing-section-heading landing-section-heading-compact"
              eyebrow="Open source"
              eyebrowClassName="landing-section-label"
              title="Open-source infrastructure for legal AI"
              description="CourtListener MCP is an open-source project built to make legal data more accessible to AI systems through a standard protocol."
            >
              <ButtonLink
                href={REPOSITORY_URL}
                target="_blank"
                rel="noreferrer"
                variant="primary"
                tone="landing"
              >
                View on GitHub
              </ButtonLink>
              <ButtonLink
                href={DOWNLOAD_ZIP_URL}
                target="_blank"
                rel="noreferrer"
                variant="secondary"
                tone="landing"
              >
                Download ZIP
              </ButtonLink>
            </SectionHeading>

            <div className="landing-open-source-stats">
              {openSourceStats.map((stat) => (
                <StatCard
                  key={stat.label}
                  className="landing-card landing-stat-card"
                  label={stat.label}
                  labelClassName="landing-stat-label"
                  value={stat.value}
                />
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <InlineGroup
          justify="between"
          gap="spacious"
          className="landing-container landing-footer-inner"
        >
          <span className="landing-footer-brand">CourtListener MCP</span>
          <InlineGroup gap="spacious" className="landing-footer-links">
            <TextLink href={DOCUMENTATION_URL} target="_blank" rel="noreferrer" tone="landing">
              Documentation
            </TextLink>
            <TextLink href={REPOSITORY_URL} target="_blank" rel="noreferrer" tone="landing">
              GitHub
            </TextLink>
            <TextLink href={authStartHref} tone="landing">
              Sign in
            </TextLink>
            <TextLink to="/app/account" tone="landing">
              Account
            </TextLink>
            <TextLink href={REPOSITORY_URL} target="_blank" rel="noreferrer" tone="landing">
              Privacy
            </TextLink>
            <TextLink href={REPOSITORY_URL} target="_blank" rel="noreferrer" tone="landing">
              Terms
            </TextLink>
            <span>Built with MCP</span>
            <span>Open-source infrastructure</span>
          </InlineGroup>
        </InlineGroup>
      </footer>
    </div>
  );
}

function CodePreviewCard(): React.JSX.Element {
  return (
    <CodeSurface
      className="landing-code-card"
      code={MCP_CONFIG_SNIPPET}
      title={
        <div className="landing-code-tabs" aria-hidden="true">
          <StatusPill tone="mcp" variant="solid">
            MCP Config
          </StatusPill>
          <Badge className="landing-code-format-badge">JSON</Badge>
        </div>
      }
    >
      {renderLandingConfigSnippet()}
    </CodeSurface>
  );
}

function renderLandingConfigSnippet(): React.JSX.Element {
  return (
    <>
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
    </>
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
