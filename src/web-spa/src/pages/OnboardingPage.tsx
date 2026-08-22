import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToken } from '../lib/token-context';
import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';
import { describeTurnstileStatus, useTurnstileToken } from '../lib/turnstile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { stackClass, turnstileWrapClass } from '../lib/workspace-classes';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  DefinitionList,
  HeroPanel,
  PageHeroNote,
  InlineGroup,
  KeyValueList,
  LoadingState,
  StatusBanner,
  Stepper,
} from '../components/ui';
import { inlineGroupRowClass, monoClass, mutedCopyClass } from '../lib/ui-classes';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';

export function OnboardingPage(): React.JSX.Element {
  useDocumentTitle('Runtime Diagnostics');
  const { session, loading: sessionLoading, sessionReady, sessionError, refresh } = useAuth();
  const { token, clear } = useToken();
  const { toast } = useToast();
  const authStartHref = buildHostedAuthStartHref();
  const turnstile = useTurnstileToken(session?.turnstile_site_key, { action: 'session_bootstrap' });

  const authed = session?.authenticated === true;
  const hasToken = Boolean(token.trim());
  const sessionChecking = sessionLoading || !sessionReady;

  const expectedProtocolVersion = '2026-07-28';
  const mcpReadinessQuery = useQuery({
    queryKey: ['mcp-runtime-readiness', token],
    queryFn: () => verifyMcpRuntimeReadiness(token),
    enabled: hasToken,
    retry: false,
  });

  const readiness = mcpReadinessQuery.data;
  const protocolMismatch = Boolean(
    readiness?.protocolVersion && readiness.protocolVersion !== expectedProtocolVersion,
  );
  const protocolMismatchMessage = protocolMismatch
    ? `Protocol mismatch detected: server advertised ${readiness?.protocolVersion || 'unknown'}, expected ${expectedProtocolVersion}.`
    : '';

  const hasMcpSuccess = Boolean(readiness?.ready) && !protocolMismatch;
  const checklist = [
    {
      key: 'session',
      label: 'Verify account access',
      done: authed,
      href: '/app/account',
      action: 'Open account',
    },
    {
      key: 'token',
      label: 'Optional: load local MCP credential for direct probes',
      done: hasToken,
      href: '/app/account',
      action: 'Review credential tools',
    },
    {
      key: 'turnstile',
      label: turnstile.enabled
        ? 'Complete Cloudflare challenge for protected browser routes'
        : 'Cloudflare challenge not required',
      done: !turnstile.enabled || turnstile.status === 'verified',
      action: turnstile.enabled ? (
        <Button variant="secondary" onClick={() => turnstile.refresh()}>
          Refresh challenge
        </Button>
      ) : (
        <Badge tone="ok">Not required</Badge>
      ),
    },
    {
      key: 'runtime',
      label: 'Verify MCP protocol + tools',
      done: hasMcpSuccess,
      href: '/app/playground',
      action: 'Run MCP check',
    },
  ];
  const activeChecklistIndex = checklist.findIndex((item) => !item.done);

  const protocolStatus = !hasToken
    ? '… Awaiting local diagnostic credential'
    : mcpReadinessQuery.isLoading
      ? '… Negotiating MCP protocol'
      : mcpReadinessQuery.isError
        ? '⚠ MCP protocol unavailable'
        : protocolMismatch
          ? `⚠ Protocol mismatch (${readiness?.protocolVersion || 'unknown'})`
          : '✓ Connected (stateless MCP v2)';

  const toolAvailabilityStatus = !hasToken
    ? '… Awaiting local diagnostic credential'
    : mcpReadinessQuery.isLoading
      ? '… Discovering tools'
      : mcpReadinessQuery.isError
        ? '⚠ Tool discovery unavailable'
        : protocolMismatch
          ? '⚠ Blocked by protocol mismatch'
          : `${readiness?.toolCount ?? 0} tool(s) available`;
  const sessionSummary = sessionChecking
    ? 'Checking browser access'
    : authed
      ? 'Browser access ready'
      : 'Sign in required';
  const credentialSummary = hasToken
    ? 'Local diagnostic credential loaded'
    : 'No local diagnostic credential';
  const runtimeSummary = hasMcpSuccess ? 'Runtime ready' : 'Readiness checks pending';
  const turnstileSummary = describeTurnstileStatus(turnstile.status, turnstile.error);

  return (
    <div className={stackClass}>
      <HeroPanel
        eyebrow="Runtime diagnostics"
        title={authed ? 'Runtime Diagnostics' : 'Sign in to continue'}
        description={
          authed
            ? 'Diagnostics for browser access, local credential posture, protocol negotiation, and runtime readiness.'
            : 'Use the hosted auth flow first, then come back here for runtime diagnostics and MCP checks.'
        }
        actions={
          !authed ? (
            <InlineGroup>
              <ButtonLink href={authStartHref}>Sign in</ButtonLink>
            </InlineGroup>
          ) : undefined
        }
        aside={
          <PageHeroNote
            title={authed ? 'Diagnostics surface' : 'Authentication required'}
            description={
              authed
                ? 'Use this route to validate browser access, credential posture, protocol, and tool discovery before deeper troubleshooting.'
                : 'Start with hosted sign-in, then return here to validate the MCP runtime surface.'
            }
          >
            <KeyValueList
              entries={[
                { label: 'Access', value: sessionSummary },
                { label: 'Credential', value: credentialSummary },
                { label: 'Runtime', value: runtimeSummary },
              ]}
            />
          </PageHeroNote>
        }
      />

      <StatusBanner role="alert" message={sessionError} type="error" />
      <StatusBanner role="alert" message={protocolMismatchMessage} type="error" />

      <Card
        title="Diagnostic signals"
        subtitle="Verify browser access, the optional local diagnostic credential, the negotiated protocol version, and live MCP tool availability from one operator route."
      >
        <DefinitionList
          entries={[
            {
              term: 'Browser access',
              description: sessionChecking
                ? '… Checking browser access'
                : sessionError
                  ? '⚠ Browser access check failed'
                  : '✓ Browser access ready',
            },
            {
              term: 'Account',
              description: authed ? '✓ Signed in' : '⚠ Sign in required',
            },
            {
              term: 'Cloudflare challenge',
              description: turnstileSummary,
            },
            {
              term: 'Local MCP credential',
              description: hasToken
                ? '✓ Loaded for direct runtime probes'
                : '— Not loaded (OAuth remains primary path)',
            },
            { term: 'Protocol', description: protocolStatus },
            { term: 'Tool availability', description: toolAvailabilityStatus },
            {
              term: 'MCP Runtime',
              description: hasMcpSuccess ? '✓ Ready' : '… Pending readiness checks',
            },
          ]}
        />
        <InlineGroup>
          {!authed ? <ButtonLink href={authStartHref}>Sign in</ButtonLink> : null}
          <ButtonLink to="/app/account" variant="secondary">
            Open account
          </ButtonLink>
          <ButtonLink to="/app/account" variant="secondary">
            Open credentials
          </ButtonLink>
          <ButtonLink to="/app/playground">Open playground</ButtonLink>
          <Button variant="secondary" onClick={() => refresh()} disabled={sessionLoading}>
            {sessionLoading ? 'Refreshing...' : 'Refresh account'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              clear();
              toast('Stored local credential cleared', 'info');
            }}
          >
            Clear local credential
          </Button>
        </InlineGroup>
      </Card>

      <Card
        title="Cloudflare challenge"
        subtitle="Protected browser flows use Turnstile when the worker exposes a site key. Verify it here before testing bootstrap and AI endpoints."
      >
        {turnstile.enabled ? (
          <>
            <div className={turnstileWrapClass} ref={turnstile.containerRef} />
            <InlineGroup>
              <Badge tone={turnstile.status === 'verified' ? 'ok' : 'neutral'}>
                {turnstileSummary}
              </Badge>
              <Button variant="secondary" onClick={() => turnstile.refresh()}>
                Refresh challenge
              </Button>
            </InlineGroup>
            <StatusBanner role="alert" message={turnstile.error} type="error" />
          </>
        ) : (
          <p className={mutedCopyClass}>
            This worker is not currently enforcing Turnstile for browser bootstrap checks.
          </p>
        )}
      </Card>

      <Card
        title="Runtime checklist"
        subtitle="Move each runtime signal into a healthy state before deeper troubleshooting."
      >
        <Stepper
          steps={checklist.map((item, index) => ({
            label: item.label,
            complete: item.done,
            active: activeChecklistIndex === -1 ? false : index === activeChecklistIndex,
            to: item.done ? undefined : item.href,
            action: item.done ? (
              <Badge tone="ok">Done</Badge>
            ) : (
              <ButtonLink to={item.href} variant="secondary">
                {item.action}
              </ButtonLink>
            ),
          }))}
        />
      </Card>

      <Card
        title="Protocol + capability explorer"
        subtitle="Live metadata from server discovery plus tools/resources/prompts catalogs."
      >
        {!hasToken ? (
          <p className={mutedCopyClass}>
            Load a local MCP credential only if you need direct browser-side protocol probing.
            Public client access should use OAuth.
          </p>
        ) : mcpReadinessQuery.isLoading ? (
          <LoadingState
            label="Discovering protocol metadata"
            message="Discovering protocol capabilities and surfaces..."
          />
        ) : mcpReadinessQuery.isError ? (
          <StatusBanner
            role="alert"
            message={toErrorMessage(mcpReadinessQuery.error)}
            type="error"
          />
        ) : (
          <>
            <DefinitionList
              entries={[
                { term: 'Protocol version', description: readiness?.protocolVersion || 'unknown' },
                {
                  term: 'Server',
                  description: (
                    <>
                      {readiness?.serverName || 'unknown'}{' '}
                      <span className={monoClass}>{readiness?.serverVersion || 'unknown'}</span>
                    </>
                  ),
                },
                {
                  term: 'Transport',
                  description: 'Stateless MCP v2',
                  descriptionClassName: monoClass,
                },
                {
                  term: 'Catalog counts',
                  description: `${readiness?.toolCount ?? 0} tools · ${readiness?.resourceCount ?? 0} resources · ${
                    readiness?.promptCount ?? 0
                  } prompts`,
                },
                {
                  term: 'Tool categories',
                  description:
                    (readiness?.toolCategories.length ?? 0) > 0
                      ? readiness?.toolCategories.join(', ')
                      : 'none advertised',
                },
                {
                  term: 'Capabilities',
                  description:
                    (readiness?.capabilities ?? []).length > 0
                      ? readiness?.capabilities?.map((capability) => (
                          <Badge key={capability}>{capability}</Badge>
                        ))
                      : 'none advertised',
                  descriptionClassName: inlineGroupRowClass,
                },
              ]}
            />
          </>
        )}
      </Card>
    </div>
  );
}
