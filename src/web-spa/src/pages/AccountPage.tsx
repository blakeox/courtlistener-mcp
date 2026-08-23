import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { bootstrapSession, toErrorMessage } from '../lib/api';
import { useToken } from '../lib/token-context';
import { normalizeMcpCredential } from '../lib/storage';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';
import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';
import { getSessionDisplayLabel } from '../lib/session-display';
import { forwardUiTelemetryEvent, trackEvent } from '../lib/telemetry';
import { describeTurnstileStatus, useTurnstileToken } from '../lib/turnstile';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { accountSupportCardClass } from '../lib/shell-classes';
import {
  pageCardGridClass,
  pageStatusBannerClass,
  stackClass,
  turnstileWrapClass,
} from '../lib/workspace-classes';
import { monoClass } from '../lib/ui-classes';
import {
  Button,
  ButtonLink,
  Card,
  CheckboxField,
  DefinitionList,
  FormField,
  Input,
  InlineGroup,
  PageHeader,
  StatusBanner,
  TextLink,
} from '../components/ui';

export function AccountPage(): React.JSX.Element {
  useDocumentTitle('Account');
  const { session, loading, sessionReady, sessionError, refresh, logout } = useAuth();
  const { token, persisted, setToken, clear } = useToken();
  const { toast } = useToast();
  const hasServerSession = session?.authenticated === true;
  const hasToken = Boolean(token.trim());
  const authStartHref = buildHostedAuthStartHref('/app/account');
  const turnstile = useTurnstileToken(session?.turnstile_site_key, { action: 'session_bootstrap' });
  const [bootstrapAuthorization, setBootstrapAuthorization] = React.useState('');
  const [bootstrapBusy, setBootstrapBusy] = React.useState(false);
  const [bootstrapError, setBootstrapError] = React.useState('');
  const [bootstrapSummary, setBootstrapSummary] = React.useState('');
  const [credentialInput, setCredentialInput] = React.useState('');
  const [persistCredential, setPersistCredential] = React.useState(true);
  const [credentialError, setCredentialError] = React.useState('');
  const protocolQuery = useQuery({
    queryKey: ['account-mcp-runtime-readiness', token],
    queryFn: () => verifyMcpRuntimeReadiness(token),
    enabled: hasServerSession && hasToken,
    retry: false,
  });
  const expectedProtocolVersion = '2026-07-28';
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
  const showBootstrapCard = !hasServerSession || Boolean(sessionError);
  const bootstrapDisabled =
    bootstrapBusy ||
    !bootstrapAuthorization.trim() ||
    (turnstile.enabled && turnstile.status !== 'verified');

  function handleSaveCredential(): void {
    const normalized = normalizeMcpCredential(credentialInput);
    if (!normalized) {
      setCredentialError('Paste an MCP access token or Bearer header value first.');
      return;
    }
    setCredentialError('');
    setToken(normalized, persistCredential);
    setCredentialInput('');
    toast(
      persistCredential
        ? 'Local MCP credential saved on this device.'
        : 'Local MCP credential loaded for this browser tab.',
      'ok',
    );
  }

  async function handleBootstrapSession(): Promise<void> {
    if (bootstrapDisabled) return;
    trackEvent('browser_session_bootstrap_attempted', {
      turnstile_required: turnstile.enabled,
      turnstile_status: turnstile.status,
    });
    forwardUiTelemetryEvent(
      'browser_session_bootstrap_attempted',
      '/app/account',
      turnstile.status,
    );
    setBootstrapBusy(true);
    setBootstrapError('');
    setBootstrapSummary('');
    try {
      const response = await bootstrapSession({
        authorization: bootstrapAuthorization.trim(),
        turnstileToken: turnstile.token || undefined,
      });
      setBootstrapSummary(
        `Browser session bootstrapped for ${response.userId}. Expires in ${response.expiresInSeconds} seconds.`,
      );
      trackEvent('browser_session_bootstrap_succeeded', {
        user_id_present: Boolean(response.userId),
        expires_in_seconds: response.expiresInSeconds,
      });
      forwardUiTelemetryEvent('browser_session_bootstrap_succeeded', '/app/account', 'success');
      setBootstrapAuthorization('');
      await refresh();
      toast('Browser session bootstrapped.', 'ok');
    } catch (error) {
      const message = toErrorMessage(error);
      trackEvent('browser_session_bootstrap_failed', {
        turnstile_required: turnstile.enabled,
        error_message: message,
      });
      forwardUiTelemetryEvent('browser_session_bootstrap_failed', '/app/account', 'failed');
      setBootstrapError(message);
      toast(message, 'error');
    } finally {
      if (turnstile.enabled) {
        turnstile.refresh();
      }
      setBootstrapBusy(false);
    }
  }

  return (
    <div className={stackClass}>
      <PageHeader
        eyebrow="Workspace account"
        title="Account"
        description={accountDescription}
        actions={
          <InlineGroup>
            <ButtonLink to="/app/account" variant="secondary">
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
      <div className={pageCardGridClass}>
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
                descriptionClassName: monoClass,
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

        <Card
          title="Local MCP credential"
          subtitle="Optional bearer token for Playground and direct browser-side MCP probes. Hosted sign-in stays separate."
        >
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
                  : 'Required for Playground raw MCP calls and runtime diagnostics',
              },
            ]}
          />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveCredential();
            }}
          >
            <FormField
              id="mcpCredential"
              label="MCP access token"
              hint="Paste an OAuth access token from your MCP client, or the full Authorization header value (Bearer …)."
            >
              <Input
                id="mcpCredential"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={credentialInput}
                onChange={(event) => setCredentialInput(event.target.value)}
                placeholder="Bearer eyJ…"
              />
            </FormField>
            <CheckboxField
              id="persistCredential"
              checked={persistCredential}
              onChange={(event) => setPersistCredential(event.target.checked)}
            >
              Remember on this device
            </CheckboxField>
            <InlineGroup>
              <Button type="submit" disabled={!credentialInput.trim()}>
                Save credential
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!hasToken}
                onClick={() => {
                  clear();
                  setCredentialInput('');
                  setCredentialError('');
                  toast('Local MCP credential cleared', 'info');
                }}
              >
                Clear saved credential
              </Button>
              <ButtonLink to="/app/playground" variant="secondary">
                Open playground
              </ButtonLink>
            </InlineGroup>
          </form>
          <StatusBanner role="alert" message={credentialError} type="error" />
        </Card>
      </div>

      {showBootstrapCard ? (
        <Card
          title="Browser session bootstrap"
          subtitle="Controlled recovery path for explicitly bootstrapping browser access with a bearer credential."
        >
          <DefinitionList
            entries={[
              {
                term: 'Purpose',
                description:
                  'Recover browser access without leaving the workspace when a valid bearer credential is already available.',
              },
              {
                term: 'Cloudflare challenge',
                description: describeTurnstileStatus(turnstile.status, turnstile.error),
              },
              {
                term: 'Blast radius',
                description:
                  'Applies only to this browser session and still uses server-side bootstrap validation.',
              },
            ]}
          />
          {turnstile.enabled ? (
            <div className={turnstileWrapClass} ref={turnstile.containerRef} />
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleBootstrapSession();
            }}
          >
            <FormField
              id="bootstrapAuthorization"
              label="Authorization header"
              hint="Paste the full Authorization header value, for example: Bearer eyJ..."
            >
              <Input
                id="bootstrapAuthorization"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={bootstrapAuthorization}
                onChange={(event) => setBootstrapAuthorization(event.target.value)}
                placeholder="Bearer ..."
              />
            </FormField>
            <InlineGroup>
              <Button type="submit" disabled={bootstrapDisabled}>
                {bootstrapBusy ? 'Bootstrapping...' : 'Bootstrap browser session'}
              </Button>
              {turnstile.enabled ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    trackEvent('browser_session_bootstrap_turnstile_refreshed', {
                      turnstile_status: turnstile.status,
                    });
                    forwardUiTelemetryEvent(
                      'browser_session_bootstrap_turnstile_refreshed',
                      '/app/account',
                      turnstile.status,
                    );
                    turnstile.refresh();
                  }}
                >
                  Refresh challenge
                </Button>
              ) : null}
              <ButtonLink href={authStartHref} variant="secondary">
                Use hosted sign-in
              </ButtonLink>
            </InlineGroup>
          </form>
          <StatusBanner role="alert" message={turnstile.error} type="error" />
          <StatusBanner role="alert" message={bootstrapError} type="error" />
          <StatusBanner message={bootstrapSummary} type="ok" />
          {bootstrapDisabled && turnstile.enabled && turnstile.status !== 'verified' ? (
            <StatusBanner
              message="Complete the Cloudflare challenge before bootstrapping browser access."
              type="info"
            />
          ) : null}
        </Card>
      ) : null}

      {showDiagnosticsCard ? (
        <Card title="Diagnostics" subtitle={diagnosticsSummary} className={accountSupportCardClass}>
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
              ...(protocolQuery.data
                ? [
                    {
                      term: 'MCP transport',
                      description: 'Stateless v2',
                      descriptionClassName: monoClass,
                    },
                  ]
                : []),
            ]}
          />
          <StatusBanner
            role="alert"
            message={protocolMismatchMessage}
            type="error"
            className={pageStatusBannerClass}
          />
          <StatusBanner
            role="alert"
            message={protocolQuery.isError ? toErrorMessage(protocolQuery.error) : ''}
            type="error"
            className={pageStatusBannerClass}
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
