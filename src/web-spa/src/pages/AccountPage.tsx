import React from 'react';
import { useAuth } from '../lib/auth';
import { useToken } from '../lib/token-context';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button, Card, StatusBanner } from '../components/ui';

export function AccountPage(): React.JSX.Element {
  useDocumentTitle('Account');
  const { session, loading, sessionReady, sessionError, refresh, logout } = useAuth();
  const { token, persisted, clear } = useToken();
  const { toast } = useToast();
  const hasServerSession = session?.authenticated === true;
  const hasToken = Boolean(token.trim());

  let diagnostics = '';
  if (!loading && sessionReady && !sessionError) {
    if (hasToken && !hasServerSession) {
      diagnostics = 'Local bearer token is set, but the server session is signed out. Log in again to sync account state.';
    } else if (!hasToken && hasServerSession) {
      diagnostics = 'Server session is active, but no bearer token is saved locally. Add one in API Keys before MCP calls.';
    }
  }

  return (
    <div className="stack">
      <Card title="Account" subtitle="Session and local token storage details.">
        <dl className="dl-grid">
          <dt>Session check</dt>
          <dd>{loading || !sessionReady ? '… Checking /api/session' : sessionError ? '⚠ Failed' : '✓ Ready'}</dd>
          <dt>Authenticated</dt>
          <dd>{hasServerSession ? 'yes (server)' : 'no (server)'}</dd>
          <dt>User ID</dt>
          <dd className="mono">{session?.user?.id ?? 'n/a'}</dd>
          <dt>Token storage mode</dt>
          <dd>{hasToken ? (persisted ? 'localStorage' : 'sessionStorage') : 'none'}</dd>
        </dl>
        <StatusBanner role="alert" message={sessionError} type="error" />
        <StatusBanner message={diagnostics} type="info" />
        <div className="row">
          <Button
            variant="secondary"
            onClick={() => refresh()}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh session'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              clear();
              toast('Token cleared', 'info');
            }}
          >
            Clear stored token
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
    </div>
  );
}
