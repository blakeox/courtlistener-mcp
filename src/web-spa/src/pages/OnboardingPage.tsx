import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listKeys, toErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToken } from '../lib/token-context';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../components/Toast';
import { Button, Card, StatusBanner } from '../components/ui';

export function OnboardingPage(): React.JSX.Element {
  useDocumentTitle('Dashboard');
  const { session } = useAuth();
  const { token } = useToken();
  const keyQuery = useQuery({
    queryKey: ['keys', 'onboarding'],
    queryFn: () => listKeys(token || undefined),
    enabled: Boolean(session?.authenticated),
  });

  const authed = Boolean(session?.authenticated);
  const hasKeys = (keyQuery.data?.keys.length ?? 0) > 0;
  const hasToken = Boolean(token.trim());
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
          <dd>{authed ? '✓ Logged in' : '✗ Not logged in'}</dd>
          <dt>API Keys</dt>
          <dd>{authed ? (hasKeys ? `✓ ${keyQuery.data?.keys.length} key(s)` : '✗ No keys yet') : '—'}</dd>
          <dt>Bearer Token</dt>
          <dd>{hasToken ? '✓ Token loaded' : '✗ Not set'}</dd>
        </dl>
      </Card>

      {!authed ? (
        <Card title="Get started">
          <p>Create an account and verify your email to begin.</p>
          <div className="row">
            <Link to="/app/signup" className="btn">Create Account</Link>
            <Link to="/app/login" className="btn secondary">Login</Link>
          </div>
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
      ) : (
        <Card title="Ready to go!">
          <p>Your setup is complete. Try the Playground to make your first MCP tool call.</p>
          <div className="row">
            <Link to="/app/playground" className="btn">Open Playground</Link>
            <Link to="/app/keys" className="btn secondary">Manage Keys</Link>
            <Button variant="secondary" onClick={copyConfig}>
              📋 Copy MCP config
            </Button>
          </div>
        </Card>
      )}

      {keyQuery.isError ? (
        <div>
          <StatusBanner role="alert" message={toErrorMessage(keyQuery.error)} type="error" />
          <Button variant="secondary" onClick={() => keyQuery.refetch()} disabled={keyQuery.isFetching}>
            {keyQuery.isFetching ? 'Retrying...' : 'Retry'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
