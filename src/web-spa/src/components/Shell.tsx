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
  const { toast } = useToast();

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
      <header className="topbar">
        <Link to="/app/onboarding" className="brand">
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
              <span className={`token-badge ${token ? 'set' : 'unset'}`}>
                {token ? '🔑 Token set' : '🔑 No token'}
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
        <button type="button" className="mobile-menu-btn" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle navigation menu">
          ☰ Menu
        </button>
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <h1>Setup Progress</h1>
          <Stepper steps={props.steps} />
          <div className="menu">
            <NavLink to="/app/onboarding" className={({ isActive }) => (isActive ? 'active' : '')}>
              Dashboard
            </NavLink>
            <NavLink
              to="/app/keys"
              className={({ isActive }) => (isActive ? 'active' : '')}
              {...(!authed ? { 'aria-disabled': 'true', tabIndex: -1, onClick: (e: React.MouseEvent) => e.preventDefault(), style: { opacity: 0.5, pointerEvents: 'none' as const } } : {})}
            >
              API Keys
            </NavLink>
            <NavLink
              to="/app/playground"
              className={({ isActive }) => (isActive ? 'active' : '')}
              {...(!authed ? { 'aria-disabled': 'true', tabIndex: -1, onClick: (e: React.MouseEvent) => e.preventDefault(), style: { opacity: 0.5, pointerEvents: 'none' as const } } : {})}
            >
              Playground
            </NavLink>
            <NavLink
              to="/app/account"
              className={({ isActive }) => (isActive ? 'active' : '')}
              {...(!authed ? { 'aria-disabled': 'true', tabIndex: -1, onClick: (e: React.MouseEvent) => e.preventDefault(), style: { opacity: 0.5, pointerEvents: 'none' as const } } : {})}
            >
              Account
            </NavLink>
            {!authed && (
              <>
                <NavLink to="/app/signup" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Create Account
                </NavLink>
                <NavLink to="/app/login" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Login
                </NavLink>
              </>
            )}
          </div>
        </aside>
        <main id="main-content" ref={mainRef} tabIndex={-1} className="content" style={{ outline: 'none' }}>{props.children}</main>
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
