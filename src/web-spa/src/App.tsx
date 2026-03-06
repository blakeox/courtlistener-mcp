import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shell } from './components/Shell';
import { ErrorBoundary } from './components/ErrorBoundary';

import { OnboardingPage } from './pages/OnboardingPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { AccountPage } from './pages/AccountPage';
import { useAuth } from './lib/auth';
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

  const hasVerifiedAndLoggedIn = Boolean(session?.authenticated);
  const hasToken = Boolean(token.trim());
  const expectedProtocolVersion = '2025-06-18';
  const mcpReadinessQuery = useQuery({
    queryKey: ['mcp-runtime-readiness', token],
    queryFn: () => verifyMcpRuntimeReadiness(token),
    enabled: hasToken,
    retry: false,
  });
  const hasProtocolMismatch = Boolean(
    mcpReadinessQuery.data?.protocolVersion
      && mcpReadinessQuery.data.protocolVersion !== expectedProtocolVersion,
  );
  const hasMcpSuccess = Boolean(mcpReadinessQuery.data?.ready) && !hasProtocolMismatch;
  const isPath = (paths: string[]): boolean => paths.includes(location.pathname);

  const steps = [
    {
      label: 'Operator session',
      complete: hasVerifiedAndLoggedIn,
      active: isPath(['/app/account']),
      to: '/app/account',
    },
    {
      label: 'Local MCP credential loaded',
      complete: hasToken,
      active: isPath(['/app/control-center']),
      to: '/app/control-center',
    },
    {
      label: 'Runtime ready',
      complete: hasMcpSuccess,
      active: isPath(['/app/playground', '/app/control-center', '/app']),
      to: '/app/playground',
      disabled: !hasToken,
    },
  ];

  return (
    <Shell steps={steps}>
      <ErrorBoundary>
        <React.Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/app" element={<Navigate to="/app/control-center" replace />} />
            <Route path="/app/control-center" element={<OnboardingPage />} />
            <Route path="/app/signup" element={<Navigate to="/app/control-center" replace />} />
            <Route path="/app/login" element={<Navigate to="/app/control-center" replace />} />
            <Route path="/app/reset-password" element={<Navigate to="/app/control-center" replace />} />
            <Route path="/app/onboarding" element={<Navigate to="/app/control-center" replace />} />
            <Route path="/app/keys" element={<Navigate to="/app/control-center" replace />} />
            <Route path="/app/playground" element={<PlaygroundPage />} />
            <Route path="/app/account" element={<AccountPage />} />
            <Route path="*" element={<SmartRedirect hasVerifiedAndLoggedIn={hasVerifiedAndLoggedIn} hasToken={hasToken} hasMcpSuccess={hasMcpSuccess} hasProtocolMismatch={hasProtocolMismatch} />} />
          </Routes>
        </React.Suspense>
      </ErrorBoundary>
    </Shell>
  );
}

function SmartRedirect(props: { hasVerifiedAndLoggedIn: boolean; hasToken: boolean; hasMcpSuccess: boolean; hasProtocolMismatch: boolean }): React.JSX.Element {
  let target = '/app/control-center';
  if (props.hasMcpSuccess) target = '/app/control-center';
  else if (props.hasProtocolMismatch) target = '/app/control-center';
  else if (props.hasToken) target = '/app/playground';
  else if (props.hasVerifiedAndLoggedIn) target = '/app/account';
  return <Navigate to={target} replace />;
}
