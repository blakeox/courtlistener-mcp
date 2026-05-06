import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToken } from '../lib/token-context';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';
import {
  BadgeLink,
  Badge,
  BrandLink,
  Button,
  ButtonLink,
  InfoBlock,
  InlineGroup,
  LoadingState,
  NavCardLink,
  Panel,
  PillButton,
  PillLink,
  SkipLink,
  StatusBanner,
  TextLink,
} from './ui';
import { useColorScheme } from '../hooks/useColorScheme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useSessionHeartbeat } from '../hooks/useSessionHeartbeat';
import { useToast } from './Toast';
import { WORKSPACE_DOCS_URL, WORKSPACE_NAV_GROUPS, getWorkspaceMeta } from '../lib/workspace-shell';

export function Shell(
  props: React.PropsWithChildren<{
    steps?: Array<{
      label: string;
      complete: boolean;
      active?: boolean;
      to?: string;
      disabled?: boolean;
    }>;
  }>,
): React.JSX.Element {
  const { session, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, clear } = useToken();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const { scheme, toggle: toggleTheme } = useColorScheme();
  const { online } = useNetworkStatus();
  const mainRef = React.useRef<HTMLElement | null>(null);

  const authed = Boolean(session?.authenticated);
  const hasLocalToken = Boolean(token.trim());
  const { toast } = useToast();
  const authStartHref = buildHostedAuthStartHref();
  const currentWorkspace = getWorkspaceMeta(location.pathname);

  useSessionHeartbeat(5 * 60 * 1000, {
    enabled: authed,
    onExpired: () => {
      clear();
      toast('Session expired — review account status.', 'error');
      navigate('/app/account');
    },
  });

  React.useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell app-shell-landing">
      <SkipLink href="#main-content">Skip to content</SkipLink>
      {!online && <StatusBanner message="You're offline — changes may not save." type="warn" />}
      {!loading && !authed && hasLocalToken ? (
        <StatusBanner
          title="Session recovery:"
          message="A local MCP credential is stored, but this browser session is signed out."
        >
          <InlineGroup>
            <ButtonLink to="/app/account" variant="secondary">
              Review session status
            </ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                clear();
                toast('Stored local credential cleared', 'info');
              }}
            >
              Clear local credential
            </Button>
          </InlineGroup>
        </StatusBanner>
      ) : null}

      <div className="main-layout app-main-layout-landing">
        <Button
          variant="secondary"
          size="compact"
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={sidebarOpen}
          aria-controls="primary-navigation"
        >
          ☰ Menu
        </Button>
        <aside
          id="primary-navigation"
          className={`sidebar app-sidebar-landing ${sidebarOpen ? 'open' : ''}`.trim()}
        >
          <div className="app-sidebar-brand-block">
            <BrandLink
              to="/app"
              label="CourtListener MCP"
              subtitle="Operator workspace"
              tone="landing"
            />
            <Badge className="app-sidebar-beta-badge">Workspace</Badge>
          </div>
          <p className="sidebar-intro app-sidebar-intro">
            Operate the hosted MCP surface with the same design language as the public portal, while
            keeping runtime controls visible.
          </p>
          <div className="menu">
            {WORKSPACE_NAV_GROUPS.map((group) => (
              <div key={group.label} className="menu-group">
                <p className="menu-group-label">{group.label}</p>
                {group.items.map((item) => {
                  if (item.external) {
                    return (
                      <NavCardLink
                        key={item.to}
                        href={item.to}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.label}
                      </NavCardLink>
                    );
                  }
                  return (
                    <NavCardLink key={item.to} to={item.to}>
                      {item.label}
                    </NavCardLink>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="sidebar-meta">
            <Panel tone="inverse" className="app-sidebar-panel">
              <InfoBlock
                eyebrow="Current Workspace"
                title={currentWorkspace.label}
                titleAs="strong"
                description={currentWorkspace.description}
              />
            </Panel>
            <Panel tone="inverse" className="app-sidebar-panel">
              <InfoBlock
                eyebrow="User Profile"
                title={authed ? 'Research operator' : 'Guest operator'}
                titleAs="strong"
                description={session?.user?.id ?? 'Sign in to persist session context.'}
              />
            </Panel>
          </div>
        </aside>
        <div className="shell-main-column">
          <header className="topbar app-topbar-landing">
            <InfoBlock
              eyebrow="Workspace"
              title={currentWorkspace.label}
              titleAs="strong"
              className="topbar-heading"
              titleClassName="workspace-topbar-title"
            />
            <nav aria-label="Global navigation">
              <InlineGroup className="top-actions">
                <PillLink to="/app/session" primary={authed}>
                  Session: {loading ? 'Checking' : authed ? 'Active' : 'Sign in'}
                </PillLink>
                <BadgeLink to="/app/credentials" tone={hasLocalToken ? 'ok' : 'neutral'}>
                  Browser credential: {hasLocalToken ? 'Loaded' : 'Not Loaded'}
                </BadgeLink>
                <PillLink href={WORKSPACE_DOCS_URL} target="_blank" rel="noopener noreferrer">
                  Docs
                </PillLink>
                <Button
                  variant="secondary"
                  size="compact"
                  className="theme-toggle"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${scheme === 'light' ? 'dark' : 'light'} mode`}
                >
                  Theme: {scheme === 'light' ? 'Dark' : 'Light'}
                </Button>
                {!loading && authed ? (
                  <PillButton
                    id="logoutBtn"
                    onClick={async () => {
                      try {
                        await logout();
                        clear();
                        navigate('/app');
                      } catch {
                        toast('Logout failed — session is still active.', 'error');
                      }
                    }}
                  >
                    Log out
                  </PillButton>
                ) : (
                  <PillLink href={authStartHref} primary>
                    Sign in
                  </PillLink>
                )}
              </InlineGroup>
            </nav>
          </header>
          <main
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            className="content app-content-landing"
          >
            {props.children}
          </main>
        </div>
      </div>

      <footer className="app-footer-landing">
        Legal-agent workspace for CourtListener MCP. Public sign-in flows through the separate auth
        portal handoff surface. MCP endpoint: <code>/mcp</code> | Health: <code>/health</code> |{' '}
        <TextLink href="https://www.courtlistener.com" target="_blank" rel="noopener noreferrer">
          CourtListener
        </TextLink>
      </footer>
    </div>
  );
}

export function AuthRequired(props: React.PropsWithChildren): React.JSX.Element {
  const { loading, session } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && !session?.authenticated) {
      navigate('/app/control-center', { replace: true });
    }
  }, [loading, navigate, session?.authenticated]);

  if (loading || !session?.authenticated) {
    return <LoadingState label="Loading" />;
  }

  return <>{props.children}</>;
}
