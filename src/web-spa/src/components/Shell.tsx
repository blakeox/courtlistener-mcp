import React from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToken } from '../lib/token-context';
import { Button, Stepper } from './ui';
import { useColorScheme } from '../hooks/useColorScheme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useSessionHeartbeat } from '../hooks/useSessionHeartbeat';
import { useToast } from './Toast';

export function Shell(props: React.PropsWithChildren<{ steps: Array<{ label: string; complete: boolean; active?: boolean; to?: string; disabled?: boolean }> }>): React.JSX.Element {
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
  const navGroups: Array<{ label: string; items: Array<{ label: string; to: string; requiresAuth?: boolean }> }> = [
    {
      label: 'MCP Overview',
      items: [{ label: 'Control Center', to: '/app/control-center' }],
    },
    {
      label: 'MCP Operations',
      items: [
        { label: 'MCP Keys', to: '/app/keys', requiresAuth: true },
        { label: 'MCP Playground', to: '/app/playground', requiresAuth: true },
      ],
    },
    {
      label: 'Session',
      items: [{ label: 'Session & Account', to: '/app/account', requiresAuth: true }],
    },
  ];

  useSessionHeartbeat(5 * 60 * 1000, {
    enabled: authed,
    onExpired: () => {
      clear();
      toast('Session expired — please log in again.', 'error');
      navigate('/app/login');
    },
  });

  React.useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      {!online && (
        <div className="network-banner" role="status" aria-live="polite">
          You're offline — changes may not save.
        </div>
      )}
      {!loading && !authed && hasLocalToken ? (
        <div className="status info" role="status" aria-live="polite">
          <strong>Session recovery:</strong> A local bearer token is stored, but this browser session is signed out.
          <div className="row status-actions">
            <Link to="/app/login" className="btn secondary">Log in again</Link>
            <Button
              variant="secondary"
              onClick={() => {
                clear();
                toast('Stored token cleared', 'info');
              }}
            >
              Clear stored token
            </Button>
          </div>
        </div>
      ) : null}
      <header className="topbar">
        <Link to="/app/control-center" className="brand">
          CourtListener MCP
          <small>Access Portal</small>
        </Link>
        <nav className="top-actions" aria-label="Global navigation">
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${scheme === 'light' ? 'dark' : 'light'} mode`}>
            {scheme === 'light' ? '🌙' : '☀️'}
          </button>
          {!loading && !authed ? (
            <>
              <NavLink to="/app/signup" className="pill">
                Create Account
              </NavLink>
              <NavLink to="/app/login" className="pill primary">
                Login
              </NavLink>
            </>
          ) : null}
          {!loading && authed ? (
            <>
              <NavLink to="/app/account" className="pill primary">
                Account
              </NavLink>
              <span className={`token-badge ${hasLocalToken ? 'set' : 'unset'}`}>
                {hasLocalToken ? '🔑 Token set' : '🔑 No token'}
              </span>
              <button
                type="button"
                id="logoutBtn"
                className="pill"
                onClick={async () => {
                  try {
                    await logout();
                  } catch {
                    // Graceful degradation — clear local state regardless
                  }
                  clear();
                  navigate('/app/login');
                }}
              >
                Log out
              </button>
            </>
          ) : null}
        </nav>
      </header>

      <div className="main-layout">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={sidebarOpen}
          aria-controls="primary-navigation"
        >
          ☰ Menu
        </button>
        <aside id="primary-navigation" className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <h1>MCP Control Center</h1>
          <Stepper steps={props.steps} />
          <div className="menu">
            {navGroups.map((group) => (
              <div key={group.label} className="menu-group">
                <p className="menu-group-label">{group.label}</p>
                {group.items.map((item) => {
                  const disabled = Boolean(item.requiresAuth && !authed);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => `${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`.trim()}
                      {...(disabled
                        ? { 'aria-disabled': 'true', tabIndex: -1, onClick: (e: React.MouseEvent) => e.preventDefault() }
                        : {})}
                    >
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            ))}
            {!authed && (
              <div className="menu-group">
                <p className="menu-group-label">Session access</p>
                <NavLink to="/app/signup" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Create Account
                </NavLink>
                <NavLink to="/app/login" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Login
                </NavLink>
              </div>
            )}
          </div>
          {authed ? (
            <div className="sidebar-shortcuts">
              <Link to="/app/playground" className="btn secondary">Open MCP Playground</Link>
              <Link to="/app/keys" className="btn">Manage MCP Keys</Link>
            </div>
          ) : null}
        </aside>
        <main id="main-content" ref={mainRef} tabIndex={-1} className="content">{props.children}</main>
      </div>

      <footer>
        MCP endpoint: <code>/mcp</code> | Health: <code>/health</code> | <a href="https://www.courtlistener.com" target="_blank" rel="noopener noreferrer">CourtListener</a>
      </footer>
    </div>
  );
}

export function AuthRequired(props: React.PropsWithChildren): React.JSX.Element {
  const { loading, session } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && !session?.authenticated) {
      navigate('/app/login', { replace: true });
    }
  }, [loading, navigate, session?.authenticated]);

  if (loading || !session?.authenticated) {
    return (
      <div className="loading" role="status" aria-busy="true" aria-label="Loading">
        <div className="skeleton skeleton-line"></div>
        <div className="skeleton skeleton-line short"></div>
      </div>
    );
  }

  return <>{props.children}</>;
}
