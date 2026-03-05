import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listKeys, toErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { keysQueryKey } from '../lib/query-keys';
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
  useDocumentTitle('Control Center');
  const { session, loading: sessionLoading, sessionReady, sessionError, refresh } = useAuth();
  const { token, clear } = useToken();
  const authed = session?.authenticated === true;
  const sessionChecking = sessionLoading || !sessionReady;
  const keyQuery = useQuery({
    queryKey: keysQueryKey,
    queryFn: () => listKeys(token || undefined),
    enabled: sessionReady && authed,
  });

  const hasKeys = (keyQuery.data?.keys.length ?? 0) > 0;
  const keysLoading = authed && keyQuery.isLoading;
  const hasToken = Boolean(token.trim());
  const mcpReadinessQuery = useQuery({
    queryKey: ['mcp-runtime-readiness', token],
    queryFn: () => verifyMcpRuntimeReadiness(token),
    enabled: authed && hasKeys && hasToken,
    retry: false,
  });
  const { toast } = useToast();
  const readiness = mcpReadinessQuery.data;
  const expectedProtocolVersion = '2025-06-18';
  const protocolMismatch = Boolean(
    readiness?.protocolVersion
      && readiness.protocolVersion !== expectedProtocolVersion,
  );
  const protocolMismatchMessage = protocolMismatch
    ? `Protocol mismatch detected: server advertised ${readiness?.protocolVersion || 'unknown'}, expected ${expectedProtocolVersion}. Refresh session and retry runtime checks.`
    : '';
  const hasMcpSuccess = Boolean(readiness?.ready) && !protocolMismatch;
  const sessionTokenMismatch = !sessionChecking && !sessionError && hasToken && !authed;
  const guardrailIndicators = readiness?.guardrails ?? [];
  const readinessDiagnostics = readiness?.diagnostics ?? [];
  const capabilityBadges = readiness?.capabilities ?? [];
  const protocolStatus = !authed || sessionChecking || sessionError || !hasKeys || !hasToken
    ? '—'
    : mcpReadinessQuery.isLoading
      ? '… Negotiating MCP protocol'
      : mcpReadinessQuery.isError
        ? '⚠ MCP protocol unavailable'
        : protocolMismatch
          ? `⚠ Protocol mismatch (${readiness?.protocolVersion || 'unknown'})`
        : `✓ Connected (${mcpReadinessQuery.data.sessionId || 'session established'})`;
  const toolAvailabilityStatus = !authed || sessionChecking || sessionError || !hasKeys || !hasToken
    ? '—'
    : mcpReadinessQuery.isLoading
      ? '… Discovering tools'
      : mcpReadinessQuery.isError
        ? '⚠ Tool discovery unavailable'
        : protocolMismatch
          ? '⚠ Blocked by protocol mismatch'
        : mcpReadinessQuery.data.toolCount > 0
          ? `✓ ${mcpReadinessQuery.data.toolCount} tool(s) available`
          : '⚠ No tools available';
  const checklist = [
    { key: 'account', label: 'Authenticate your session', done: authed, href: '/app/login', action: 'Open login' },
    { key: 'keys', label: 'Confirm MCP key availability', done: hasKeys, href: '/app/keys', action: 'Open MCP Keys' },
    { key: 'token', label: 'Load bearer token in this browser', done: hasToken, href: '/app/keys', action: 'Set token' },
    { key: 'runtime', label: 'Verify MCP protocol + tools', done: hasMcpSuccess, href: '/app/playground', action: 'Run MCP check' },
  ];

  async function copyConfig(): Promise<void> {
    const config = {
      mcpServers: {
        courtlistener: {
          url: `${window.location.origin}/mcp`,
          headers: {
            Authorization: `Bearer ${token || 'YOUR_API_KEY_HERE'}`,
          },
        },
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      toast('MCP config copied to clipboard', 'ok');
    } catch {
      toast('Clipboard not available — copy manually', 'error');
    }
  }

  return (
    <div className="stack">
      <Card title="Control Center" subtitle="Live MCP posture across session, auth, protocol, and tool availability.">
        <dl className="dl-grid">
          <dt>Session</dt>
          <dd>
            {sessionChecking
              ? '… Checking server session'
              : sessionError
                ? '⚠ Session check failed'
                : '✓ Session endpoint reachable'}
          </dd>
          <dt>Auth</dt>
          <dd>{authed ? '✓ Authenticated' : '✗ Not authenticated'}</dd>
          <dt>MCP Keys</dt>
          <dd>
            {!authed || sessionChecking || sessionError
              ? '—'
              : keysLoading
                ? '… Checking server keys'
                : keyQuery.isError
                  ? '⚠ Unable to load keys'
                  : hasKeys
                    ? `✓ ${keyQuery.data?.keys.length} key(s)`
                    : '✗ No keys yet'}
          </dd>
          <dt>Bearer Token</dt>
          <dd>{hasToken ? '✓ Token loaded' : '✗ Not set'}</dd>
          <dt>Protocol</dt>
          <dd>{protocolStatus}</dd>
          <dt>Tool availability</dt>
          <dd>{toolAvailabilityStatus}</dd>
          <dt>MCP Runtime</dt>
          <dd>
            {!authed || sessionChecking || sessionError
              ? '—'
              : keysLoading
                ? '… Checking server keys'
                : keyQuery.isError
                  ? '⚠ Unable to load keys'
                  : hasKeys
                    ? hasToken
                      ? hasMcpSuccess
                        ? '✓ Ready'
                        : protocolMismatch
                          ? '⚠ Protocol mismatch'
                          : '… Pending protocol check'
                      : '⚠ Token required'
                    : '⚠ Key required'}
          </dd>
        </dl>
      </Card>
      <StatusBanner role="alert" message={protocolMismatchMessage} type="error" />
      {sessionTokenMismatch ? (
        <Card title="Session recovery">
          <StatusBanner
            role="alert"
            type="info"
            message="A bearer token is loaded locally, but this server session is signed out."
          />
          <div className="row">
            <Link to="/app/login" className="btn secondary">Log in again</Link>
            <Button
              variant="secondary"
              onClick={() => {
                clear();
                toast('Stored token cleared', 'info');
              }}
            >
              Clear stored token
            </Button>
          </div>
        </Card>
      ) : null}

      <Card title="MCP checklist" subtitle="Use this path to move each live MCP posture signal into a healthy state.">
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
        {!authed || sessionChecking || sessionError || !hasKeys || !hasToken ? (
          <p className="muted">Complete session auth, key, and token setup to inspect protocol metadata.</p>
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
                {capabilityBadges.length > 0 ? capabilityBadges.map((capability) => (
                  <Badge key={capability}>{capability}</Badge>
                )) : 'none advertised'}
              </dd>
            </dl>
            <div className="surface-grid">
              <details>
                <summary>Tools ({readiness?.toolCount ?? 0})</summary>
                <ul className="surface-list">
                  {(readiness?.tools ?? []).slice(0, 6).map((tool) => (
                    <li key={tool.name}>
                      <strong>{tool.name}</strong>
                      <span className="muted">{tool.description || 'No description provided.'}</span>
                      <div className="row">
                        <Badge>{tool.category}</Badge>
                        <Badge tone={tool.requiredArgs.length > 0 ? 'ok' : 'neutral'}>
                          required: {tool.requiredArgs.length}
                        </Badge>
                        <Badge tone={tool.constrainedArgs > 0 ? 'warn' : 'neutral'}>
                          constrained: {tool.constrainedArgs}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Resources ({readiness?.resourceCount ?? 0})</summary>
                <ul className="surface-list">
                  {(readiness?.resources ?? []).slice(0, 6).map((resource) => (
                    <li key={`${resource.uri}-${resource.name}`}>
                      <strong>{resource.name}</strong>
                      <span className="mono">{resource.uri}</span>
                      <span className="muted">{resource.description || 'No description provided.'}</span>
                    </li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Prompts ({readiness?.promptCount ?? 0})</summary>
                <ul className="surface-list">
                  {(readiness?.prompts ?? []).slice(0, 6).map((prompt) => (
                    <li key={prompt.name}>
                      <strong>{prompt.name}</strong>
                      <span className="muted">{prompt.description || 'No description provided.'}</span>
                      <Badge>arguments: {prompt.argumentCount}</Badge>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </>
        )}
      </Card>

      <Card title="Limits + guardrails" subtitle="Indicators inferred from negotiated capabilities and schema constraints.">
        {!authed || sessionChecking || sessionError || !hasKeys || !hasToken ? (
          <p className="muted">Guardrail indicators appear after protocol readiness checks complete.</p>
        ) : mcpReadinessQuery.isLoading ? (
          <LoadingSkeleton label="Analyzing protocol guardrails" message="Analyzing protocol guardrails..." />
        ) : mcpReadinessQuery.isError ? (
          <StatusBanner role="alert" message={toErrorMessage(mcpReadinessQuery.error)} type="error" />
        ) : (
          <>
            <ul className="signal-list">
              {guardrailIndicators.map((indicator) => (
                <li key={indicator}>
                  <Badge tone="warn">Guardrail</Badge>
                  <span>{indicator}</span>
                </li>
              ))}
            </ul>
            {readinessDiagnostics.map((message) => (
              <StatusBanner key={message} message={message} type="info" />
            ))}
          </>
        )}
      </Card>

      {sessionChecking ? (
        <Card title="Checking session">
          <LoadingSkeleton label="Checking session posture" message="Verifying your session posture with the server." />
        </Card>
      ) : sessionError ? (
        <Card title="Session status unavailable">
          <StatusBanner role="alert" message={sessionError} type="error" />
          <Button variant="secondary" onClick={() => refresh()} disabled={sessionLoading}>
            {sessionLoading ? 'Retrying...' : 'Retry session check'}
          </Button>
        </Card>
      ) : !authed ? (
        <Card title="Get started">
          <p>Create an account and verify your email to begin.</p>
          <div className="row">
            <Link to="/app/signup" className="btn">Create Account</Link>
            <Link to="/app/login" className="btn secondary">Login</Link>
          </div>
        </Card>
      ) : keysLoading ? (
        <Card title="Checking API keys">
          <LoadingSkeleton label="Checking API keys" message="Loading your key inventory from the server." />
        </Card>
      ) : keyQuery.isError ? (
        <Card title="API key status unavailable">
          <StatusBanner role="alert" message={toErrorMessage(keyQuery.error)} type="error" />
          <Button variant="secondary" onClick={() => keyQuery.refetch()} disabled={keyQuery.isFetching}>
            {keyQuery.isFetching ? 'Retrying...' : 'Retry'}
          </Button>
        </Card>
      ) : !hasKeys ? (
        <Card title="Next step: Create an API key">
          <p>You need at least one API key to use the MCP tools.</p>
          <Link to="/app/keys" className="btn">Create API Key</Link>
        </Card>
      ) : !hasToken ? (
        <Card title="Next step: Set your bearer token">
          <p>Save one of your API key tokens to start making MCP calls.</p>
          <Link to="/app/keys" className="btn">Go to API Keys</Link>
        </Card>
      ) : mcpReadinessQuery.isLoading ? (
        <Card title="Checking MCP runtime">
          <LoadingSkeleton label="Checking MCP runtime" message="Verifying account session + key + MCP endpoint readiness." />
        </Card>
      ) : mcpReadinessQuery.isError ? (
        <Card title="Next step: Fix MCP runtime readiness">
          <StatusBanner role="alert" message={toErrorMessage(mcpReadinessQuery.error)} type="error" />
          <div className="row">
            <Button variant="secondary" onClick={() => mcpReadinessQuery.refetch()} disabled={mcpReadinessQuery.isFetching}>
              {mcpReadinessQuery.isFetching ? 'Retrying...' : 'Retry runtime check'}
            </Button>
            <Button variant="secondary" onClick={() => refresh()} disabled={sessionLoading}>
              {sessionLoading ? 'Refreshing session...' : 'Refresh session'}
            </Button>
            <Link to="/app/account" className="btn">Open Account diagnostics</Link>
          </div>
        </Card>
      ) : protocolMismatch ? (
        <Card title="Next step: Resolve protocol mismatch">
          <StatusBanner role="alert" message={protocolMismatchMessage} type="error" />
          <div className="row">
            <Button variant="secondary" onClick={() => mcpReadinessQuery.refetch()} disabled={mcpReadinessQuery.isFetching}>
              {mcpReadinessQuery.isFetching ? 'Re-checking...' : 'Re-check protocol'}
            </Button>
            <Button variant="secondary" onClick={() => refresh()} disabled={sessionLoading}>
              {sessionLoading ? 'Refreshing session...' : 'Refresh session'}
            </Button>
            <Link to="/app/account" className="btn">Open Account diagnostics</Link>
          </div>
        </Card>
      ) : (
        <Card title="Ready to go!">
          <p>Your account, key, token, and MCP runtime are verified. Start with a tool call in Playground.</p>
          <div className="row">
            <Link to="/app/playground" className="btn">Open MCP Playground</Link>
            <Link to="/app/keys" className="btn secondary">Manage MCP Keys</Link>
            <Button variant="secondary" onClick={copyConfig}>
              📋 Copy MCP config
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
