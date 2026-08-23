import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shell } from './components/Shell';
import { ErrorBoundary } from './components/ErrorBoundary';

import { OnboardingPage } from './pages/OnboardingPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { AccountPage } from './pages/AccountPage';
import { HostedAuthRedirectPage } from './pages/HostedAuthRedirectPage';
import { LandingPage } from './pages/LandingPage';
import { WorkspaceDashboardPage } from './pages/WorkspaceDashboardPage';
import { UsagePage } from './pages/UsagePage';
import { ObservabilityPage } from './pages/ObservabilityPage';
import { useAuth } from './lib/auth';
import { TokenProvider, useToken } from './lib/token-context';
import { ToastProvider } from './components/Toast';
import { verifyMcpRuntimeReadiness } from './lib/mcp-runtime-readiness';
import { LoadingState } from './components/ui';

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
  const { session, loading: sessionLoading, sessionReady } = useAuth();
  const { token } = useToken();
  const location = useLocation();
  const isAppRoute = location.pathname === '/app' || location.pathname.startsWith('/app/');

  const hasVerifiedAndLoggedIn = Boolean(session?.authenticated);
  const hasToken = Boolean(token.trim());
  const expectedProtocolVersion = '2026-07-28';
  const mcpReadinessQuery = useQuery({
    queryKey: ['mcp-runtime-readiness', token],
    queryFn: () => verifyMcpRuntimeReadiness(token),
    enabled: hasToken,
    retry: false,
  });
  const hasProtocolMismatch = Boolean(
    mcpReadinessQuery.data?.protocolVersion &&
    mcpReadinessQuery.data.protocolVersion !== expectedProtocolVersion,
  );
  const hasMcpSuccess = Boolean(mcpReadinessQuery.data?.ready) && !hasProtocolMismatch;
  const smartRedirectElement =
    sessionLoading || !sessionReady ? (
      <LoadingState label="Loading page" />
    ) : (
      <SmartRedirect
        hasVerifiedAndLoggedIn={hasVerifiedAndLoggedIn}
        hasToken={hasToken}
        hasMcpSuccess={hasMcpSuccess}
        hasProtocolMismatch={hasProtocolMismatch}
      />
    );

  if (!isAppRoute) {
    return (
      <ErrorBoundary>
        <React.Suspense fallback={<LoadingState label="Loading page" />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/get-started" element={<LandingPage initialSectionId="setup" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <Shell>
      <ErrorBoundary>
        <React.Suspense fallback={<LoadingState label="Loading page" />}>
          <Routes>
            <Route path="/app" element={<WorkspaceDashboardPage />} />
            <Route path="/app/signup" element={<HostedAuthRedirectPage />} />
            <Route path="/app/login" element={<HostedAuthRedirectPage />} />
            <Route path="/app/reset-password" element={<HostedAuthRedirectPage />} />
            <Route path="/app/playground" element={<PlaygroundPage />} />
            <Route path="/app/usage" element={<UsagePage />} />
            <Route path="/app/observability" element={<ObservabilityPage />} />
            <Route path="/app/diagnostics" element={<OnboardingPage />} />
            <Route path="/app/account" element={<AccountPage />} />
            <Route path="*" element={smartRedirectElement} />
          </Routes>
        </React.Suspense>
      </ErrorBoundary>
    </Shell>
  );
}

function SmartRedirect(props: {
  hasVerifiedAndLoggedIn: boolean;
  hasToken: boolean;
  hasMcpSuccess: boolean;
  hasProtocolMismatch: boolean;
}): React.JSX.Element {
  let target = '/app';
  if (props.hasMcpSuccess) target = '/app';
  else if (props.hasProtocolMismatch) target = '/app';
  else if (props.hasToken) target = '/app/playground';
  else if (props.hasVerifiedAndLoggedIn) target = '/app/account';
  return <Navigate to={target} replace />;
}
