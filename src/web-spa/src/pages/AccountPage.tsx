import React from 'react';
import { useAuth } from '../lib/auth';
import { Button, Card } from '../components/ui';
import { readToken, isPersistedToken, clearToken } from '../lib/storage';

export function AccountPage(): React.JSX.Element {
  const { session, logout } = useAuth();
  const [tokenSummary, setTokenSummary] = React.useState('none');

  React.useEffect(() => {
    const token = readToken();
    if (!token) {
      setTokenSummary('none');
      return;
    }
    setTokenSummary(isPersistedToken() ? 'localStorage' : 'sessionStorage');
  }, []);

  return (
    <div className="stack">
      <Card title="Account" subtitle="Session and local token storage details.">
        <dl className="dl-grid">
          <dt>Authenticated</dt>
          <dd>{session?.authenticated ? 'yes' : 'no'}</dd>
          <dt>User ID</dt>
          <dd className="mono">{session?.user?.id ?? 'n/a'}</dd>
          <dt>Token storage mode</dt>
          <dd>{tokenSummary}</dd>
        </dl>
        <div className="row">
          <Button
            variant="secondary"
            onClick={() => {
              clearToken();
              setTokenSummary('none');
            }}
          >
            Clear stored token
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await logout();
            }}
          >
            Logout
          </Button>
        </div>
      </Card>
    </div>
  );
}
