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
import { WorkspaceSectionPage } from './pages/WorkspaceSectionPage';
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
  const expectedProtocolVersion = '2025-06-18';
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
            <Route path="/account" element={<Navigate to="/app/session" replace />} />
            <Route path="/download" element={<Navigate to="/app/download" replace />} />
            <Route path="/connect" element={<Navigate to="/app/connect" replace />} />
            <Route path="/playground" element={<Navigate to="/app/playground" replace />} />
            <Route path="/tools" element={<Navigate to="/app/tools" replace />} />
            <Route path="/workflows" element={<Navigate to="/app/workflows" replace />} />
            <Route path="/sessions" element={<Navigate to="/app/sessions" replace />} />
            <Route path="/review" element={<Navigate to="/app/review" replace />} />
            <Route path="/observability" element={<Navigate to="/app/observability" replace />} />
            <Route path="/usage" element={<Navigate to="/app/usage" replace />} />
            <Route path="/diagnostics" element={<Navigate to="/app/diagnostics" replace />} />
            <Route path="/readiness" element={<Navigate to="/app/readiness" replace />} />
            <Route path="/credentials" element={<Navigate to="/app/credentials" replace />} />
            <Route path="/session" element={<Navigate to="/app/session" replace />} />
            <Route path="/docs" element={<Navigate to="/app/docs" replace />} />
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
            <Route path="/app/control-center" element={<WorkspaceDashboardPage />} />
            <Route path="/app/signup" element={<HostedAuthRedirectPage />} />
            <Route path="/app/login" element={<HostedAuthRedirectPage />} />
            <Route path="/app/reset-password" element={<HostedAuthRedirectPage />} />
            <Route path="/app/onboarding" element={<Navigate to="/app" replace />} />
            <Route path="/app/download" element={<WorkspaceSectionPage sectionKey="download" />} />
            <Route path="/app/connect" element={<WorkspaceSectionPage sectionKey="connect" />} />
            <Route path="/app/playground" element={<PlaygroundPage />} />
            <Route path="/app/sessions" element={<WorkspaceSectionPage sectionKey="sessions" />} />
            <Route
              path="/app/workflows"
              element={<WorkspaceSectionPage sectionKey="workflows" />}
            />
            <Route path="/app/tools" element={<WorkspaceSectionPage sectionKey="tools" />} />
            <Route path="/app/review" element={<WorkspaceSectionPage sectionKey="review" />} />
            <Route path="/app/usage" element={<WorkspaceSectionPage sectionKey="usage" />} />
            <Route
              path="/app/observability"
              element={<WorkspaceSectionPage sectionKey="observability" />}
            />
            <Route path="/app/diagnostics" element={<OnboardingPage />} />
            <Route
              path="/app/readiness"
              element={<WorkspaceSectionPage sectionKey="readiness" />}
            />
            <Route
              path="/app/credentials"
              element={<WorkspaceSectionPage sectionKey="credentials" />}
            />
            <Route path="/app/session" element={<AccountPage />} />
            <Route path="/app/account" element={<AccountPage />} />
            <Route path="/app/keys" element={<Navigate to="/app/credentials" replace />} />
            <Route path="/app/docs" element={<WorkspaceSectionPage sectionKey="docs" />} />
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
  else if (props.hasProtocolMismatch) target = '/app/control-center';
  else if (props.hasToken) target = '/app/playground';
  else if (props.hasVerifiedAndLoggedIn) target = '/app/session';
  return <Navigate to={target} replace />;
}
