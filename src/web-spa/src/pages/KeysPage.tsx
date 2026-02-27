import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createKey, listKeys, revokeKey, toErrorMessage } from '../lib/api';
import { readToken, saveToken, isPersistedToken } from '../lib/storage';
import { trackEvent } from '../lib/telemetry';
import { Button, Card, FormField, Input, Modal, StatusBanner } from '../components/ui';
import type { ApiKeyRecord } from '../lib/types';

function statusForKey(key: ApiKeyRecord): 'active' | 'revoked' | 'expired' {
  if (key.revoked_at) return 'revoked';
  if (key.expires_at && Date.parse(key.expires_at) <= Date.now()) return 'expired';
  return key.is_active ? 'active' : 'revoked';
}

export function KeysPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [token, setToken] = React.useState('');
  const [persistToken, setPersistToken] = React.useState(false);
  const [label, setLabel] = React.useState('rotation');
  const [expiryPreset, setExpiryPreset] = React.useState('30');
  const [customDays, setCustomDays] = React.useState('30');
  const [status, setStatus] = React.useState('');
  const [statusType, setStatusType] = React.useState<'ok' | 'error' | 'info'>('info');
  const [newToken, setNewToken] = React.useState('');
  const [revokeId, setRevokeId] = React.useState('');

  React.useEffect(() => {
    const saved = readToken();
    setToken(saved);
    setPersistToken(isPersistedToken());
  }, []);

  const keysQuery = useQuery({
    queryKey: ['keys', token],
    queryFn: () => listKeys(token || undefined),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsedCustom = Number.parseInt(customDays, 10);
      const expiresDays = expiryPreset === 'custom' ? parsedCustom : Number.parseInt(expiryPreset, 10);
      return createKey(
        {
          label: label.trim() || 'rotation',
          expiresDays: Number.isFinite(expiresDays) ? Math.max(1, Math.min(expiresDays, 3650)) : 30,
        },
        token || undefined,
      );
    },
    onSuccess: async (data) => {
      const created = data.api_key?.token ?? '';
      setNewToken(created);
      setStatus(created ? 'New key created. Save it now.' : 'Key created, but token missing in response.');
      setStatusType(created ? 'ok' : 'error');
      trackEvent('key_created');
      await queryClient.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: (error) => {
      setStatus(toErrorMessage(error));
      setStatusType('error');
      trackEvent('key_create_failed', { category: 'auth' });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => revokeKey(keyId, token || undefined),
    onSuccess: async () => {
      setStatus('Key revoked.');
      setStatusType('ok');
      await queryClient.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: (error) => {
      setStatus(toErrorMessage(error));
      setStatusType('error');
    },
  });

  const rows = keysQuery.data?.keys ?? [];

  return (
    <div className="stack">
      <div className="two-col">
        <Card title="Session and bearer token" subtitle="Optional: use token mode. Session cookie mode is also supported.">
          <FormField id="apiToken" label="API token">
            <Input
              id="apiToken"
              type="password"
              placeholder="Paste MCP bearer token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </FormField>
          <label className="inline-check">
            <input
              id="persistToken"
              type="checkbox"
              checked={persistToken}
              onChange={(event) => setPersistToken(event.target.checked)}
            />
            Remember token on this device
          </label>
          <div className="row">
            <Button
              id="saveTokenBtn"
              variant="secondary"
              onClick={() => {
                if (!token.trim()) {
                  setStatus('Token is empty.');
                  setStatusType('error');
                  return;
                }
                saveToken(token, persistToken);
                setStatus(persistToken ? 'Token saved to localStorage.' : 'Token saved to sessionStorage.');
                setStatusType('ok');
              }}
            >
              Save token
            </Button>
            <Button id="loadKeysBtn" onClick={() => keysQuery.refetch()}>
              Load keys
            </Button>
          </div>
          <StatusBanner id="keysStatus" message={status} type={statusType} />
        </Card>

        <Card title="Create rotation key" subtitle="One-time token reveal. Store it immediately.">
          <FormField id="newLabel" label="Label">
            <Input id="newLabel" value={label} onChange={(event) => setLabel(event.target.value)} />
          </FormField>
          <FormField id="newExpiresDays" label="Expires in">
            <select id="newExpiresDays" value={expiryPreset} onChange={(event) => setExpiryPreset(event.target.value)}>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="custom">Custom</option>
            </select>
          </FormField>
          {expiryPreset === 'custom' ? (
            <FormField id="customDays" label="Custom days (1-3650)">
              <Input
                id="customDays"
                type="number"
                min={1}
                max={3650}
                value={customDays}
                onChange={(event) => setCustomDays(event.target.value)}
              />
            </FormField>
          ) : null}
          <Button id="createKeyBtn" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create key'}
          </Button>
          <StatusBanner id="newKeyStatus" message={status} type={statusType} />
          <div id="newKeyToken" className="token-box" aria-label="Newly created API token">
            {newToken || 'No key created yet.'}
          </div>
          <div className="row">
            <Button
              id="copyNewKeyBtn"
              variant="secondary"
              onClick={async () => {
                if (!newToken) {
                  setStatus('Create a key first to copy it.');
                  setStatusType('error');
                  return;
                }
                await navigator.clipboard.writeText(newToken);
                setStatus('New key copied.');
                setStatusType('ok');
              }}
            >
              Copy new key
            </Button>
          </div>
          <div className="hint mono">export COURTLISTENER_MCP_API_KEY=&quot;{newToken ? '***' : 'paste_token'}&quot;</div>
        </Card>
      </div>

      <Card title="Existing keys" subtitle="Statuses update immediately after creation or revocation.">
        {keysQuery.isLoading ? <p>Loading keys...</p> : null}
        {keysQuery.isError ? <StatusBanner role="alert" message={toErrorMessage(keysQuery.error)} type="error" /> : null}
        {!keysQuery.isLoading && !rows.length ? <p>No keys found for this user.</p> : null}
        {!!rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((key) => {
                const statusValue = statusForKey(key);
                return (
                  <tr key={key.id}>
                    <td>
                      <div className="mono">{key.label || '(no label)'}</div>
                      <div className="hint mono">{key.id}</div>
                    </td>
                    <td>
                      <span className={`chip ${statusValue}`}>{statusValue}</span>
                    </td>
                    <td>{key.expires_at ? new Date(key.expires_at).toISOString() : 'none'}</td>
                    <td>{new Date(key.created_at).toISOString()}</td>
                    <td>
                      <Button
                        variant="secondary"
                        className="danger-outline"
                        onClick={() => setRevokeId(key.id)}
                        disabled={statusValue !== 'active'}
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </Card>

      <Modal open={Boolean(revokeId)} title="Revoke key" onClose={() => setRevokeId('')}>
        <p>This action cannot be undone.</p>
        <div className="row">
          <Button
            variant="danger"
            onClick={async () => {
              const keyId = revokeId;
              setRevokeId('');
              await revokeMutation.mutateAsync(keyId);
            }}
          >
            Confirm revoke
          </Button>
          <Button variant="secondary" onClick={() => setRevokeId('')}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
