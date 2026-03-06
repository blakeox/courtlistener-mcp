import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToken } from '../lib/token-context';
import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, StatusBanner } from '../components/ui';

function LoadingSkeleton(props: { label: string; message: string }): React.JSX.Element {
  return (
    <div className="loading" role="status" aria-busy="true" aria-label={props.label}>
      <p className="muted">{props.message}</p>
      <div className="skeleton skeleton-line"></div>
      <div className="skeleton skeleton-line short"></div>
    </div>
  );
}

export function OnboardingPage(): React.JSX.Element {
  useDocumentTitle('Operator Console');
  const { session, loading: sessionLoading, sessionReady, sessionError, refresh } = useAuth();
  const { token, clear } = useToken();
  const { toast } = useToast();
  const authUiOrigin = 'https://auth.courtlistenermcp.blakeoxford.com';

  const authed = session?.authenticated === true;
  const hasToken = Boolean(token.trim());
  const sessionChecking = sessionLoading || !sessionReady;

  const expectedProtocolVersion = '2025-06-18';
  const mcpReadinessQuery = useQuery({
    queryKey: ['mcp-runtime-readiness', token],
    queryFn: () => verifyMcpRuntimeReadiness(token),
    enabled: hasToken,
    retry: false,
  });

  const readiness = mcpReadinessQuery.data;
  const protocolMismatch = Boolean(
    readiness?.protocolVersion && readiness.protocolVersion !== expectedProtocolVersion,
  );
  const protocolMismatchMessage = protocolMismatch
    ? `Protocol mismatch detected: server advertised ${readiness?.protocolVersion || 'unknown'}, expected ${expectedProtocolVersion}.`
    : '';

  const hasMcpSuccess = Boolean(readiness?.ready) && !protocolMismatch;
  const checklist = [
    {
      key: 'session',
      label: 'Verify session status',
      done: authed,
      href: '/app/account',
      action: 'Open account page',
    },
    {
      key: 'token',
      label: 'Optional: load local MCP credential for direct probes',
      done: hasToken,
      href: '/app/account',
      action: 'Review local credential tools',
    },
    {
      key: 'runtime',
      label: 'Verify MCP protocol + tools',
      done: hasMcpSuccess,
      href: '/app/playground',
      action: 'Run MCP check',
    },
  ];

  const protocolStatus = !hasToken
    ? '… Awaiting local diagnostic credential'
    : mcpReadinessQuery.isLoading
      ? '… Negotiating MCP protocol'
      : mcpReadinessQuery.isError
        ? '⚠ MCP protocol unavailable'
        : protocolMismatch
          ? `⚠ Protocol mismatch (${readiness?.protocolVersion || 'unknown'})`
          : `✓ Connected (${readiness?.sessionId || 'session established'})`;

  const toolAvailabilityStatus = !hasToken
    ? '… Awaiting local diagnostic credential'
    : mcpReadinessQuery.isLoading
      ? '… Discovering tools'
      : mcpReadinessQuery.isError
        ? '⚠ Tool discovery unavailable'
        : protocolMismatch
          ? '⚠ Blocked by protocol mismatch'
          : `${readiness?.toolCount ?? 0} tool(s) available`;

  return (
    <div className="stack">
      <Card title="Operator Console" subtitle="Diagnostics for session state, local credential posture, protocol negotiation, and runtime readiness.">
        <p className="muted">
          Public user sign-in, browser-session bootstrap, and account usage now live in the separate auth UI.
          Use this console for MCP diagnostics and runtime checks. ChatGPT and Codex should authenticate through OAuth, not through a manually loaded browser token.
          {' '}
          <a href={authUiOrigin} target="_blank" rel="noreferrer">Open auth UI</a>.
        </p>
        <dl className="dl-grid">
          <dt>Session</dt>
          <dd>{sessionChecking ? '… Checking server session' : sessionError ? '⚠ Session check failed' : '✓ Session endpoint reachable'}</dd>
          <dt>Auth</dt>
          <dd>{authed ? '✓ Operator session active' : '⚠ No operator session'}</dd>
          <dt>Local MCP credential</dt>
          <dd>{hasToken ? '✓ Loaded for direct runtime probes' : '— Not loaded (OAuth remains primary path)'}</dd>
          <dt>Protocol</dt>
          <dd>{protocolStatus}</dd>
          <dt>Tool availability</dt>
          <dd>{toolAvailabilityStatus}</dd>
          <dt>MCP Runtime</dt>
          <dd>{hasMcpSuccess ? '✓ Ready' : '… Pending readiness checks'}</dd>
        </dl>
      </Card>

      <StatusBanner role="alert" message={sessionError} type="error" />
      <StatusBanner role="alert" message={protocolMismatchMessage} type="error" />

      <Card title="Operator checklist" subtitle="Move each runtime signal into a healthy state before deeper troubleshooting.">
        <ol className="checklist">
          {checklist.map((item) => (
            <li key={item.key} className={item.done ? 'done' : ''}>
              <strong>{item.done ? '✓' : '○'} {item.label}</strong>
              {item.done ? <span className="chip active">Done</span> : <Link to={item.href} className="btn secondary">{item.action}</Link>}
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Protocol + capability explorer" subtitle="Live metadata from initialize + tools/resources/prompts discovery.">
        {!hasToken ? (
          <p className="muted">Load a local MCP credential only if you need direct browser-side protocol probing. Public client access should use OAuth.</p>
        ) : mcpReadinessQuery.isLoading ? (
          <LoadingSkeleton label="Discovering protocol metadata" message="Discovering protocol capabilities and surfaces..." />
        ) : mcpReadinessQuery.isError ? (
          <StatusBanner role="alert" message={toErrorMessage(mcpReadinessQuery.error)} type="error" />
        ) : (
          <>
            <dl className="dl-grid">
              <dt>Protocol version</dt>
              <dd>{readiness?.protocolVersion || 'unknown'}</dd>
              <dt>Server</dt>
              <dd>{readiness?.serverName || 'unknown'} <span className="mono">{readiness?.serverVersion || 'unknown'}</span></dd>
              <dt>Session id</dt>
              <dd className="mono">{readiness?.sessionId || 'none returned'}</dd>
              <dt>Catalog counts</dt>
              <dd>{readiness?.toolCount ?? 0} tools · {readiness?.resourceCount ?? 0} resources · {readiness?.promptCount ?? 0} prompts</dd>
              <dt>Tool categories</dt>
              <dd>{(readiness?.toolCategories.length ?? 0) > 0 ? readiness?.toolCategories.join(', ') : 'none advertised'}</dd>
              <dt>Capabilities</dt>
              <dd className="row">
                {(readiness?.capabilities ?? []).length > 0
                  ? readiness?.capabilities?.map((capability) => <Badge key={capability}>{capability}</Badge>)
                  : 'none advertised'}
              </dd>
            </dl>
          </>
        )}
      </Card>

      <Card title="Quick actions" subtitle="Shortcuts for operator workflow and runtime checks.">
        <div className="row">
          <Link to="/app/account" className="btn secondary">Open operator session</Link>
          <Link to="/app/playground" className="btn">Open playground</Link>
          <a href={authUiOrigin} target="_blank" rel="noreferrer" className="btn secondary">Open auth UI</a>
          <Button variant="secondary" onClick={() => refresh()} disabled={sessionLoading}>
            {sessionLoading ? 'Refreshing...' : 'Refresh session'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              clear();
              toast('Stored local credential cleared', 'info');
            }}
          >
            Clear local credential
          </Button>
        </div>
      </Card>
    </div>
  );
}
