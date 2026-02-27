import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createKey, listKeys, revokeKey, toErrorMessage } from '../lib/api';
import { trackEvent } from '../lib/telemetry';
import { useToken } from '../lib/token-context';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStatus } from '../hooks/useStatus';
import { Button, Card, FormField, Input, Modal, StatusBanner, formatDate } from '../components/ui';
import type { ApiKeyRecord } from '../lib/types';

function statusForKey(key: ApiKeyRecord): 'active' | 'revoked' | 'expired' {
  if (key.revoked_at) return 'revoked';
  if (key.expires_at && Date.parse(key.expires_at) <= Date.now()) return 'expired';
  return key.is_active ? 'active' : 'revoked';
}

export function KeysPage(): React.JSX.Element {
  useDocumentTitle('API Keys');
  const queryClient = useQueryClient();
  const { token, persisted: persistToken, setToken: setGlobalToken, clear: clearGlobalToken } = useToken();
  const { toast } = useToast();
  const [label, setLabel] = React.useState('rotation');
  const [expiryPreset, setExpiryPreset] = React.useState('30');
  const [customDays, setCustomDays] = React.useState('30');
  const { status, statusType, setOk, setError, setInfo } = useStatus();
  const [newToken, setNewToken] = React.useState('');
  const newTokenRef = React.useRef<HTMLDivElement>(null);
  const [revokeId, setRevokeId] = React.useState('');

  React.useEffect(() => {
    if (newToken && newTokenRef.current) {
      newTokenRef.current.focus();
    }
  }, [newToken]);

  const keysQuery = useQuery({
    queryKey: ['keys'],
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
      if (created) {
        setGlobalToken(created, true);
        toast('New key created and set as active token', 'ok');
        // One-time warning about localStorage persistence
        const warned = sessionStorage.getItem('clmcp_storage_warned');
        if (!warned) {
          sessionStorage.setItem('clmcp_storage_warned', '1');
          toast('Token saved to localStorage — any script on this page can read it. Use Account page to clear.', 'info');
        }
      }
      if (created) {
        setOk('New key created. Save it now.');
      } else {
        setError('Key created, but token missing in response.');
      }
      trackEvent('key_created');
      await queryClient.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: (error) => {
      setError(toErrorMessage(error));
      trackEvent('key_create_failed', { category: 'auth' });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => revokeKey(keyId, token || undefined),
    onMutate: async (keyId: string) => {
      await queryClient.cancelQueries({ queryKey: ['keys'] });
      const previous = queryClient.getQueryData<{ keys: ApiKeyRecord[] }>(['keys']);
      queryClient.setQueryData<{ keys: ApiKeyRecord[] } | undefined>(['keys'], (old) => {
        if (!old) return old;
        return {
          ...old,
          keys: old.keys.map((k) =>
            k.id === keyId ? { ...k, is_active: false, revoked_at: new Date().toISOString() } : k,
          ),
        };
      });
      return { previous };
    },
    onSuccess: () => {
      setOk('Key revoked.');
      toast('Key revoked successfully', 'ok');
    },
    onError: (error, _keyId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['keys'], context.previous);
      }
      setError(toErrorMessage(error));
      toast('Failed to revoke key — reverted', 'error');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['keys'] });
    },
  });

  const rows = keysQuery.data?.keys ?? [];

  return (
    <div className="stack">
      <div className="two-col">
        <Card title="Bearer token" subtitle="Your token is managed globally. Create a key below and it will auto-set.">
          <dl className="dl-grid">
            <dt>Token status</dt>
            <dd>{token ? '✓ Set' : '✗ Not set'}</dd>
          </dl>
          {token && (
            <Button variant="secondary" onClick={() => { clearGlobalToken(); toast('Token cleared', 'info'); }}>
              Clear token
            </Button>
          )}
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
          <div id="newKeyToken" className="token-box" ref={newTokenRef} tabIndex={-1} aria-label="Newly created API token">
            {newToken || 'No key created yet.'}
          </div>
          <div className="row">
            <Button
              id="copyNewKeyBtn"
              variant="secondary"
              onClick={async () => {
                if (!newToken) {
                  toast('Create a key first to copy it.', 'error');
                  return;
                }
                try {
                  await navigator.clipboard.writeText(newToken);
                  toast('New key copied to clipboard', 'ok');
                } catch {
                  toast('Clipboard not available — copy manually', 'error');
                }
              }}
            >
              Copy new key
            </Button>
          </div>
          <div className="hint mono">export COURTLISTENER_MCP_API_KEY=&quot;{newToken ? '***' : 'paste_token'}&quot;</div>
        </Card>
      </div>

      <Card title="Existing keys" subtitle="Statuses update immediately after creation or revocation.">
        {keysQuery.isLoading ? (
          <div className="loading" role="status" aria-busy="true" aria-label="Loading keys">
            <div className="skeleton skeleton-line"></div>
            <div className="skeleton skeleton-line short"></div>
            <div className="skeleton skeleton-line"></div>
          </div>
        ) : null}
        {keysQuery.isError ? (
          <div>
            <StatusBanner role="alert" message={toErrorMessage(keysQuery.error)} type="error" />
            <Button variant="secondary" onClick={() => keysQuery.refetch()} disabled={keysQuery.isFetching}>
              {keysQuery.isFetching ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        ) : null}
        {!keysQuery.isLoading && !rows.length ? (
          <div className="empty-state">
            <div className="empty-icon">🔑</div>
            <p>No keys found for this user.</p>
          </div>
        ) : null}
        {!!rows.length ? (
          <table className="table" aria-label="API keys">
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Status</th>
                <th scope="col">Expires</th>
                <th scope="col">Created</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
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
                    <td>{key.expires_at ? formatDate(key.expires_at) : 'none'}</td>
                    <td>{formatDate(key.created_at)}</td>
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
