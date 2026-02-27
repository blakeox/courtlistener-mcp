import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { clearToken } from '../lib/storage';
import { Button, Stepper } from './ui';

export function Shell(props: React.PropsWithChildren<{ steps: Array<{ label: string; complete: boolean; active?: boolean }> }>): React.JSX.Element {
  const { session, loading, logout } = useAuth();
  const navigate = useNavigate();

  const authed = Boolean(session?.authenticated);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/app/onboarding" className="brand">
          CourtListener MCP
          <small>Access Portal</small>
        </Link>
        <nav className="top-actions" aria-label="Global navigation">
          {!loading && !authed ? (
            <>
              <NavLink to="/app/signup" className="pill">
                Create Account
              </NavLink>
              <NavLink to="/app/reset-password" className="pill secondary">
                Forgot Password
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
              <button
                id="logoutBtn"
                className="pill"
                onClick={async () => {
                  await logout();
                  clearToken();
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
        <aside className="sidebar">
          <h1>Setup Progress</h1>
          <Stepper steps={props.steps} />
          <div className="menu">
            <NavLink to="/app/onboarding" className={({ isActive }) => (isActive ? 'active' : '')}>
              Onboarding
            </NavLink>
            {authed ? (
              <>
                <NavLink to="/app/keys" className={({ isActive }) => (isActive ? 'active' : '')}>
                  API Keys
                </NavLink>
                <NavLink to="/app/console" className={({ isActive }) => (isActive ? 'active' : '')}>
                  MCP Console
                </NavLink>
                <NavLink to="/app/account" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Account
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/app/signup" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Create Account
                </NavLink>
                <NavLink to="/app/login" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Login
                </NavLink>
                <NavLink to="/app/reset-password" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Reset Password
                </NavLink>
              </>
            )}
          </div>
        </aside>
        <main className="content">{props.children}</main>
      </div>

      <footer>
        MCP endpoint: <code>/mcp</code> | Health: <code>/health</code>
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
    return <div className="loading">Loading account session...</div>;
  }

  return <>{props.children}</>;
}
