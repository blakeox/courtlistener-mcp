import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToken } from '../lib/token-context';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';
import {
  BrandLink,
  Button,
  ButtonLink,
  InlineGroup,
  LoadingState,
  NavCardLink,
  SkipLink,
  StatusBanner,
} from './ui';
import { useColorScheme } from '../hooks/useColorScheme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useSessionHeartbeat } from '../hooks/useSessionHeartbeat';
import { useToast } from './Toast';
import { getSessionDisplayLabel } from '../lib/session-display';
import {
  getWorkspaceNavGroups,
  getWorkspaceSecondaryNavSections,
  getWorkspaceMeta,
} from '../lib/workspace-shell';
import {
  accountMenuActionClass,
  accountMenuClass,
  accountMenuPanelClassName,
  accountMenuPrimaryClass,
  accountMenuTriggerBadgeClass,
  accountMenuTriggerClassName,
  accountMenuTriggerIconClass,
  accountStatusBlockClass,
  accountStatusDetailClass,
  accountStatusEyebrowClass,
  accountStatusTitleClass,
  appSidebarBrandBlockClass,
  appSidebarBrandMarkClass,
  appSidebarHeaderClass,
  menuGroupClassName,
  menuGroupDisclosureClass,
  menuGroupHeaderClass,
  menuGroupLabelClassName,
  menuGroupToggleIconClass,
  mobileMenuBtnClass,
  mobileSidebarBackdropClass,
  mobileSidebarCloseClass,
  navCardLinkMetaClass,
  navCardLinkTextClass,
  shellMainColumnClass,
  shellMenuClass,
  sidebarSecondaryLabelClassName,
  sidebarSecondaryLinksClassName,
  sidebarSecondaryNavLinkClassName,
  sidebarSecondarySectionClassName,
  srOnlyClass,
  themeToggleButtonClass,
  themeToggleIconClass,
  topActionsUtilityClass,
  topbarActionsClass,
  topbarContextClass,
  topbarContextDescriptionClass,
  topbarContextShellClass,
  topbarContextValueClass,
  workspaceContentClass,
  workspaceMainLayoutClass,
  workspaceShellClass,
  workspaceSidebarClassName,
  workspaceStatusStackClass,
  workspaceTopbarClass,
} from '../lib/shell-classes';

const LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY = 'clmcp_workspace_sidebar_collapsed';
const DESKTOP_NAV_MEDIA_QUERY = '(min-width: 1101px)';

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
  const [isDesktopNav, setIsDesktopNav] = React.useState(false);
  const [prioritizeWorkNav, setPrioritizeWorkNav] = React.useState(false);
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);
  const { scheme, toggle: toggleTheme } = useColorScheme();
  const { online } = useNetworkStatus();
  const mainRef = React.useRef<HTMLElement | null>(null);
  const previouslyOpenSidebarRef = React.useRef(false);
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null);
  const accountMenuPanelRef = React.useRef<HTMLDivElement | null>(null);
  const accountMenuReturnFocusRef = React.useRef(false);
  const sidebarRef = React.useRef<HTMLElement | null>(null);

  const authed = Boolean(session?.authenticated);
  const hasLocalToken = Boolean(token.trim());
  const { toast } = useToast();
  const authStartHref = buildHostedAuthStartHref(location.pathname);
  const currentWorkspace = getWorkspaceMeta(location.pathname);
  const showRecoveryBanner = !loading && !authed && hasLocalToken;

  useSessionHeartbeat(5 * 60 * 1000, {
    enabled: authed,
    onExpired: () => {
      clear();
      toast('Browser access expired — review account status.', 'error');
      navigate('/app/account');
    },
  });

  React.useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  React.useEffect(() => {
    if (authed || hasLocalToken) {
      setPrioritizeWorkNav(true);
    }
  }, [authed, hasLocalToken]);

  React.useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEY);
    } catch {
      // localStorage not available
    }
  }, []);

  React.useEffect(() => {
    setSidebarOpen(false);
    accountMenuReturnFocusRef.current = false;
    setAccountMenuOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(DESKTOP_NAV_MEDIA_QUERY);
    const handleDesktopViewport = (event: MediaQueryListEvent) => {
      setIsDesktopNav(event.matches);
      if (event.matches) {
        setSidebarOpen(false);
      }
    };

    if (mediaQueryList.matches) {
      setIsDesktopNav(true);
      setSidebarOpen(false);
    } else {
      setIsDesktopNav(false);
    }

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleDesktopViewport);
      return () => mediaQueryList.removeEventListener('change', handleDesktopViewport);
    }

    mediaQueryList.addListener(handleDesktopViewport);
    return () => mediaQueryList.removeListener(handleDesktopViewport);
  }, []);

  React.useEffect(() => {
    if (!sidebarOpen) return undefined;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const getFocusableElements = () =>
      sidebarRef.current
        ? Array.from(
            sidebarRef.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((element) => !element.hasAttribute('disabled'))
        : [];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        return;
      }

      if (event.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
          event.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey) {
          if (activeElement === firstElement || !sidebarRef.current?.contains(activeElement)) {
            event.preventDefault();
            lastElement.focus();
          }
          return;
        }

        if (activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
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

    const getFocusableElements = () =>
      accountMenuPanelRef.current
        ? Array.from(
            accountMenuPanelRef.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((element) => !element.hasAttribute('disabled'))
        : [];

    getFocusableElements()[0]?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        accountMenuReturnFocusRef.current = true;
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        accountMenuReturnFocusRef.current = true;
        setAccountMenuOpen(false);
        return;
      }

      if (event.key === 'Tab' && accountMenuPanelRef.current) {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
          return;
        }

        const activeElement = document.activeElement as HTMLElement | null;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && activeElement === firstElement) {
          event.preventDefault();
          accountMenuReturnFocusRef.current = true;
          setAccountMenuOpen(false);
          return;
        }

        if (!event.shiftKey && activeElement === lastElement) {
          accountMenuReturnFocusRef.current = true;
          setAccountMenuOpen(false);
        }
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  React.useEffect(() => {
    if (!accountMenuOpen && accountMenuReturnFocusRef.current) {
      accountMenuRef.current?.querySelector<HTMLButtonElement>('.account-menu-trigger')?.focus();
      accountMenuReturnFocusRef.current = false;
    }
  }, [accountMenuOpen]);

  const accountLabel = getSessionDisplayLabel(session?.user);
  const credentialStatusLabel = hasLocalToken ? 'Credential loaded' : 'No local credential';
  const accountTriggerLabel = 'Account';
  const accountStatusEyebrow = showRecoveryBanner ? 'Account recovery' : 'Account status';
  const accountStatusTitle = loading
    ? 'Checking account'
    : showRecoveryBanner
      ? 'Action needed'
      : authed
        ? 'Signed in'
        : 'Signed out';
  const accountStatusDetail = loading
    ? 'Confirming browser access and local credential state.'
    : showRecoveryBanner
      ? 'You are signed out in this browser, but a local MCP credential is still stored on this device.'
      : authed
        ? `Signed in as ${accountLabel}. ${credentialStatusLabel}.`
        : 'No local credential loaded on this device.';

  const isRouteMatch = React.useCallback(
    (path: string, external?: boolean) => {
      if (external) {
        return false;
      }

      return path === '/app'
        ? location.pathname === path
        : location.pathname === path || location.pathname.startsWith(`${path}/`);
    },
    [location.pathname],
  );

  const handleLogout = React.useCallback(async () => {
    try {
      await logout();
      clear();
      accountMenuReturnFocusRef.current = false;
      setAccountMenuOpen(false);
      navigate('/app');
    } catch {
      toast('Logout failed — session is still active.', 'error');
    }
  }, [clear, logout, navigate, toast]);

  const navGroups = React.useMemo(
    () => getWorkspaceNavGroups(prioritizeWorkNav),
    [prioritizeWorkNav],
  );

  const secondaryNavSections = React.useMemo(
    () => getWorkspaceSecondaryNavSections(prioritizeWorkNav),
    [prioritizeWorkNav],
  );

  const renderWorkspaceLink = (
    item: { label: string; to: string; external?: boolean },
    options?: { className?: string; end?: boolean },
  ) => {
    const content = (
      <>
        <span className={navCardLinkTextClass}>{item.label}</span>
        {item.external ? <span className={navCardLinkMetaClass}>New tab</span> : null}
      </>
    );

    if (item.external) {
      return (
        <NavCardLink
          key={item.to}
          href={item.to}
          target="_blank"
          rel="noopener noreferrer"
          className={options?.className}
        >
          {content}
        </NavCardLink>
      );
    }

    return (
      <NavCardLink key={item.to} to={item.to} end={options?.end} className={options?.className}>
        {content}
      </NavCardLink>
    );
  };

  return (
    <div className={workspaceShellClass}>
      <SkipLink href="#main-content">Skip to content</SkipLink>
      <div className={workspaceMainLayoutClass}>
        {sidebarOpen ? (
          <button
            type="button"
            className={mobileSidebarBackdropClass}
            aria-label="Close navigation menu"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        <aside
          id="primary-navigation"
          ref={sidebarRef}
          className={workspaceSidebarClassName(sidebarOpen)}
        >
          <div className={appSidebarHeaderClass}>
            <div className={appSidebarBrandBlockClass}>
              <BrandLink
                to="/app"
                tone="shell"
                label="CourtListener MCP"
                subtitle="Operator workspace"
                icon={<span className={appSidebarBrandMarkClass}>CL</span>}
              />
            </div>
            <Button
              variant="secondary"
              size="compact"
              className={mobileSidebarCloseClass}
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation menu"
            >
              Close
            </Button>
          </div>
          <div className={shellMenuClass}>
            {navGroups.map((group) => {
              const groupActive = group.items.some((item) => isRouteMatch(item.to, item.external));
              return (
                <div key={group.id} className={menuGroupClassName(groupActive)}>
                  <div className={menuGroupHeaderClass}>
                    {(() => {
                      const isGroupExpanded = groupActive || expandedGroups[group.id] === true;

                      return group.collapsible && !isDesktopNav ? (
                        <button
                          type="button"
                          className={menuGroupDisclosureClass}
                          aria-expanded={isGroupExpanded}
                          aria-label={`${isGroupExpanded ? 'Collapse' : 'Expand'} ${group.label} section`}
                          onClick={() =>
                            setExpandedGroups((previous) => ({
                              ...previous,
                              [group.id]: previous[group.id] !== true,
                            }))
                          }
                        >
                          <span className={menuGroupLabelClassName(groupActive)}>
                            {group.label}
                          </span>
                          <span className={menuGroupToggleIconClass} aria-hidden="true">
                            {isGroupExpanded ? '▾' : '▸'}
                          </span>
                        </button>
                      ) : (
                        <p className={menuGroupLabelClassName(groupActive)}>{group.label}</p>
                      );
                    })()}
                  </div>
                  {(() => {
                    const groupExpanded =
                      isDesktopNav ||
                      !group.collapsible ||
                      group.items.some((item) => isRouteMatch(item.to, item.external)) ||
                      expandedGroups[group.id] === true;
                    const visibleItems = groupExpanded ? group.items : [];

                    return (
                      <>
                        {visibleItems.map((item) =>
                          renderWorkspaceLink(item, { end: item.to === '/app' }),
                        )}
                      </>
                    );
                  })()}
                </div>
              );
            })}
          </div>
          {secondaryNavSections.map((section) => (
            <div key={section.id} className={sidebarSecondarySectionClassName(section.variant)}>
              <p className={sidebarSecondaryLabelClassName(section.variant)}>{section.label}</p>
              <div className={sidebarSecondaryLinksClassName(section.variant)}>
                {section.items.map((item) =>
                  renderWorkspaceLink(item, {
                    className: sidebarSecondaryNavLinkClassName(section.variant),
                  }),
                )}
              </div>
            </div>
          ))}
        </aside>
        <div className={shellMainColumnClass}>
          {!online || showRecoveryBanner ? (
            <div className={workspaceStatusStackClass}>
              {!online && (
                <StatusBanner message="You're offline — changes may not save." type="warn" />
              )}
              {showRecoveryBanner ? (
                <StatusBanner
                  title="Account recovery:"
                  message="A local credential is still stored on this device, but browser access is signed out."
                >
                  <InlineGroup>
                    <ButtonLink to="/app/account" variant="secondary">
                      Review account status
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
            </div>
          ) : null}
          <header className={workspaceTopbarClass}>
            <div className={topbarContextShellClass} aria-label="Current workspace route">
              <div className={topbarContextClass}>
                <strong className={topbarContextValueClass}>{currentWorkspace.label}</strong>
                <span className={topbarContextDescriptionClass}>
                  {currentWorkspace.description}
                </span>
              </div>
            </div>
            <div className={topbarActionsClass} role="group" aria-label="Workspace utilities">
              <InlineGroup className={topActionsUtilityClass}>
                <Button
                  variant="ghost"
                  size="compact"
                  className={mobileMenuBtnClass}
                  onClick={() => setSidebarOpen((value) => !value)}
                  aria-label="Toggle navigation menu"
                  aria-expanded={sidebarOpen}
                  aria-controls="primary-navigation"
                >
                  ☰ Menu
                </Button>
                <Button
                  variant="ghost"
                  size="compact"
                  className={themeToggleButtonClass}
                  onClick={toggleTheme}
                  aria-label={`Switch to ${scheme === 'light' ? 'dark' : 'light'} mode`}
                >
                  <span className={themeToggleIconClass} aria-hidden="true">
                    {scheme === 'light' ? '☾' : '☀'}
                  </span>
                  <span className={srOnlyClass}>
                    Switch to {scheme === 'light' ? 'dark' : 'light'} mode
                  </span>
                </Button>
                <div className={accountMenuClass} ref={accountMenuRef}>
                  <Button
                    variant="secondary"
                    size="compact"
                    className={accountMenuTriggerClassName({
                      open: accountMenuOpen,
                      warning: showRecoveryBanner,
                    })}
                    aria-label={
                      showRecoveryBanner ? 'Account — action needed' : accountTriggerLabel
                    }
                    aria-controls="account-panel"
                    aria-expanded={accountMenuOpen}
                    onClick={() =>
                      setAccountMenuOpen((previous) => {
                        accountMenuReturnFocusRef.current = previous;
                        return !previous;
                      })
                    }
                  >
                    {showRecoveryBanner ? (
                      <span className={accountMenuTriggerBadgeClass} aria-hidden="true">
                        !
                      </span>
                    ) : null}
                    <span>{accountTriggerLabel}</span>
                    <span className={accountMenuTriggerIconClass} aria-hidden="true">
                      ▾
                    </span>
                  </Button>
                  {accountMenuOpen ? (
                    <div
                      id="account-panel"
                      ref={accountMenuPanelRef}
                      className={accountMenuPanelClassName(showRecoveryBanner)}
                      role="group"
                      aria-label="Account panel"
                    >
                      <div className={accountStatusBlockClass} role="status" aria-live="polite">
                        <p className={accountStatusEyebrowClass}>{accountStatusEyebrow}</p>
                        <p className={accountStatusTitleClass}>{accountStatusTitle}</p>
                        <p className={accountStatusDetailClass}>{accountStatusDetail}</p>
                      </div>
                      <div className={accountMenuPrimaryClass}>
                        {loading ? null : authed ? (
                          <>
                            <ButtonLink
                              to="/app/account"
                              variant="primary"
                              size="compact"
                              className={accountMenuActionClass}
                            >
                              Open account
                            </ButtonLink>
                            <ButtonLink
                              to="/app/credentials"
                              variant="secondary"
                              size="compact"
                              className={accountMenuActionClass}
                            >
                              Open credentials
                            </ButtonLink>
                            <Button
                              id="logoutBtn"
                              variant="secondary"
                              size="compact"
                              className={accountMenuActionClass}
                              onClick={handleLogout}
                            >
                              Log out
                            </Button>
                          </>
                        ) : (
                          <>
                            <ButtonLink
                              href={authStartHref}
                              variant="primary"
                              size="compact"
                              className={accountMenuActionClass}
                            >
                              {showRecoveryBanner ? 'Sign in to recover account' : 'Sign in'}
                            </ButtonLink>
                            <ButtonLink
                              to="/app/account"
                              variant="secondary"
                              size="compact"
                              className={accountMenuActionClass}
                            >
                              Open account
                            </ButtonLink>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </InlineGroup>
            </div>
          </header>
          <main id="main-content" ref={mainRef} tabIndex={-1} className={workspaceContentClass}>
            {props.children}
          </main>
        </div>
      </div>
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
