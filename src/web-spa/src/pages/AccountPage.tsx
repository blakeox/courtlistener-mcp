import React from 'react';
import { useAuth } from '../lib/auth';
import { useToken } from '../lib/token-context';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button, Card } from '../components/ui';

export function AccountPage(): React.JSX.Element {
  useDocumentTitle('Account');
  const { session, logout } = useAuth();
  const { token, persisted, clear } = useToken();
  const { toast } = useToast();

  return (
    <div className="stack">
      <Card title="Account" subtitle="Session and local token storage details.">
        <dl className="dl-grid">
          <dt>Authenticated</dt>
          <dd>{session?.authenticated ? 'yes' : 'no'}</dd>
          <dt>User ID</dt>
          <dd className="mono">{session?.user?.id ?? 'n/a'}</dd>
          <dt>Token storage mode</dt>
          <dd>{token ? (persisted ? 'localStorage' : 'sessionStorage') : 'none'}</dd>
        </dl>
        <div className="row">
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
