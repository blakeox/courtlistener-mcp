import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shell, AuthRequired } from './components/Shell';
import { ErrorBoundary } from './components/ErrorBoundary';

import { SignupPage } from './pages/SignupPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { KeysPage } from './pages/KeysPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { AccountPage } from './pages/AccountPage';
import { useAuth } from './lib/auth';
import { listKeys } from './lib/api';
import { keysQueryKey } from './lib/query-keys';
import { TokenProvider, useToken } from './lib/token-context';
import { ToastProvider } from './components/Toast';
import { verifyMcpRuntimeReadiness } from './lib/mcp-runtime-readiness';

function PageLoader(): React.JSX.Element {
  return (
    <div className="loading" role="status" aria-busy="true" aria-label="Loading page">
      <div className="skeleton skeleton-line"></div>
      <div className="skeleton skeleton-line short"></div>
    </div>
  );
}

export function App(): React.JSX.Element {
  return (
    <TokenProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </TokenProvider>
  );
}

function AppContent(): React.JSX.Element {
  const { session } = useAuth();
  const { token } = useToken();
  const location = useLocation();

  const keysQuery = useQuery({
    queryKey: keysQueryKey,
    queryFn: () => listKeys(),
    enabled: Boolean(session?.authenticated),
  });

  const hasAccount = Boolean(session?.user?.id) || Boolean(localStorage.getItem('clmcp_signup_started_at'));
  const hasVerifiedAndLoggedIn = Boolean(session?.authenticated);
  const hasKey = (keysQuery.data?.keys.length ?? 0) > 0;
  const hasToken = Boolean(token.trim());
  const expectedProtocolVersion = '2025-06-18';
  const mcpReadinessQuery = useQuery({
    queryKey: ['mcp-runtime-readiness', token],
    queryFn: () => verifyMcpRuntimeReadiness(token),
    enabled: hasVerifiedAndLoggedIn && hasKey && hasToken,
    retry: false,
  });
  const hasProtocolMismatch = Boolean(
    mcpReadinessQuery.data?.protocolVersion
      && mcpReadinessQuery.data.protocolVersion !== expectedProtocolVersion,
  );
  const hasMcpSuccess = Boolean(mcpReadinessQuery.data?.ready) && !hasProtocolMismatch;
  const isPath = (paths: string[]): boolean => paths.includes(location.pathname);

  const steps = [
    { label: 'Session setup', complete: hasAccount, active: isPath(['/app/signup']), to: '/app/signup' },
    {
      label: 'Session auth',
      complete: hasVerifiedAndLoggedIn,
      active: isPath(['/app/login', '/app/reset-password']),
      to: '/app/login',
    },
    {
      label: 'MCP key ready',
      complete: hasKey,
      active: isPath(['/app/keys']),
      to: '/app/keys',
      disabled: !hasVerifiedAndLoggedIn,
    },
    {
      label: 'MCP protocol ready',
      complete: hasMcpSuccess,
      active: isPath(['/app/playground', '/app/control-center', '/app']),
      to: '/app/playground',
      disabled: !hasKey || !hasToken,
    },
  ];

  return (
    <Shell steps={steps}>
      <ErrorBoundary>
        <React.Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/app" element={<Navigate to="/app/control-center" replace />} />
            <Route path="/app/control-center" element={<OnboardingPage />} />
            <Route path="/app/signup" element={<SignupPage />} />
            <Route path="/app/login" element={<LoginPage />} />
            <Route path="/app/reset-password" element={<ResetPasswordPage />} />
            <Route path="/app/onboarding" element={<Navigate to="/app/control-center" replace />} />
            <Route
              path="/app/keys"
              element={
                <AuthRequired>
                  <KeysPage />
                </AuthRequired>
              }
            />
            <Route
              path="/app/playground"
              element={
                <AuthRequired>
                  <PlaygroundPage />
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
            <Route path="*" element={<SmartRedirect hasAccount={hasAccount} hasVerifiedAndLoggedIn={hasVerifiedAndLoggedIn} hasKey={hasKey} hasMcpSuccess={hasMcpSuccess} hasProtocolMismatch={hasProtocolMismatch} />} />
          </Routes>
        </React.Suspense>
      </ErrorBoundary>
    </Shell>
  );
}

function SmartRedirect(props: { hasAccount: boolean; hasVerifiedAndLoggedIn: boolean; hasKey: boolean; hasMcpSuccess: boolean; hasProtocolMismatch: boolean }): React.JSX.Element {
  let target = '/app/signup';
  if (props.hasMcpSuccess) target = '/app/control-center';
  else if (props.hasProtocolMismatch) target = '/app/control-center';
  else if (props.hasKey) target = '/app/playground';
  else if (props.hasVerifiedAndLoggedIn) target = '/app/keys';
  else if (props.hasAccount) target = '/app/login';
  return <Navigate to={target} replace />;
}
