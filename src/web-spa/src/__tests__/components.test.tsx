import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast';
import { brandLinkBadgeClass, landingStatLabelClass } from '../lib/landing-classes';
import { infoBlockClass, monoClass, tokenKeyClass } from '../lib/ui-classes';
import {
  Badge,
  BadgeLink,
  BrandLink,
  Card,
  Button,
  ButtonLink,
  CodeSurface,
  Checkbox,
  CheckboxField,
  ComparisonCard,
  ConnectionBadge,
  DefinitionList,
  EmptyState,
  Eyebrow,
  FeatureCard,
  InfoBlock,
  IconButton,
  InlineGroup,
  KeyValueList,
  LoadingState,
  NavCardLink,
  Panel,
  PageHeader,
  HeroPanel,
  PageHeroNote,
  SectionHeading,
  PillLink,
  SkipLink,
  StatCard,
  StatusPill,
  StatusBanner,
  FormField,
  Input,
  MetricCard,
  MetaNote,
  Select,
  Stepper,
  TabButton,
  Textarea,
  TextLink,
  formatDate,
} from '../components/ui';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders title and subtitle', () => {
    render(
      <Card title="My Title" subtitle="Sub">
        Content
      </Card>,
    );
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('Sub')).toBeInTheDocument();
  });

  it('renders as section with ui-card class', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.querySelector('section.ui-card')).toBeInTheDocument();
  });

  it('supports shared tone variants', () => {
    const { container } = render(<Card tone="spotlight">Highlight</Card>);
    expect(container.querySelector('section.ui-card.card-spotlight')).toBeInTheDocument();
  });

  it('omits title and subtitle when not provided', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector('.muted')).toBeNull();
  });
});

describe('Panel', () => {
  it('renders shared inset panel styling with tone variants', () => {
    const { rerender } = render(<Panel>Info</Panel>);
    expect(screen.getByText('Info')).toHaveClass('panel-card');
    rerender(<Panel tone="inverse">Dark</Panel>);
    expect(screen.getByText('Dark')).toHaveClass('panel-card', 'inverse');
  });
});

describe('SectionHeading', () => {
  it('renders the shared eyebrow/title/description shell with optional trailing content', () => {
    render(
      <SectionHeading
        tone="landing"
        eyebrow="Capabilities"
        eyebrowClassName="landing-section-label"
        title="Powerful legal data tools"
        description="Structured legal research for AI workflows."
      >
        <ButtonLink href="https://example.com">Learn more</ButtonLink>
      </SectionHeading>,
    );
    expect(screen.getByText('Capabilities')).toHaveClass('landing-section-label');
    expect(
      screen.getByText('Capabilities').closest('.landing-section-heading'),
    ).toBeInTheDocument();
    expect(screen.getByText('Powerful legal data tools')).toBeInTheDocument();
    expect(screen.getByText('Structured legal research for AI workflows.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn more' })).toBeInTheDocument();
  });
});

describe('BrandLink', () => {
  it('renders the shared shell brand treatment with subtitle text', () => {
    render(
      <MemoryRouter>
        <BrandLink to="/app" label="CourtListener MCP" subtitle="Legal-agent console" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /courtlistener mcp/i })).toHaveClass(
      'brand-link',
      'brand-link-default',
    );
    expect(screen.getByText('Legal-agent console')).toHaveClass('brand-link-subtitle');
  });

  it('renders the shared landing brand treatment with icon and badge content', () => {
    render(
      <MemoryRouter>
        <BrandLink
          to="/"
          tone="landing"
          label="CourtListener MCP"
          icon="⚖️"
          badge={<Badge className={brandLinkBadgeClass}>Beta</Badge>}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /courtlistener mcp/i })).toHaveClass(
      'brand-link',
      'brand-link-landing',
    );
    expect(screen.getByText('⚖️')).toHaveClass('brand-link-mark');
    expect(screen.getByText('Beta')).toHaveClass('brand-link-badge');
  });
});

describe('InfoBlock', () => {
  it('renders the shared eyebrow/title/description stack with configurable title tags', () => {
    render(
      <InfoBlock
        eyebrow="Current page"
        title="Agent Workspace"
        titleAs="h3"
        description="Workspace state for operators."
        className={infoBlockClass}
        titleClassName="workspace-topbar-title"
      />,
    );
    expect(screen.getByText('Current page')).toHaveClass('workspace-card-label');
    expect(screen.getByRole('heading', { level: 3, name: 'Agent Workspace' })).toHaveClass(
      'workspace-topbar-title',
    );
    expect(screen.getByText('Workspace state for operators.')).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('renders the shared app page header with actions and meta', () => {
    render(
      <MemoryRouter>
        <PageHeader
          eyebrow="Workspace signals"
          title="Operational surface"
          description="Recent work and runtime posture."
          meta="Session active"
          actions={<ButtonLink to="/app/tools">Open tools</ButtonLink>}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Workspace signals')).toHaveClass('workspace-card-label');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Operational surface' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Recent work and runtime posture.')).toHaveClass(
      'page-header-description',
    );
    expect(screen.getByText('Session active')).toHaveClass('page-header-meta');
    expect(screen.getByRole('link', { name: 'Open tools' })).toBeInTheDocument();
  });
});

describe('workspace-classes', () => {
  it('preserves hook class names on layout recipes', async () => {
    const { stackClass, twoColClass, tableClass } = await import('../lib/workspace-classes');
    expect(stackClass).toContain('stack');
    expect(twoColClass).toContain('two-col');
    expect(tableClass).toContain('table');
  });
});

describe('shell-classes', () => {
  it('preserves hook class names on shell layout recipes', async () => {
    const { workspaceShellClass, workspaceTopbarClass } = await import('../lib/shell-classes');
    expect(workspaceShellClass).toContain('workspace-shell');
    expect(workspaceTopbarClass).toContain('workspace-topbar');
  });
});

describe('toast-classes', () => {
  it('preserves hook class names on toast recipes', async () => {
    const { toastContainerClass, toastClassName } = await import('../lib/toast-classes');
    expect(toastContainerClass).toContain('toast-container');
    expect(toastClassName('error')).toContain('toast-error');
  });
});

describe('playground-classes', () => {
  it('preserves hook class names on protocol and transcript recipes', async () => {
    const { protocolEntryClassName, transcriptEntryClassName } =
      await import('../lib/playground-classes');
    expect(protocolEntryClassName('request')).toContain('protocol-entry');
    expect(transcriptEntryClassName('error')).toContain('transcript-entry');
    expect(transcriptEntryClassName('error')).toContain('error');
  });
});

describe('landing tab recipes', () => {
  it('preserves hook class names on landing setup tabs', async () => {
    const { landingTabButtonClassName } = await import('../lib/landing-classes');
    expect(landingTabButtonClassName(true)).toContain('landing-tab');
    expect(landingTabButtonClassName(true)).toContain('active');
  });
});

describe('shell toolbar recipes', () => {
  it('preserves hook class names on toolbar and account menu recipes', async () => {
    const {
      toolbarButtonClass,
      toolbarUtilityButtonClass,
      accountMenuTriggerClassName,
      accountMenuPanelClassName,
      navCardLinkMetaClass,
    } = await import('../lib/shell-classes');
    expect(toolbarButtonClass).toContain('toolbar-button');
    expect(toolbarUtilityButtonClass).toContain('toolbar-utility-button');
    expect(accountMenuTriggerClassName({ open: true, warning: true })).toContain('warning');
    expect(accountMenuPanelClassName(true)).toContain('account-menu-panel');
    expect(navCardLinkMetaClass).toContain('nav-card-link-meta');
  });
});

describe('PageHeroNote', () => {
  it('renders title, description, and children with hook classes', () => {
    render(
      <PageHeroNote title="Runtime posture" description="Worker is ready for MCP calls.">
        <p>Extra detail</p>
      </PageHeroNote>,
    );
    expect(screen.getByText('Runtime posture')).toHaveClass('page-hero-note-title');
    expect(screen.getByText('Worker is ready for MCP calls.')).toHaveClass('page-hero-note-text');
    expect(screen.getByText('Extra detail')).toBeInTheDocument();
    expect(screen.getByText('Runtime posture').closest('.page-hero-note')).toBeInTheDocument();
  });
});

describe('HeroPanel', () => {
  it('renders the shared emphasized hero panel with an aside surface', () => {
    render(
      <HeroPanel
        eyebrow="Operator session"
        title="Session"
        description="Session, credential, and runtime posture."
        aside={
          <PageHeroNote title="Current status">
            <KeyValueList entries={[{ label: 'Runtime', value: 'Ready' }]} />
          </PageHeroNote>
        }
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Session' })).toBeInTheDocument();
    expect(screen.getByText('Session, credential, and runtime posture.')).toHaveClass(
      'page-hero-description',
    );
    expect(screen.getByText('Current status')).toHaveClass('page-hero-note-title');
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});

describe('FeatureCard', () => {
  it('renders the shared icon/title/description card shell', () => {
    render(
      <FeatureCard
        tone="landing"
        icon="⚖️"
        title="Search Opinions"
        description="Find federal court opinions by query and citation."
      />,
    );
    expect(screen.getByText('Search Opinions')).toBeInTheDocument();
    expect(
      screen.getByText('Find federal court opinions by query and citation.'),
    ).toBeInTheDocument();
    expect(screen.getByText('⚖️')).toHaveClass('landing-icon-wrap');
    expect(screen.getByRole('article')).toHaveClass('landing-feature-card');
  });
});

describe('StatCard', () => {
  it('renders the shared label/value card shell', () => {
    render(
      <StatCard
        tone="landing"
        label="License"
        labelClassName={landingStatLabelClass}
        value="MIT"
      />,
    );
    expect(screen.getByText('License')).toHaveClass('landing-stat-label');
    expect(screen.getByText('MIT')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveClass('landing-stat-card');
  });
});

describe('SkipLink', () => {
  it('renders shared skip-link tones', () => {
    const { rerender } = render(<SkipLink href="#main">Skip</SkipLink>);
    expect(screen.getByText('Skip')).toHaveClass('skip-link');
    rerender(
      <SkipLink href="#main" tone="landing">
        Skip
      </SkipLink>,
    );
    expect(screen.getByText('Skip')).toHaveClass('skip-link', 'skip-link-landing');
  });
});

describe('InlineGroup', () => {
  it('renders shared row variants', () => {
    const { rerender } = render(<InlineGroup>Items</InlineGroup>);
    expect(screen.getByText('Items')).toHaveClass('row');
    rerender(
      <InlineGroup justify="between" gap="spacious">
        Items
      </InlineGroup>,
    );
    expect(screen.getByText('Items')).toHaveClass('row', 'between', 'row-spacious');
  });
});

describe('DefinitionList', () => {
  it('renders shared term/value rows with optional detail classes', () => {
    render(
      <DefinitionList
        entries={[
          { term: 'User ID', description: 'abc123', descriptionClassName: monoClass },
          { term: 'Status', description: 'Ready' },
        ]}
      />,
    );
    expect(screen.getByText('User ID')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toHaveClass('mono');
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});

describe('MetricCard', () => {
  it('renders the shared metric tile structure', () => {
    render(
      <MetricCard label="Latency" value="812ms" accent="24h average">
        <p>Used by compare view</p>
      </MetricCard>,
    );
    expect(screen.getByText('Latency')).toHaveClass('workspace-card-label');
    expect(screen.getByText('812ms')).toBeInTheDocument();
    expect(screen.getByText('24h average')).toHaveClass('metric-card-accent');
    expect(screen.getByText('Used by compare view')).toBeInTheDocument();
  });

  it('renders supporting content below the accent line', () => {
    render(
      <MetricCard label="Sessions" value="12 active" accent="4 awaiting review">
        <p>Needs operator action</p>
      </MetricCard>,
    );
    expect(screen.getByText('4 awaiting review')).toHaveClass('metric-card-accent');
    expect(screen.getByText('Needs operator action')).toBeInTheDocument();
  });
});

describe('ComparisonCard', () => {
  it('renders shared comparison shell with optional badge and meta', () => {
    render(
      <ComparisonCard
        icon="🔌"
        title="With MCP"
        tone="mcp"
        size="large"
        badge={<Badge>MCP</Badge>}
        meta={<MetaNote>Tool selected</MetaNote>}
      >
        Result body
      </ComparisonCard>,
    );
    expect(screen.getByText('With MCP')).toHaveClass(
      'comparison-card-title',
      'comparison-card-title-lg',
    );
    expect(screen.getByText('🔌')).toHaveClass('comparison-icon', 'comparison-icon-lg');
    expect(screen.getByText('Tool selected')).toBeInTheDocument();
    expect(screen.getByText('Result body')).toBeInTheDocument();
  });
});

describe('Eyebrow', () => {
  it('renders the shared workspace label style', () => {
    render(<Eyebrow>Status</Eyebrow>);
    expect(screen.getByText('Status')).toHaveClass('workspace-card-label');
  });
});

describe('Button', () => {
  it('renders with primary variant by default', () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole('button', { name: 'Click' });
    expect(btn.className).toContain('primary');
  });

  it('renders with secondary variant', () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole('button', { name: 'Cancel' });
    expect(btn.className).toContain('secondary');
  });

  it('renders with danger variant', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('danger');
  });

  it('passes through disabled prop', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('supports compact size via component props', () => {
    render(<Button size="compact">Compact</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn-compact');
  });
});

describe('IconButton', () => {
  it('supports inline chrome for lightweight icon actions', () => {
    render(<IconButton chrome="inline">X</IconButton>);
    expect(screen.getByRole('button')).toHaveClass('icon-btn', 'inline');
  });
});

describe('MetaNote', () => {
  it('renders the shared inline metadata treatment', () => {
    render(<MetaNote size="large">Tool metadata</MetaNote>);
    expect(screen.getByText('Tool metadata')).toHaveClass('meta-note', 'meta-note-lg');
  });
});

describe('Select', () => {
  it('renders a shared select control', () => {
    render(
      <Select defaultValue="b">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </Select>,
    );
    expect(screen.getByRole('combobox')).toHaveValue('b');
    expect(screen.getByRole('combobox')).toHaveClass('select-control');
  });
});

describe('Checkbox', () => {
  it('renders a shared checkbox control', () => {
    render(<Checkbox aria-label="Enable feature" defaultChecked />);
    expect(screen.getByRole('checkbox', { name: 'Enable feature' })).toBeChecked();
  });
});

describe('CheckboxField', () => {
  it('renders the shared checkbox row wrapper', () => {
    render(<CheckboxField defaultChecked>Run as async job</CheckboxField>);
    expect(screen.getByRole('checkbox', { name: 'Run as async job' })).toBeChecked();
    expect(screen.getByText('Run as async job').closest('label')).toHaveClass('checkbox-field');
  });
});

describe('Textarea', () => {
  it('renders a shared textarea control', () => {
    render(<Textarea defaultValue="notes" aria-label="Notes" />);
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('notes');
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveClass('textarea-control');
  });
});

describe('ButtonLink', () => {
  it('renders an internal router link with button classes', () => {
    render(
      <MemoryRouter>
        <ButtonLink to="/app/tools" variant="secondary">
          Open tools
        </ButtonLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Open tools' });
    expect(link).toHaveAttribute('href', '/app/tools');
    expect(link.className).toContain('secondary');
  });

  it('renders an anchor link when href is provided', () => {
    render(<ButtonLink href="https://example.com">Docs</ButtonLink>);
    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link.className).toContain('primary');
  });

  it('supports landing tone without the default button classes', () => {
    render(
      <MemoryRouter>
        <ButtonLink to="/get-started" variant="secondary" tone="landing">
          Get Started
        </ButtonLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Get Started' });
    expect(link).toHaveClass('landing-button', 'landing-button-secondary');
    expect(link.className).not.toContain('btn');
  });
});

describe('TextLink', () => {
  it('renders an internal router link with shared text-link styling', () => {
    render(
      <MemoryRouter>
        <TextLink to="/app/readiness">Readiness</TextLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Readiness' });
    expect(link).toHaveAttribute('href', '/app/readiness');
    expect(link).toHaveClass('text-link');
  });

  it('supports landing tone for public-site links', () => {
    render(
      <MemoryRouter>
        <TextLink to="/app/account" tone="landing">
          Account
        </TextLink>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Account' })).toHaveClass('landing-text-link');
  });
});

describe('NavCardLink', () => {
  it('renders active shared workspace nav links', () => {
    render(
      <MemoryRouter initialEntries={['/app/readiness']}>
        <NavCardLink to="/app/readiness">Readiness</NavCardLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Readiness' });
    expect(link).toHaveAttribute('href', '/app/readiness');
    expect(link).toHaveClass('nav-card-link', 'active');
  });
});

describe('PillLink', () => {
  it('renders an internal pill link', () => {
    render(
      <MemoryRouter>
        <PillLink to="/app/session" primary>
          Session
        </PillLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Session' });
    expect(link).toHaveAttribute('href', '/app/session');
    expect(link.className).toContain('pill');
    expect(link.className).toContain('primary');
  });
});

describe('BadgeLink', () => {
  it('renders an internal badge link with tone classes', () => {
    render(
      <MemoryRouter>
        <BadgeLink to="/app/credentials" tone="ok">
          Credential loaded
        </BadgeLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Credential loaded' });
    expect(link).toHaveAttribute('href', '/app/credentials');
    expect(link.className).toContain('chip');
    expect(link.className).toContain('active');
  });
});

describe('StatusBanner', () => {
  it('returns null when message is empty', () => {
    const { container } = render(<StatusBanner message="" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders message with default info type', () => {
    render(<StatusBanner message="Loading..." />);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Loading...');
    expect(el.className).toContain('info');
  });

  it('renders with error type', () => {
    render(<StatusBanner message="Error!" type="error" />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('error');
  });

  it('renders with warn type', () => {
    render(<StatusBanner message="Warning!" type="warn" />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('warn');
  });

  it('renders with alert role', () => {
    render(<StatusBanner message="Alert!" role="alert" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Alert!');
  });

  it('renders title and actions when provided', () => {
    render(
      <StatusBanner title="Heads up:" message="Something needs review.">
        <button type="button">Review</button>
      </StatusBanner>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Heads up: Something needs review.');
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('renders with neutral tone by default', () => {
    render(<Badge>Neutral</Badge>);
    expect(screen.getByText('Neutral').className).toContain('chip');
  });

  it('renders warn tone class', () => {
    render(<Badge tone="warn">Warn</Badge>);
    expect(screen.getByText('Warn').className).toContain('warn');
  });
});

describe('FormField', () => {
  it('renders label and children', () => {
    render(
      <FormField id="test" label="Name">
        <input id="test" />
      </FormField>,
    );
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('renders hint text', () => {
    render(
      <FormField id="test" label="Name" hint="Enter your name">
        <input id="test" />
      </FormField>,
    );
    expect(screen.getByText('Enter your name')).toBeInTheDocument();
  });

  it('renders error text with alert role', () => {
    render(
      <FormField id="test" label="Name" error="Required">
        <input id="test" />
      </FormField>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('supports compact field styling', () => {
    const { container } = render(
      <FormField id="test" label="Mode" compact>
        <input id="test" />
      </FormField>,
    );
    expect(container.firstChild).toHaveClass('field', 'compact');
  });
});

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input type="text" placeholder="Enter" />);
    expect(screen.getByPlaceholderText('Enter')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter')).toHaveClass('input-control');
  });
});

describe('LoadingState', () => {
  it('renders a busy status with optional message', () => {
    render(<LoadingState label="Loading page" message="Fetching data" />);
    expect(screen.getByRole('status', { name: 'Loading page' })).toHaveTextContent('Fetching data');
  });
});

describe('CodeSurface', () => {
  it('renders shared raw code blocks with optional copy action', () => {
    render(
      <ToastProvider>
        <CodeSurface title="Snippet" code="pnpm test" copyable />
      </ToastProvider>,
    );
    expect(screen.getByText('Snippet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByText('pnpm test')).toBeInTheDocument();
  });

  it('supports rich title and syntax-highlighted code children', () => {
    render(
      <ToastProvider>
        <CodeSurface
          title={
            <span>
              <span>Config</span>
              <Badge>JSON</Badge>
            </span>
          }
          code='{"ok":true}'
        >
          <span className={tokenKeyClass}>"ok"</span>
        </CodeSurface>
      </ToastProvider>,
    );
    expect(screen.getByText('Config')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('"ok"')).toHaveClass('token-key');
  });
});

describe('EmptyState', () => {
  it('renders message, icon, and hint when provided', () => {
    render(<EmptyState icon="💬" message="Nothing here yet" hint="Try again later" />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('💬')).toBeInTheDocument();
    expect(screen.getByText('Try again later')).toBeInTheDocument();
  });
});

describe('ConnectionBadge', () => {
  it('renders connected state with metadata', () => {
    render(
      <ConnectionBadge
        connected={true}
        connectedLabel="Session: abc123"
        disconnectedLabel="No session"
        meta="| 20 tools"
      />,
    );
    expect(screen.getByText('Session: abc123')).toBeInTheDocument();
    expect(screen.getByText('| 20 tools')).toBeInTheDocument();
  });
});

describe('StatusPill', () => {
  it('renders solid and soft tone variants', () => {
    const { rerender } = render(
      <StatusPill tone="mcp" variant="solid">
        LIVE DATA
      </StatusPill>,
    );
    expect(screen.getByText('LIVE DATA')).toHaveClass('status-pill', 'solid', 'tone-mcp');

    rerender(<StatusPill tone="ok">Succeeded</StatusPill>);
    expect(screen.getByText('Succeeded')).toHaveClass('status-pill', 'soft', 'tone-ok');
  });
});

describe('Stepper', () => {
  it('renders steps with correct states', () => {
    const steps = [
      { label: 'Step 1', complete: true, to: '/step1' },
      { label: 'Step 2', complete: false, active: true, to: '/step2' },
      { label: 'Step 3', complete: false, disabled: true },
    ];
    render(
      <MemoryRouter>
        <Stepper steps={steps} />
      </MemoryRouter>,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].className).toContain('done');
    expect(items[1].className).toContain('active');
    expect(items[2].className).toContain('disabled');
  });

  it('renders links for non-disabled steps', () => {
    const steps = [{ label: 'Step 1', complete: false, to: '/step1' }];
    render(
      <MemoryRouter>
        <Stepper steps={steps} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Step 1/ })).toBeInTheDocument();
  });

  it('renders trailing actions when provided', () => {
    const steps = [{ label: 'Step 1', complete: true, action: <Badge tone="ok">Done</Badge> }];
    render(
      <MemoryRouter>
        <Stepper steps={steps} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});

describe('TabButton', () => {
  it('renders a tab trigger with selected state', () => {
    render(
      <TabButton controls="panel-a" selected={true}>
        Tab A
      </TabButton>,
    );
    const tab = screen.getByRole('tab', { name: 'Tab A' });
    expect(tab).toHaveAttribute('aria-controls', 'panel-a');
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab).toHaveClass('active');
  });
});

describe('formatDate', () => {
  it('formats ISO date string', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('returns original string on invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});
