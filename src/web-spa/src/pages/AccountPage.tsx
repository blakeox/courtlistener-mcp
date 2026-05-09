import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { toErrorMessage } from '../lib/api';
import { useToken } from '../lib/token-context';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';
import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  DefinitionList,
  Eyebrow,
  HeroPanel,
  InlineGroup,
  KeyValueList,
  PageHeader,
  StatusBanner,
  TextLink,
} from '../components/ui';

export function AccountPage(): React.JSX.Element {
  useDocumentTitle('Session');
  const { session, loading, sessionReady, sessionError, refresh, logout } = useAuth();
  const { token, persisted, clear } = useToken();
  const { toast } = useToast();
  const hasServerSession = session?.authenticated === true;
  const hasToken = Boolean(token.trim());
  const authStartHref = buildHostedAuthStartHref('/app/session');
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

  const diagnostics: string[] = [];
  if (!loading && sessionReady && !sessionError) {
    if (hasToken && !hasServerSession) {
      diagnostics.push(
        'A local MCP credential is loaded, but the operator browser session is signed out. This credential is only for direct runtime probes.',
      );
    } else if (!hasToken && hasServerSession) {
      diagnostics.push(
        'Operator session is active. No local MCP credential is loaded, which is fine unless you need direct browser-side runtime probes.',
      );
    }
  }
  if (protocolQuery.data?.diagnostics?.length) {
    diagnostics.push(...protocolQuery.data.diagnostics.slice(0, 2));
  }
  const observabilityHints = [
    !persisted && hasToken
      ? 'Token is session-scoped and will clear when this browser session ends.'
      : '',
    protocolQuery.data?.sessionId ? `Protocol session active: ${protocolQuery.data.sessionId}` : '',
  ].filter(Boolean);
  const sessionSummary =
    loading || !sessionReady
      ? 'Checking browser session'
      : hasServerSession
        ? 'Signed in'
        : 'Signed out';
  const credentialSummary = hasToken
    ? persisted
      ? 'Local credential saved'
      : 'Session credential loaded'
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
  const heroStatusTitle = !hasServerSession
    ? 'Sign in to unlock your operator session'
    : !hasToken
      ? 'Load a browser credential for direct runtime checks'
      : protocolQuery.isError || protocolMismatch
        ? 'Review runtime posture before continuing'
        : 'Workspace posture looks ready';
  const heroStatusDetail = !hasServerSession
    ? 'Use the hosted sign-in flow before reviewing runtime readiness or loading a local credential.'
    : !hasToken
      ? 'Your operator session is active. Add a local credential when you need browser-side runtime probes.'
      : protocolQuery.isError
        ? 'The browser session is active, but the latest MCP readiness probe failed and needs attention.'
        : protocolMismatch
          ? 'The operator session is active, but the advertised runtime protocol does not match the expected release target.'
          : 'Session, credential, and runtime readiness are aligned for research work.';

  return (
    <div className="stack">
      <HeroPanel
        eyebrow="Operator session"
        title="Session"
        description="Confirm browser session posture, inspect optional local MCP credentials, and verify runtime readiness before moving into research or operational work."
        aside={
          <div className="page-hero-note">
            <Eyebrow>Current status</Eyebrow>
            <strong className="page-hero-note-title">{heroStatusTitle}</strong>
            <p className="page-hero-note-text">{heroStatusDetail}</p>
            <KeyValueList
              entries={[
                { label: 'Session', value: sessionSummary },
                { label: 'Credential', value: credentialSummary },
                { label: 'Runtime', value: protocolSummary },
              ]}
            />
          </div>
        }
      />

      <PageHeader
        eyebrow="Session controls"
        title="Manage posture"
        description="Re-check session posture, clear local credentials, and recover browser or runtime access from one operator entry point."
        meta={`${sessionSummary} • ${credentialSummary} • ${protocolSummary}`}
        actions={
          <InlineGroup>
            <Button onClick={() => refresh()} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh session'}
            </Button>
            {hasServerSession && hasToken ? (
              <Button
                variant="secondary"
                onClick={() => protocolQuery.refetch()}
                disabled={protocolQuery.isFetching}
              >
                {protocolQuery.isFetching ? 'Checking protocol...' : 'Re-check protocol'}
              </Button>
            ) : null}
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
                    toast('Logout failed — session is still active.', 'error');
                  }
                }}
              >
                Logout
              </Button>
            ) : (
              <ButtonLink href={authStartHref}>Sign in</ButtonLink>
            )}
          </InlineGroup>
        }
      >
        <InlineGroup>
          <TextLink to="/app/usage">Open usage</TextLink>
          <TextLink to="/app/observability">Open observability</TextLink>
        </InlineGroup>
      </PageHeader>

      <div className="page-card-grid">
        <Card
          title="Session posture"
          subtitle="Server session state and local credential storage in one operator view."
        >
          <DefinitionList
            entries={[
              {
                term: 'Session check',
                description:
                  loading || !sessionReady
                    ? '… Checking /api/session'
                    : sessionError
                      ? '⚠ Failed'
                      : '✓ Ready',
              },
              {
                term: 'Authenticated',
                description: hasServerSession ? 'yes (server)' : 'no (server)',
              },
              {
                term: 'User ID',
                description: session?.user?.id ?? 'n/a',
                descriptionClassName: 'mono',
              },
              {
                term: 'Token storage mode',
                description: hasToken ? (persisted ? 'localStorage' : 'sessionStorage') : 'none',
              },
            ]}
          />
          <StatusBanner
            role="alert"
            message={sessionError}
            type="error"
            className="page-status-banner"
          />
        </Card>

        <Card
          title="Runtime readiness"
          subtitle="Protocol readiness and browser-side probe posture."
        >
          <DefinitionList
            entries={[
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
              {
                term: 'Runtime summary',
                description: protocolSummary,
              },
              {
                term: 'Runtime session',
                description: protocolQuery.data?.sessionId ?? 'n/a',
                descriptionClassName: protocolQuery.data?.sessionId ? 'mono' : undefined,
              },
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
            {(protocolQuery.data?.guardrails ?? []).slice(0, 3).map((guardrail) => (
              <Badge key={guardrail} tone="warn">
                {guardrail}
              </Badge>
            ))}
            {observabilityHints.map((hint) => (
              <Badge key={hint} tone="ok">
                {hint}
              </Badge>
            ))}
          </InlineGroup>
          {diagnostics.map((message) => (
            <StatusBanner
              key={message}
              message={message}
              type="info"
              className="page-status-banner"
            />
          ))}
        </Card>
      </div>
    </div>
  );
}
