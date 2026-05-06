import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToken } from '../lib/token-context';
import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  DefinitionList,
  InlineGroup,
  LoadingState,
  StatusBanner,
  Stepper,
} from '../components/ui';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';

export function OnboardingPage(): React.JSX.Element {
  useDocumentTitle('Runtime Diagnostics');
  const { session, loading: sessionLoading, sessionReady, sessionError, refresh } = useAuth();
  const { token, clear } = useToken();
  const { toast } = useToast();
  const authStartHref = buildHostedAuthStartHref();

  const authed = session?.authenticated === true;
  const hasToken = Boolean(token.trim());
  const sessionChecking = sessionLoading || !sessionReady;

  const expectedProtocolVersion = '2025-06-18';
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
      label: 'Verify session status',
      done: authed,
      href: '/app/session',
      action: 'Open session page',
    },
    {
      key: 'token',
      label: 'Optional: load local MCP credential for direct probes',
      done: hasToken,
      href: '/app/credentials',
      action: 'Review credential tools',
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
          : `✓ Connected (${readiness?.sessionId || 'session established'})`;

  const toolAvailabilityStatus = !hasToken
    ? '… Awaiting local diagnostic credential'
    : mcpReadinessQuery.isLoading
      ? '… Discovering tools'
      : mcpReadinessQuery.isError
        ? '⚠ Tool discovery unavailable'
        : protocolMismatch
          ? '⚠ Blocked by protocol mismatch'
          : `${readiness?.toolCount ?? 0} tool(s) available`;

  return (
    <div className="stack">
      <Card
        title={authed ? 'Runtime Diagnostics' : 'Sign in to continue'}
        subtitle={
          authed
            ? 'Diagnostics for session state, local credential posture, protocol negotiation, and runtime readiness.'
            : 'Use the hosted auth flow first, then come back here for runtime diagnostics and MCP checks.'
        }
      >
        <p className="muted">
          {authed
            ? 'Your browser session is active. Use this page for MCP diagnostics, protocol checks, and local credential troubleshooting.'
            : 'This diagnostics view is for troubleshooting after sign-in. Start with the hosted auth flow first, then come back here for runtime checks.'}
        </p>
        {!authed ? (
          <InlineGroup>
            <ButtonLink href={authStartHref}>Sign in</ButtonLink>
          </InlineGroup>
        ) : null}
        <DefinitionList
          entries={[
            {
              term: 'Session',
              description: sessionChecking
                ? '… Checking server session'
                : sessionError
                  ? '⚠ Session check failed'
                  : '✓ Session endpoint reachable',
            },
            {
              term: 'Auth',
              description: authed ? '✓ Operator session active' : '⚠ No operator session',
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
      </Card>

      <StatusBanner role="alert" message={sessionError} type="error" />
      <StatusBanner role="alert" message={protocolMismatchMessage} type="error" />

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
        subtitle="Live metadata from initialize + tools/resources/prompts discovery."
      >
        {!hasToken ? (
          <p className="muted">
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
                      <span className="mono">{readiness?.serverVersion || 'unknown'}</span>
                    </>
                  ),
                },
                {
                  term: 'Session id',
                  description: readiness?.sessionId || 'none returned',
                  descriptionClassName: 'mono',
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
                  descriptionClassName: 'row',
                },
              ]}
            />
          </>
        )}
      </Card>

      <Card
        title="Quick actions"
        subtitle="Shortcuts for session, credentials, and runtime checks."
      >
        <InlineGroup>
          {!authed ? <ButtonLink href={authStartHref}>Sign in</ButtonLink> : null}
          <ButtonLink to="/app/session" variant="secondary">
            Open session
          </ButtonLink>
          <ButtonLink to="/app/credentials" variant="secondary">
            Open credentials
          </ButtonLink>
          <ButtonLink to="/app/playground">Open playground</ButtonLink>
          <Button variant="secondary" onClick={() => refresh()} disabled={sessionLoading}>
            {sessionLoading ? 'Refreshing...' : 'Refresh session'}
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
    </div>
  );
}
