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
import { Button, Card, StatusBanner } from '../components/ui';

export function OnboardingPage(): React.JSX.Element {
  useDocumentTitle('Dashboard');
  const { session, loading: sessionLoading, sessionReady, sessionError, refresh } = useAuth();
  const { token } = useToken();
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
      <Card title="Dashboard" subtitle="Your CourtListener MCP setup at a glance.">
        <dl className="dl-grid">
          <dt>Account</dt>
          <dd>
            {sessionChecking
              ? '… Checking server session'
              : sessionError
                ? '⚠ Session check failed'
                : authed
                  ? '✓ Logged in (server)'
                  : '✗ Not logged in (server)'}
          </dd>
          <dt>API Keys</dt>
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
          <dt>MCP Runtime</dt>
          <dd>
            {!authed || sessionChecking || sessionError || !hasKeys || !hasToken
              ? '—'
              : mcpReadinessQuery.isLoading
                ? '… Verifying MCP runtime'
                : mcpReadinessQuery.isError
                  ? '⚠ MCP runtime check failed'
                  : `✓ Ready (${mcpReadinessQuery.data.toolCount} tool(s))`}
          </dd>
        </dl>
      </Card>

      {sessionChecking ? (
        <Card title="Checking session">
          <p>Verifying your account status with the server.</p>
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
          <p>Loading your key inventory from the server.</p>
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
          <p>Verifying account session + key + MCP endpoint readiness.</p>
        </Card>
      ) : mcpReadinessQuery.isError ? (
        <Card title="Next step: Fix MCP runtime readiness">
          <StatusBanner role="alert" message={toErrorMessage(mcpReadinessQuery.error)} type="error" />
          <div className="row">
            <Button variant="secondary" onClick={() => mcpReadinessQuery.refetch()} disabled={mcpReadinessQuery.isFetching}>
              {mcpReadinessQuery.isFetching ? 'Retrying...' : 'Retry runtime check'}
            </Button>
            <Link to="/app/playground" className="btn">Open Playground</Link>
          </div>
        </Card>
      ) : (
        <Card title="Ready to go!">
          <p>Your account, key, token, and MCP runtime are verified. Start with a tool call in Playground.</p>
          <div className="row">
            <Link to="/app/playground" className="btn">Open Playground</Link>
            <Link to="/app/keys" className="btn secondary">Manage Keys</Link>
            <Button variant="secondary" onClick={copyConfig}>
              📋 Copy MCP config
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
