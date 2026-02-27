import React from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shell, AuthRequired } from './components/Shell';
import { SignupPage } from './pages/SignupPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { KeysPage } from './pages/KeysPage';
import { ConsolePage } from './pages/ConsolePage';
import { AccountPage } from './pages/AccountPage';
import { useAuth } from './lib/auth';
import { listKeys } from './lib/api';

export function App(): React.JSX.Element {
  const { session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const keysQuery = useQuery({
    queryKey: ['keys', 'progress'],
    queryFn: () => listKeys(),
    enabled: Boolean(session?.authenticated),
  });

  const hasAccount = Boolean(localStorage.getItem('clmcp_signup_started_at'));
  const hasVerifiedAndLoggedIn = Boolean(session?.authenticated);
  const hasKey = (keysQuery.data?.keys.length ?? 0) > 0;
  const hasMcpSuccess = Boolean(
    localStorage
      .getItem('clmcp_telemetry_events')
      ?.includes('first_mcp_call_succeeded'),
  );

  const steps = [
    { label: 'Create account', complete: hasAccount, active: location.pathname === '/app/signup' },
    {
      label: 'Verify email',
      complete: hasVerifiedAndLoggedIn,
      active: location.pathname === '/app/login' || location.pathname === '/app/reset-password',
    },
    {
      label: 'Login',
      complete: hasVerifiedAndLoggedIn,
      active: location.pathname === '/app/login' || location.pathname === '/app/reset-password',
    },
    { label: 'Create key', complete: hasKey, active: location.pathname === '/app/keys' },
    { label: 'First MCP call', complete: hasMcpSuccess, active: location.pathname === '/app/console' },
  ];

  React.useEffect(() => {
    const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!raw) return;
    const params = new URLSearchParams(raw);
    const flowType = (params.get('type') || '').trim().toLowerCase();
    const accessToken = (params.get('access_token') || '').trim();
    if (flowType !== 'recovery' || !accessToken) return;
    if (location.pathname === '/app/reset-password') return;
    navigate(
      {
        pathname: '/app/reset-password',
        hash: window.location.hash,
      },
      { replace: true },
    );
  }, [location.pathname, navigate]);

  return (
    <Shell steps={steps}>
      <Routes>
        <Route path="/app/signup" element={<SignupPage />} />
        <Route path="/app/login" element={<LoginPage />} />
        <Route path="/app/reset-password" element={<ResetPasswordPage />} />
        <Route path="/app/onboarding" element={<OnboardingPage />} />
        <Route
          path="/app/keys"
          element={
            <AuthRequired>
              <KeysPage />
            </AuthRequired>
          }
        />
        <Route
          path="/app/console"
          element={
            <AuthRequired>
              <ConsolePage />
            </AuthRequired>
          }
        />
        <Route
          path="/app/account"
          element={
            <AuthRequired>
              <AccountPage />
            </AuthRequired>
          }
        />
        <Route path="*" element={<Navigate to="/app/onboarding" replace />} />
      </Routes>
    </Shell>
  );
}
