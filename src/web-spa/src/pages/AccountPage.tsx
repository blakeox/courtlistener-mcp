import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { getUsage, toErrorMessage } from '../lib/api';
import { useToken } from '../lib/token-context';
import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  Badge,
  Button,
  Card,
  DefinitionList,
  Eyebrow,
  InlineGroup,
  Panel,
  StatusBanner,
  formatDate,
} from '../components/ui';

export function AccountPage(): React.JSX.Element {
  useDocumentTitle('Session');
  const { session, loading, sessionReady, sessionError, refresh, logout } = useAuth();
  const { token, persisted, clear } = useToken();
  const { toast } = useToast();
  const hasServerSession = session?.authenticated === true;
  const hasToken = Boolean(token.trim());
  const usageQuery = useQuery({
    queryKey: ['usage-snapshot', hasServerSession],
    queryFn: getUsage,
    enabled: hasServerSession,
    retry: false,
  });
  const protocolQuery = useQuery({
    queryKey: ['account-mcp-runtime-readiness', token],
    queryFn: () => verifyMcpRuntimeReadiness(token),
    enabled: hasServerSession && hasToken,
    retry: false,
  });
  const expectedProtocolVersion = '2025-06-18';
  const protocolMismatch = Boolean(
    protocolQuery.data?.protocolVersion &&
    protocolQuery.data.protocolVersion !== expectedProtocolVersion,
  );
  const protocolMismatchMessage = protocolMismatch
    ? `Protocol mismatch: server advertised ${protocolQuery.data?.protocolVersion || 'unknown'}, expected ${expectedProtocolVersion}.`
    : '';

  const diagnostics: string[] = [];
  if (!loading && sessionReady && !sessionError) {
    if (hasToken && !hasServerSession) {
      diagnostics.push(
        'A local MCP credential is loaded, but the operator browser session is signed out. This credential is only for direct runtime probes.',
      );
    } else if (!hasToken && hasServerSession) {
      diagnostics.push(
        'Operator session is active. No local MCP credential is loaded, which is fine unless you need direct browser-side runtime probes.',
      );
    }
  }
  if (protocolQuery.data?.diagnostics?.length) {
    diagnostics.push(...protocolQuery.data.diagnostics.slice(0, 2));
  }
  const observabilityHints = [
    !persisted && hasToken
      ? 'Token is session-scoped and will clear when this browser session ends.'
      : '',
    protocolQuery.data?.sessionId ? `Protocol session active: ${protocolQuery.data.sessionId}` : '',
  ].filter(Boolean);
  const routeBreakdown = React.useMemo(
    () =>
      Object.entries(usageQuery.data?.byRoute ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    [usageQuery.data?.byRoute],
  );
  const sessionSummary =
    loading || !sessionReady
      ? 'Checking browser session'
      : hasServerSession
        ? 'Signed in'
        : 'Signed out';
  const credentialSummary = hasToken
    ? persisted
      ? 'Local credential saved'
      : 'Session credential loaded'
    : 'No local credential';
  const protocolSummary =
    !hasServerSession || !hasToken
      ? 'Runtime checks locked'
      : protocolQuery.isLoading
        ? 'Checking runtime'
        : protocolQuery.isError
          ? 'Runtime check failed'
          : protocolMismatch
            ? 'Protocol mismatch'
            : 'Runtime ready';
  const usageSummary = !hasServerSession
    ? 'Usage locked'
    : usageQuery.isLoading
      ? 'Loading usage'
      : usageQuery.isError
        ? 'Usage unavailable'
        : `${usageQuery.data?.dailyRequests ?? 0} requests today`;
  const lastSeenSummary = usageQuery.data?.lastSeenAt
    ? formatDate(usageQuery.data.lastSeenAt)
    : 'No recent activity';

  return (
    <div className="stack account-page">
      <Card tone="app-landing" className="account-hero-card">
        <div className="account-hero-layout">
          <div className="account-hero-copy">
            <Eyebrow className="landing-section-label">Operator session</Eyebrow>
            <h1 className="account-page-title">Session Control</h1>
            <p className="account-hero-text">
              Confirm browser session posture, inspect optional local MCP credentials, and verify
              runtime readiness before moving into research or diagnostics work.
            </p>
          </div>
          <div className="account-hero-summary">
            <Panel tone="app-landing" className="account-summary-panel">
              <span className="account-summary-label">Session</span>
              <strong>{sessionSummary}</strong>
              <p>
                {hasServerSession ? (session?.user?.id ?? 'Authenticated') : 'Sign in required'}
              </p>
            </Panel>
            <Panel tone="app-landing" className="account-summary-panel">
              <span className="account-summary-label">Credential</span>
              <strong>{credentialSummary}</strong>
              <p>
                {hasToken
                  ? persisted
                    ? 'Persisted for this browser'
                    : 'Clears after session'
                  : 'No local token loaded'}
              </p>
            </Panel>
            <Panel tone="app-landing" className="account-summary-panel">
              <span className="account-summary-label">Runtime</span>
              <strong>{protocolSummary}</strong>
              <p>
                {hasServerSession && hasToken
                  ? 'Live MCP readiness inspection enabled'
                  : 'Runtime checks require session and token'}
              </p>
            </Panel>
          </div>
        </div>
        <div className="stack">
          <InlineGroup>
            <Badge tone={hasServerSession ? 'ok' : 'neutral'}>{sessionSummary}</Badge>
            <Badge tone={hasToken ? 'ok' : 'neutral'}>{credentialSummary}</Badge>
            <Badge tone={protocolMismatch || protocolQuery.isError ? 'warn' : 'ok'}>
              {protocolSummary}
            </Badge>
            <Badge tone={usageQuery.isError ? 'warn' : 'ok'}>{usageSummary}</Badge>
          </InlineGroup>
          <InlineGroup className="account-action-row">
            <Button variant="secondary" onClick={() => refresh()} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh session'}
            </Button>
            {hasServerSession && hasToken ? (
              <Button
                variant="secondary"
                onClick={() => protocolQuery.refetch()}
                disabled={protocolQuery.isFetching}
              >
                {protocolQuery.isFetching ? 'Checking protocol...' : 'Re-check protocol'}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => {
                clear();
                toast('Token cleared', 'info');
              }}
            >
              Clear local credential
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await logout();
                } catch {
                  toast('Logout failed — session is still active.', 'error');
                }
              }}
            >
              Logout
            </Button>
          </InlineGroup>
        </div>
      </Card>

      <div className="two-col account-layout">
        <div className="stack">
          <Card
            title="Session posture"
            subtitle="Server session state and local credential storage in one operator view."
            tone="app-landing"
          >
            <DefinitionList
              entries={[
                {
                  term: 'Session check',
                  description:
                    loading || !sessionReady
                      ? '… Checking /api/session'
                      : sessionError
                        ? '⚠ Failed'
                        : '✓ Ready',
                },
                {
                  term: 'Authenticated',
                  description: hasServerSession ? 'yes (server)' : 'no (server)',
                },
                {
                  term: 'User ID',
                  description: session?.user?.id ?? 'n/a',
                  descriptionClassName: 'mono',
                },
                {
                  term: 'Token storage mode',
                  description: hasToken ? (persisted ? 'localStorage' : 'sessionStorage') : 'none',
                },
              ]}
            />
            <StatusBanner
              role="alert"
              message={sessionError}
              type="error"
              className="account-status-banner"
            />
          </Card>

          <Card
            title="Runtime posture"
            subtitle="Protocol readiness, surface discovery, and live session diagnostics."
            tone="app-landing"
          >
            <DefinitionList
              entries={[
                {
                  term: 'MCP protocol',
                  description:
                    !hasServerSession || !hasToken
                      ? '—'
                      : protocolQuery.isLoading
                        ? '… Checking protocol surface'
                        : protocolQuery.isError
                          ? '⚠ Protocol check failed'
                          : protocolMismatch
                            ? `⚠ Protocol mismatch (${protocolQuery.data?.protocolVersion || 'unknown'})`
                            : `✓ ${protocolQuery.data?.protocolVersion || 'ready'}`,
                },
                {
                  term: 'Surfaces discovered',
                  description:
                    !hasServerSession || !hasToken
                      ? '—'
                      : protocolQuery.isLoading
                        ? '…'
                        : protocolQuery.isError
                          ? '⚠ unavailable'
                          : protocolMismatch
                            ? '⚠ blocked by protocol mismatch'
                            : `${protocolQuery.data?.toolCount ?? 0} tools · ${protocolQuery.data?.resourceCount ?? 0} resources · ${
                                protocolQuery.data?.promptCount ?? 0
                              } prompts`,
                },
                {
                  term: 'Runtime summary',
                  description: protocolSummary,
                },
                {
                  term: 'Last session seen',
                  description: protocolQuery.data?.sessionId ?? 'n/a',
                  descriptionClassName: protocolQuery.data?.sessionId ? 'mono' : undefined,
                },
              ]}
            />
            <StatusBanner
              role="alert"
              message={protocolMismatchMessage}
              type="error"
              className="account-status-banner"
            />
            <StatusBanner
              role="alert"
              message={protocolQuery.isError ? toErrorMessage(protocolQuery.error) : ''}
              type="error"
              className="account-status-banner"
            />
            <InlineGroup>
              {(protocolQuery.data?.guardrails ?? []).slice(0, 3).map((guardrail) => (
                <Badge key={guardrail} tone="warn">
                  {guardrail}
                </Badge>
              ))}
              {observabilityHints.map((hint) => (
                <Badge key={hint} tone="ok">
                  {hint}
                </Badge>
              ))}
            </InlineGroup>
          </Card>
        </div>

        <div className="stack">
          <Card
            title="Usage mirror"
            subtitle="Operator-facing mirror of OAuth-routed MCP traffic."
            tone="app-landing"
          >
            {!hasServerSession ? (
              <p className="muted">Sign in to view usage metrics.</p>
            ) : usageQuery.isLoading ? (
              <p className="muted">Loading usage metrics...</p>
            ) : usageQuery.isError ? (
              <StatusBanner role="alert" message={toErrorMessage(usageQuery.error)} type="error" />
            ) : (
              <DefinitionList
                entries={[
                  {
                    term: 'User ID',
                    description: usageQuery.data?.userId || 'n/a',
                    descriptionClassName: 'mono',
                  },
                  { term: 'Total requests', description: usageQuery.data?.totalRequests ?? 0 },
                  { term: 'Today', description: usageQuery.data?.dailyRequests ?? 0 },
                  { term: 'Current day', description: usageQuery.data?.currentDay || 'n/a' },
                  { term: 'Last seen', description: lastSeenSummary },
                ]}
              />
            )}
          </Card>

          <Card
            title="Diagnostics"
            subtitle="Secondary signals and route-level activity remain visible for operator review."
            tone="app-landing"
          >
            {diagnostics.map((message) => (
              <StatusBanner
                key={message}
                message={message}
                type="info"
                className="account-status-banner"
              />
            ))}
            <div className="stack">
              <strong>Top routes</strong>
              {!hasServerSession ? (
                <p className="muted">Sign in to view routed usage.</p>
              ) : usageQuery.isLoading ? (
                <p className="muted">Loading route activity...</p>
              ) : usageQuery.isError ? (
                <p className="muted">Usage route activity unavailable.</p>
              ) : routeBreakdown.length === 0 ? (
                <p className="muted">No routed usage yet.</p>
              ) : (
                <ul className="ordered">
                  {routeBreakdown.map(([route, count]) => (
                    <li key={route}>
                      <span className="mono">{route}</span> — {count}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
