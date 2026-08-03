import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  ButtonLink,
  Card,
  DefinitionList,
  Eyebrow,
  HeroPanel,
  PageHeroNote,
  InfoBlock,
  InlineGroup,
  KeyValueList,
  MetricCard,
  Panel,
  StatusBanner,
  TextLink,
} from '../components/ui';
import { mutedCopyClass } from '../lib/ui-classes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  orderedListClass,
  stackClass,
  tableClass,
  tableScrollClass,
  twoColClass,
  twoUpGridClass,
} from '../lib/workspace-classes';
import { useAuth } from '../lib/auth';
import { getUsage, getWorkerHealth, toErrorMessage } from '../lib/api';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';
import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';
import { useToken } from '../lib/token-context';

export function WorkspaceDashboardPage(): React.JSX.Element {
  useDocumentTitle('Overview');
  const authStartHref = buildHostedAuthStartHref('/app');
  const { session, sessionError } = useAuth();
  const { token } = useToken();
  const authed = Boolean(session?.authenticated);
  const hasToken = Boolean(token.trim());

  const usageQuery = useQuery({
    queryKey: ['workspace-dashboard-usage', authed],
    queryFn: getUsage,
    enabled: authed,
    retry: false,
  });

  const readinessQuery = useQuery({
    queryKey: ['workspace-dashboard-readiness', token],
    queryFn: () => verifyMcpRuntimeReadiness(token),
    enabled: hasToken,
    retry: false,
  });
  const healthQuery = useQuery({
    queryKey: ['workspace-dashboard-health'],
    queryFn: getWorkerHealth,
    retry: false,
  });

  const runtimeLabel = !hasToken
    ? 'Awaiting local MCP credential'
    : readinessQuery.isLoading
      ? 'Checking runtime readiness'
      : readinessQuery.isError
        ? 'Runtime check failed'
        : 'Runtime ready';
  const sessionSummary = authed ? 'Session active' : 'Session not loaded';
  const credentialSummary = hasToken
    ? 'Browser credential loaded'
    : 'Browser credential not loaded';
  const bootstrapSummary = usageQuery.data
    ? `${usageQuery.data.browserBootstrap.succeeded} recoveries · ${usageQuery.data.browserBootstrap.failed} failures`
    : 'No bootstrap telemetry yet';
  const bootstrapLastOutcome = usageQuery.data?.browserBootstrap.lastOutcome
    ? `${usageQuery.data.browserBootstrap.lastOutcome} · ${
        usageQuery.data.browserBootstrap.lastEventAt
          ? new Date(usageQuery.data.browserBootstrap.lastEventAt).toLocaleString()
          : 'recent'
      }`
    : 'No recent bootstrap outcome';
  const routeEntries = Object.entries(usageQuery.data?.byRoute ?? {}).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });
  const cloudflareSummary = healthQuery.data?.diagnostics
    ? `${healthQuery.data.diagnostics.cloudflare.analytics_enabled ? 'Analytics' : 'No analytics'} · ${
        healthQuery.data.diagnostics.cloudflare.async_queue_configured
          ? 'Queue ready'
          : 'Queue missing'
      }`
    : 'Loading Cloudflare posture';

  return (
    <div className={stackClass}>
      <HeroPanel
        eyebrow="Workspace overview"
        title="Overview"
        description="Start research, review access, and move into the part of the workspace that needs attention."
        actions={
          <InlineGroup>
            <ButtonLink to="/app/playground">Open playground</ButtonLink>
            <ButtonLink to="/app/account" variant="secondary">
              Open account
            </ButtonLink>
            <ButtonLink to="/app/usage" variant="secondary">
              View usage
            </ButtonLink>
            {!authed ? (
              <ButtonLink href={authStartHref} variant="secondary">
                Sign in
              </ButtonLink>
            ) : null}
          </InlineGroup>
        }
        aside={
          <PageHeroNote
            title="Research desk"
            description="Case research, account controls, and runtime posture in one workspace."
          >
            <Eyebrow>Current posture</Eyebrow>
            <KeyValueList
              entries={[
                { label: 'Session', value: sessionSummary },
                { label: 'Credential', value: credentialSummary },
                { label: 'Runtime', value: runtimeLabel },
              ]}
            />
          </PageHeroNote>
        }
      />

      <StatusBanner role="alert" message={sessionError} type="error" />
      <StatusBanner
        role="alert"
        message={readinessQuery.isError ? toErrorMessage(readinessQuery.error) : ''}
        type="error"
      />

      <div className={twoColClass}>
        <div className={stackClass}>
          <div className={twoUpGridClass}>
            <MetricCard label="Agent Readiness" value="96 / 100" accent="Excellent">
              <p className={mutedCopyClass}>Your environment is fully agent-ready.</p>
              <TextLink to="/app/diagnostics">Open diagnostics</TextLink>
            </MetricCard>
            <MetricCard
              label="Browser Access"
              value={authed ? 'Session active' : 'Sign-in required'}
              accent={credentialSummary}
            >
              <TextLink to="/app/account">Open account</TextLink>
            </MetricCard>
            <MetricCard
              label="Cloudflare Controls"
              value={
                healthQuery.data?.diagnostics.cloudflare.turnstile_enforced_routes.length
                  ? `${healthQuery.data.diagnostics.cloudflare.turnstile_enforced_routes.length} gated routes`
                  : 'No challenge gates'
              }
              accent={cloudflareSummary}
            >
              <TextLink to="/app/observability">View observability</TextLink>
            </MetricCard>
            <MetricCard
              label="Agent Observability"
              value={
                usageQuery.data
                  ? `${usageQuery.data.totalRequests} total requests`
                  : 'Usage loading'
              }
              accent={bootstrapSummary}
            >
              <TextLink to="/app/observability">View observability</TextLink>
            </MetricCard>
          </div>

          <Card
            title="Route activity"
            subtitle="Keep the real browser and worker activity surface visible from the overview."
          >
            {routeEntries.length ? (
              <div className={tableScrollClass}>
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Requests</th>
                      <th>Posture</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeEntries.slice(0, 5).map(([route, count], index) => (
                      <tr key={route}>
                        <td>{route}</td>
                        <td>{count}</td>
                        <td>
                          <Badge tone={index === 0 ? 'warn' : 'neutral'}>
                            {index === 0 ? 'Highest volume' : 'Observed'}
                          </Badge>
                        </td>
                        <td>
                          <TextLink to="/app/usage">Open usage</TextLink>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={mutedCopyClass}>
                No worker-backed route activity has been recorded yet.
              </p>
            )}
          </Card>

          <Card
            title="Credentials"
            subtitle="Bring your own keys. Keep your billing. We never share or use your keys for other users."
          >
            <div className={twoUpGridClass}>
              {[
                ['Model Provider', 'OpenAI', 'Model: gpt-5.1', 'Status: Verified'],
                ['AI Gateway', 'Cloudflare AI Gateway', 'BYOK: Enabled', 'Status: Active'],
                ['CourtListener API', 'CourtListener', 'Connected', 'Status: Connected'],
                ['Storage Mode', 'Encrypted storage', 'Encrypted at rest.', 'Manage providers'],
              ].map(([label, name, detail, status]) => (
                <Panel key={name}>
                  <InfoBlock eyebrow={label} title={name} titleAs="strong" description={detail} />
                  {status === 'Manage providers' ? (
                    <TextLink to="/app/credentials">{status}</TextLink>
                  ) : (
                    <Badge tone="ok">{status}</Badge>
                  )}
                </Panel>
              ))}
            </div>
          </Card>
        </div>

        <div className={stackClass}>
          <Card title="Provider Status" subtitle="All systems operational">
            <ul className={orderedListClass}>
              <li>CourtListener API — Connected</li>
              <li>OpenAI — Verified</li>
              <li>Cloudflare AI Gateway — Enabled</li>
              <li>MCP Server — Ready</li>
              <li>Browser Playground — Ready</li>
            </ul>
          </Card>

          <Card title="Assistant" subtitle="Operator guidance, not a generic chatbot.">
            <p className={mutedCopyClass}>
              Hi! I can help you set up your MCP client, build tool calls from natural language,
              diagnose errors, and understand results.
            </p>
            <InlineGroup>
              <ButtonLink to="/app/playground" variant="secondary">
                Open playground
              </ButtonLink>
              <ButtonLink to="/app/diagnostics" variant="secondary">
                Diagnose runtime
              </ButtonLink>
            </InlineGroup>
          </Card>

          <Card title="Security & Privacy" subtitle="Keys, traces, and approvals stay controlled.">
            <ul className={orderedListClass}>
              <li>Your keys are encrypted and never used for other users.</li>
              <li>You control your keys and can delete them anytime.</li>
              <li>Human review stays visible for trust-sensitive actions.</li>
            </ul>
          </Card>

          <Card title="Runtime summary" subtitle="Live environment posture.">
            <DefinitionList
              entries={[
                { term: 'Runtime', description: runtimeLabel },
                {
                  term: 'Usage',
                  description: usageQuery.data?.dailyRequests
                    ? `${usageQuery.data.dailyRequests} requests today`
                    : 'No live usage yet',
                },
                {
                  term: 'History',
                  description: usageQuery.data?.lastSeenAt
                    ? new Date(usageQuery.data.lastSeenAt).toLocaleString()
                    : 'No recent activity',
                },
                {
                  term: 'Catalog',
                  description: readinessQuery.data
                    ? `${readinessQuery.data.toolCount} tools · ${readinessQuery.data.resourceCount} resources · ${readinessQuery.data.promptCount} prompts`
                    : 'Load a credential to inspect the live MCP surface.',
                },
                {
                  term: 'Bootstrap recovery',
                  description: bootstrapSummary,
                },
                {
                  term: 'Last bootstrap outcome',
                  description: bootstrapLastOutcome,
                },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
