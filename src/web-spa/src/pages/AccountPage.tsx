import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { toErrorMessage } from '../lib/api';
import { useToken } from '../lib/token-context';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';
import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';
import { getSessionDisplayLabel } from '../lib/session-display';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  Button,
  ButtonLink,
  Card,
  DefinitionList,
  InlineGroup,
  PageHeader,
  StatusBanner,
  TextLink,
} from '../components/ui';

export function AccountPage(): React.JSX.Element {
  useDocumentTitle('Account');
  const { session, loading, sessionReady, sessionError, refresh, logout } = useAuth();
  const { token, persisted, clear } = useToken();
  const { toast } = useToast();
  const hasServerSession = session?.authenticated === true;
  const hasToken = Boolean(token.trim());
  const authStartHref = buildHostedAuthStartHref('/app/account');
  const protocolQuery = useQuery({
    queryKey: ['account-mcp-runtime-readiness', token],
    queryFn: () => verifyMcpRuntimeReadiness(token),
    enabled: hasServerSession && hasToken,
    retry: false,
  });
  const expectedProtocolVersion = '2025-06-18';
  const protocolMismatch = Boolean(
    protocolQuery.data?.protocolVersion &&
    protocolQuery.data.protocolVersion !== expectedProtocolVersion,
  );
  const protocolMismatchMessage = protocolMismatch
    ? `Protocol mismatch: server advertised ${protocolQuery.data?.protocolVersion || 'unknown'}, expected ${expectedProtocolVersion}.`
    : '';
  const accountLabel = getSessionDisplayLabel(session?.user);

  const sessionSummary =
    loading || !sessionReady
      ? 'Checking browser access'
      : hasServerSession
        ? 'Signed in'
        : 'Signed out';
  const credentialSummary = hasToken
    ? persisted
      ? 'Local credential saved'
      : 'Temporary credential loaded'
    : 'No local credential';
  const protocolSummary =
    !hasServerSession || !hasToken
      ? 'Runtime checks locked'
      : protocolQuery.isLoading
        ? 'Checking runtime'
        : protocolQuery.isError
          ? 'Runtime check failed'
          : protocolMismatch
            ? 'Protocol mismatch'
            : 'Runtime ready';
  const accountSummary = hasServerSession ? `Signed in as ${accountLabel}` : 'Sign in required';
  const accountDescription = !hasServerSession
    ? 'Sign in, inspect account access, and recover stored credentials from one place.'
    : 'Review sign-in state, local credentials, and recovery options without digging through diagnostics first.';
  const recoverySummary =
    !hasServerSession && hasToken
      ? 'A local credential is still stored on this device.'
      : hasToken
        ? 'A local credential is available for browser-side runtime checks.'
        : 'No local credential is stored on this device.';
  const diagnosticsSummary =
    !hasServerSession || !hasToken
      ? 'Open diagnostics when you need deeper runtime checks.'
      : protocolQuery.isLoading
        ? 'Checking runtime access'
        : protocolQuery.isError
          ? 'Runtime diagnostics need attention'
          : protocolMismatch
            ? 'Protocol mismatch needs review'
            : 'Runtime diagnostics look healthy';
  const showDiagnosticsCard = Boolean(
    sessionError || hasToken || protocolQuery.isError || protocolMismatch,
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Workspace account"
        title="Account"
        description={accountDescription}
        actions={
          <InlineGroup>
            <ButtonLink to="/app/credentials" variant="secondary">
              Open credentials
            </ButtonLink>
            {hasServerSession ? (
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await logout();
                  } catch {
                    toast('Sign out failed — browser access is still active.', 'error');
                  }
                }}
              >
                Sign out
              </Button>
            ) : (
              <ButtonLink href={authStartHref}>Sign in</ButtonLink>
            )}
          </InlineGroup>
        }
      />

      <StatusBanner role="alert" message={sessionError} type="error" />
      <div className="page-card-grid">
        <Card title="Account access" subtitle={accountSummary}>
          <DefinitionList
            entries={[
              {
                term: 'Browser access',
                description:
                  loading || !sessionReady
                    ? '… Checking browser access'
                    : sessionError
                      ? '⚠ Failed'
                      : '✓ Ready',
              },
              {
                term: 'Status',
                description: sessionSummary,
              },
              {
                term: 'Sign-in email',
                description: session?.user?.email ?? 'Not available from identity provider',
              },
              {
                term: 'User ID',
                description: session?.user?.id ?? 'n/a',
                descriptionClassName: 'mono',
              },
              {
                term: 'Recovery',
                description: recoverySummary,
              },
            ]}
          />
          <InlineGroup>
            <Button variant="secondary" onClick={() => refresh()} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh status'}
            </Button>
            {!hasServerSession ? <ButtonLink href={authStartHref}>Sign in</ButtonLink> : null}
            <TextLink to="/app/usage">Open usage</TextLink>
          </InlineGroup>
        </Card>

        <Card title="Credential status" subtitle={credentialSummary}>
          <DefinitionList
            entries={[
              {
                term: 'Local credential',
                description: hasToken ? 'Loaded' : 'Not loaded',
              },
              {
                term: 'Storage',
                description: hasToken
                  ? persisted
                    ? 'Saved on this device'
                    : 'This browser tab only'
                  : 'Not stored',
              },
              {
                term: 'Use case',
                description: hasToken
                  ? 'Available for browser-side runtime probes'
                  : 'Optional unless you need direct browser diagnostics',
              },
            ]}
          />
          <InlineGroup>
            <ButtonLink to="/app/credentials" variant="secondary">
              Manage credentials
            </ButtonLink>
            <Button
              variant="secondary"
              disabled={!hasToken}
              onClick={() => {
                clear();
                toast('Token cleared', 'info');
              }}
            >
              Clear local credential
            </Button>
          </InlineGroup>
        </Card>
      </div>

      {showDiagnosticsCard ? (
        <Card title="Diagnostics" subtitle={diagnosticsSummary} className="account-support-card">
          <DefinitionList
            entries={[
              {
                term: 'Runtime summary',
                description: protocolSummary,
              },
              {
                term: 'MCP protocol',
                description:
                  !hasServerSession || !hasToken
                    ? '—'
                    : protocolQuery.isLoading
                      ? '… Checking protocol surface'
                      : protocolQuery.isError
                        ? '⚠ Protocol check failed'
                        : protocolMismatch
                          ? `⚠ Protocol mismatch (${protocolQuery.data?.protocolVersion || 'unknown'})`
                          : `✓ ${protocolQuery.data?.protocolVersion || 'ready'}`,
              },
              ...(protocolQuery.data?.sessionId
                ? [
                    {
                      term: 'Runtime session',
                      description: protocolQuery.data.sessionId,
                      descriptionClassName: 'mono',
                    },
                  ]
                : []),
            ]}
          />
          <StatusBanner
            role="alert"
            message={protocolMismatchMessage}
            type="error"
            className="page-status-banner"
          />
          <StatusBanner
            role="alert"
            message={protocolQuery.isError ? toErrorMessage(protocolQuery.error) : ''}
            type="error"
            className="page-status-banner"
          />
          <InlineGroup>
            {hasServerSession && hasToken ? (
              <Button
                variant="secondary"
                onClick={() => protocolQuery.refetch()}
                disabled={protocolQuery.isFetching}
              >
                {protocolQuery.isFetching ? 'Checking protocol...' : 'Re-check protocol'}
              </Button>
            ) : null}
            <TextLink to="/app/diagnostics">Open diagnostics</TextLink>
            <TextLink to="/app/observability">Open observability</TextLink>
          </InlineGroup>
        </Card>
      ) : null}
    </div>
  );
}
