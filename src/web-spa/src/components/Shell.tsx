import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToken } from '../lib/token-context';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';
import {
  BrandLink,
  Button,
  ButtonLink,
  InfoBlock,
  InlineGroup,
  LoadingState,
  NavCardLink,
  SkipLink,
  StatusBanner,
  TextLink,
} from './ui';
import { useColorScheme } from '../hooks/useColorScheme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useSessionHeartbeat } from '../hooks/useSessionHeartbeat';
import { useToast } from './Toast';
import { WORKSPACE_DOCS_URL, WORKSPACE_NAV_GROUPS, getWorkspaceMeta } from '../lib/workspace-shell';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'clmcp_workspace_sidebar_collapsed';

function getStoredSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

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
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => getStoredSidebarCollapsed());
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});
  const [expandedSecondaryGroups, setExpandedSecondaryGroups] = React.useState<
    Record<string, boolean>
  >({});
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);
  const { scheme, toggle: toggleTheme } = useColorScheme();
  const { online } = useNetworkStatus();
  const mainRef = React.useRef<HTMLElement | null>(null);
  const previouslyOpenSidebarRef = React.useRef(false);
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null);

  const authed = Boolean(session?.authenticated);
  const hasLocalToken = Boolean(token.trim());
  const { toast } = useToast();
  const authStartHref = buildHostedAuthStartHref(location.pathname);
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
    setAccountMenuOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (!sidebarOpen) return undefined;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidebarOpen]);

  React.useEffect(() => {
    if (sidebarOpen) {
      document.querySelector<HTMLButtonElement>('.mobile-sidebar-close')?.focus();
    } else if (previouslyOpenSidebarRef.current) {
      document.querySelector<HTMLButtonElement>('.mobile-menu-btn')?.focus();
    }

    previouslyOpenSidebarRef.current = sidebarOpen;
  }, [sidebarOpen]);

  React.useEffect(() => {
    if (!accountMenuOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  const accountLabel = authed ? (session?.user?.id ?? 'Research operator') : 'Guest';
  const authStatusLabel = authed ? 'Signed in' : 'Signed out';
  const credentialStatusLabel = hasLocalToken ? 'Credential loaded' : 'No local credential';

  const handleLogout = React.useCallback(async () => {
    try {
      await logout();
      clear();
      setAccountMenuOpen(false);
      navigate('/app');
    } catch {
      toast('Logout failed — session is still active.', 'error');
    }
  }, [clear, logout, navigate, toast]);

  const toggleSidebarCollapsed = React.useCallback(() => {
    setSidebarCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // localStorage not available
      }
      return next;
    });
  }, []);

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

      <div
        className={`main-layout app-main-layout-landing ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`.trim()}
      >
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
        {sidebarOpen ? (
          <button
            type="button"
            className="mobile-sidebar-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        <aside
          id="primary-navigation"
          className={`sidebar app-sidebar-landing ${sidebarOpen ? 'open' : ''} ${
            sidebarCollapsed ? 'collapsed' : ''
          }`.trim()}
        >
          <div className="app-sidebar-header">
            <div className="app-sidebar-brand-block">
              <BrandLink
                to="/app"
                label="CourtListener MCP"
                subtitle="Operator workspace"
                icon={<span className="app-sidebar-brand-mark">CL</span>}
                tone="landing"
              />
            </div>
            <Button
              variant="secondary"
              size="compact"
              className="mobile-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation menu"
            >
              Close
            </Button>
          </div>
          <div className="menu">
            {WORKSPACE_NAV_GROUPS.map((group) => (
              <div
                key={group.label}
                className={`menu-group ${
                  group.items.some((item) => location.pathname === item.to)
                    ? 'menu-group-active'
                    : ''
                }`.trim()}
              >
                <div className="menu-group-header">
                  <p className="menu-group-label">{group.label}</p>
                  {(() => {
                    const isGroupExpanded =
                      group.items.some((item) => location.pathname === item.to) ||
                      expandedGroups[group.label] === true;

                    return group.collapsible && !sidebarCollapsed ? (
                      <button
                        type="button"
                        className="menu-group-toggle"
                        aria-expanded={isGroupExpanded}
                        aria-label={`${isGroupExpanded ? 'Collapse' : 'Expand'} ${group.label} section`}
                        onClick={() =>
                          setExpandedGroups((previous) => ({
                            ...previous,
                            [group.label]: previous[group.label] !== true,
                          }))
                        }
                      >
                        <span className="menu-group-toggle-icon" aria-hidden="true">
                          {isGroupExpanded ? '▾' : '▸'}
                        </span>
                        <span className="sr-only">
                          {isGroupExpanded ? 'Collapse' : 'Expand'} {group.label}
                        </span>
                      </button>
                    ) : null;
                  })()}
                </div>
                {(() => {
                  const primaryItems = group.items.filter((item) => item.priority !== 'secondary');
                  const secondaryItems = group.items.filter(
                    (item) => item.priority === 'secondary',
                  );
                  const groupExpanded =
                    sidebarCollapsed ||
                    !group.collapsible ||
                    group.items.some((item) => location.pathname === item.to) ||
                    expandedGroups[group.label] === true;
                  const hasActiveSecondaryItem = secondaryItems.some(
                    (item) => location.pathname === item.to,
                  );
                  const secondaryExpanded = sidebarCollapsed
                    ? hasActiveSecondaryItem
                    : hasActiveSecondaryItem || expandedSecondaryGroups[group.label] === true;
                  const secondaryToggleLabel =
                    group.label === 'Get started'
                      ? secondaryExpanded
                        ? 'Fewer setup routes'
                        : 'More setup routes'
                      : secondaryExpanded
                        ? 'Fewer routes'
                        : 'More routes';
                  const visibleItems = groupExpanded
                    ? [
                        ...primaryItems,
                        ...(secondaryExpanded
                          ? secondaryItems
                          : secondaryItems.filter((item) => location.pathname === item.to)),
                      ]
                    : [];

                  return (
                    <>
                      {visibleItems.map((item) => {
                        const content = (
                          <>
                            <span className="nav-card-link-short" aria-hidden="true">
                              {item.shortLabel}
                            </span>
                            <span className="nav-card-link-text">{item.label}</span>
                          </>
                        );

                        if (item.external) {
                          return (
                            <NavCardLink
                              key={item.to}
                              href={item.to}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={sidebarCollapsed ? item.label : undefined}
                              title={sidebarCollapsed ? item.label : undefined}
                            >
                              {content}
                            </NavCardLink>
                          );
                        }
                        return (
                          <NavCardLink
                            key={item.to}
                            to={item.to}
                            aria-label={sidebarCollapsed ? item.label : undefined}
                            title={sidebarCollapsed ? item.label : undefined}
                          >
                            {content}
                          </NavCardLink>
                        );
                      })}
                      {!sidebarCollapsed &&
                      groupExpanded &&
                      secondaryItems.length > 0 &&
                      !hasActiveSecondaryItem ? (
                        <button
                          type="button"
                          className="menu-group-more"
                          onClick={() =>
                            setExpandedSecondaryGroups((previous) => ({
                              ...previous,
                              [group.label]: previous[group.label] !== true,
                            }))
                          }
                          aria-expanded={expandedSecondaryGroups[group.label] === true}
                        >
                          {secondaryToggleLabel}
                        </button>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </aside>
        <div className="shell-main-column">
          <header className="topbar app-topbar-landing">
            <InfoBlock
              eyebrow="Workspace"
              title={currentWorkspace.label}
              titleAs="strong"
              description={currentWorkspace.description}
              className="topbar-heading"
              titleClassName="workspace-topbar-title"
            />
            <div className="topbar-actions" role="group" aria-label="Workspace utilities">
              <InlineGroup className="top-actions top-actions-utility">
                <Button
                  variant="secondary"
                  size="compact"
                  className="toolbar-button desktop-sidebar-toggle"
                  onClick={toggleSidebarCollapsed}
                  aria-label={`${sidebarCollapsed ? 'Expand' : 'Collapse'} sidebar`}
                >
                  <span className="desktop-sidebar-toggle-icon" aria-hidden="true">
                    {sidebarCollapsed ? '⇥' : '⇤'}
                  </span>
                  <span className="sr-only">
                    {sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                  </span>
                </Button>
                <ButtonLink
                  to="/app/docs"
                  variant="secondary"
                  size="compact"
                  className="toolbar-button help-control"
                  aria-label="Open docs"
                >
                  <span className="help-control-icon" aria-hidden="true">
                    ?
                  </span>
                  <span className="sr-only">Open docs</span>
                </ButtonLink>
                <Button
                  variant="secondary"
                  size="compact"
                  className="toolbar-button theme-toggle"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${scheme === 'light' ? 'dark' : 'light'} mode`}
                >
                  <span className="theme-toggle-icon" aria-hidden="true">
                    {scheme === 'light' ? '☾' : '☀'}
                  </span>
                  <span className="sr-only">
                    Switch to {scheme === 'light' ? 'dark' : 'light'} mode
                  </span>
                </Button>
                <div className="account-menu" ref={accountMenuRef}>
                  <Button
                    variant="secondary"
                    size="compact"
                    className={`toolbar-button account-menu-trigger ${
                      accountMenuOpen ? 'open' : ''
                    }`.trim()}
                    aria-haspopup="menu"
                    aria-expanded={accountMenuOpen}
                    onClick={() => setAccountMenuOpen((previous) => !previous)}
                  >
                    <span>{accountLabel}</span>
                    <span className="account-menu-trigger-icon" aria-hidden="true">
                      ▾
                    </span>
                  </Button>
                  {accountMenuOpen ? (
                    <div className="account-menu-panel" role="menu" aria-label="Account menu">
                      <div className="account-menu-status">
                        <strong>{authStatusLabel}</strong>
                        <p>{credentialStatusLabel}</p>
                      </div>
                      <div className="account-menu-links">
                        <TextLink to="/app/session">Session</TextLink>
                        <TextLink to="/app/credentials">Credentials</TextLink>
                      </div>
                      {loading ? null : authed ? (
                        <Button
                          id="logoutBtn"
                          variant="secondary"
                          size="compact"
                          className="account-menu-action"
                          onClick={handleLogout}
                        >
                          Log out
                        </Button>
                      ) : (
                        <ButtonLink
                          href={authStartHref}
                          variant="primary"
                          size="compact"
                          className="account-menu-action"
                        >
                          Sign in
                        </ButtonLink>
                      )}
                    </div>
                  ) : null}
                </div>
              </InlineGroup>
            </div>
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
        CourtListener MCP workspace. Public sign-in flows through the hosted auth handoff. Need
        setup details?{' '}
        <TextLink href={WORKSPACE_DOCS_URL} target="_blank" rel="noopener noreferrer">
          Open the docs
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
