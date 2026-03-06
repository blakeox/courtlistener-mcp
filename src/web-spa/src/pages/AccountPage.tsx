import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { getUsage, toErrorMessage } from '../lib/api';
import { useToken } from '../lib/token-context';
import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Badge, Button, Card, StatusBanner, formatDate } from '../components/ui';

export function AccountPage(): React.JSX.Element {
  useDocumentTitle('Operator Session');
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
    protocolQuery.data?.protocolVersion
      && protocolQuery.data.protocolVersion !== expectedProtocolVersion,
  );
  const protocolMismatchMessage = protocolMismatch
    ? `Protocol mismatch: server advertised ${protocolQuery.data?.protocolVersion || 'unknown'}, expected ${expectedProtocolVersion}.`
    : '';

  const diagnostics: string[] = [];
  if (!loading && sessionReady && !sessionError) {
    if (hasToken && !hasServerSession) {
      diagnostics.push('A local MCP credential is loaded, but the operator browser session is signed out. This credential is only for direct runtime probes.');
    } else if (!hasToken && hasServerSession) {
      diagnostics.push('Operator session is active. No local MCP credential is loaded, which is fine unless you need direct browser-side runtime probes.');
    }
  }
  if (protocolQuery.data?.diagnostics?.length) {
    diagnostics.push(...protocolQuery.data.diagnostics.slice(0, 2));
  }
  const observabilityHints = [
    !persisted && hasToken ? 'Token is session-scoped and will clear when this browser session ends.' : '',
    protocolQuery.data?.sessionId ? `Protocol session active: ${protocolQuery.data.sessionId}` : '',
  ].filter(Boolean);
  const routeBreakdown = React.useMemo(
    () => Object.entries(usageQuery.data?.byRoute ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5),
    [usageQuery.data?.byRoute],
  );

  return (
    <div className="stack">
      <Card title="Operator Session" subtitle="Diagnostic view of server session state, optional local credential storage, and protocol posture.">
        <dl className="dl-grid">
          <dt>Session check</dt>
          <dd>{loading || !sessionReady ? '… Checking /api/session' : sessionError ? '⚠ Failed' : '✓ Ready'}</dd>
          <dt>Authenticated</dt>
          <dd>{hasServerSession ? 'yes (server)' : 'no (server)'}</dd>
          <dt>User ID</dt>
          <dd className="mono">{session?.user?.id ?? 'n/a'}</dd>
          <dt>Token storage mode</dt>
          <dd>{hasToken ? (persisted ? 'localStorage' : 'sessionStorage') : 'none'}</dd>
          <dt>MCP protocol</dt>
          <dd>
            {!hasServerSession || !hasToken
              ? '—'
              : protocolQuery.isLoading
                ? '… Checking protocol surface'
                : protocolQuery.isError
                  ? '⚠ Protocol check failed'
                  : protocolMismatch
                    ? `⚠ Protocol mismatch (${protocolQuery.data?.protocolVersion || 'unknown'})`
                  : `✓ ${protocolQuery.data?.protocolVersion || 'ready'}`}
          </dd>
          <dt>Surfaces discovered</dt>
          <dd>
            {!hasServerSession || !hasToken
              ? '—'
              : protocolQuery.isLoading
                ? '…'
                : protocolQuery.isError
                  ? '⚠ unavailable'
                  : protocolMismatch
                    ? '⚠ blocked by protocol mismatch'
                  : `${protocolQuery.data?.toolCount ?? 0} tools · ${protocolQuery.data?.resourceCount ?? 0} resources · ${protocolQuery.data?.promptCount ?? 0} prompts`}
          </dd>
        </dl>
        <StatusBanner role="alert" message={sessionError} type="error" />
        <StatusBanner role="alert" message={protocolMismatchMessage} type="error" />
        {diagnostics.map((message) => (
          <StatusBanner key={message} message={message} type="info" />
        ))}
        <StatusBanner role="alert" message={protocolQuery.isError ? toErrorMessage(protocolQuery.error) : ''} type="error" />
        <div className="row">
          {(protocolQuery.data?.guardrails ?? []).slice(0, 3).map((guardrail) => (
            <Badge key={guardrail} tone="warn">{guardrail}</Badge>
          ))}
          {observabilityHints.map((hint) => (
            <Badge key={hint} tone="ok">{hint}</Badge>
          ))}
        </div>
        <div className="row">
          <Button
            variant="secondary"
            onClick={() => refresh()}
            disabled={loading}
          >
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
                toast('Logout failed — local state cleared.', 'error');
              }
            }}
          >
            Logout
          </Button>
        </div>
      </Card>

      <Card title="Usage mirror" subtitle="Operator-facing mirror of per-user usage for OAuth-routed MCP requests. Public users should rely on the auth UI dashboard.">
        {!hasServerSession ? (
          <p className="muted">Sign in to view usage metrics.</p>
        ) : usageQuery.isLoading ? (
          <p className="muted">Loading usage metrics...</p>
        ) : usageQuery.isError ? (
          <StatusBanner role="alert" message={toErrorMessage(usageQuery.error)} type="error" />
        ) : (
          <>
            <dl className="dl-grid">
              <dt>User ID</dt>
              <dd className="mono">{usageQuery.data?.userId || 'n/a'}</dd>
              <dt>Total requests</dt>
              <dd>{usageQuery.data?.totalRequests ?? 0}</dd>
              <dt>Today</dt>
              <dd>{usageQuery.data?.dailyRequests ?? 0}</dd>
              <dt>Current day</dt>
              <dd>{usageQuery.data?.currentDay || 'n/a'}</dd>
              <dt>Last seen</dt>
              <dd>{usageQuery.data?.lastSeenAt ? formatDate(usageQuery.data.lastSeenAt) : 'n/a'}</dd>
            </dl>
            <div className="stack">
              <strong>Top routes</strong>
              {routeBreakdown.length === 0 ? (
                <p className="muted">No routed usage yet.</p>
              ) : (
                <ul className="ordered">
                  {routeBreakdown.map(([route, count]) => (
                    <li key={route}><span className="mono">{route}</span> — {count}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
