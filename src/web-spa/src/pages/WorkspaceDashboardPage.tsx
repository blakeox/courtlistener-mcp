import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  ButtonLink,
  Card,
  DefinitionList,
  Eyebrow,
  HeroPanel,
  InfoBlock,
  InlineGroup,
  KeyValueList,
  MetricCard,
  Panel,
  StatusBanner,
  TextLink,
} from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../lib/auth';
import { getUsage, toErrorMessage } from '../lib/api';
import { buildHostedAuthStartHref } from '../lib/hosted-auth';
import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';
import { useToken } from '../lib/token-context';
import { WORKSPACE_RECENT_SESSIONS } from '../lib/workspace';

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

  return (
    <div className="stack">
      <HeroPanel
        eyebrow="Workspace overview"
        title="Overview"
        description="Start research work, check session and runtime posture, and jump into the parts of the workspace that need attention."
        actions={
          <InlineGroup>
            <ButtonLink to="/app/sessions">Start research</ButtonLink>
            <ButtonLink to="/app/workflows" variant="secondary">
              Open workflows
            </ButtonLink>
            <ButtonLink to="/app/tools" variant="secondary">
              Open tools
            </ButtonLink>
            {!authed ? (
              <ButtonLink href={authStartHref} variant="secondary">
                Sign in
              </ButtonLink>
            ) : null}
          </InlineGroup>
        }
        aside={
          <div className="page-hero-note">
            <Eyebrow>Current posture</Eyebrow>
            <strong className="page-hero-note-title">Operational surface</strong>
            <p className="page-hero-note-text">
              Terminal, MCP, and court research in one workspace with explicit control points.
            </p>
            <KeyValueList
              entries={[
                { label: 'Session', value: sessionSummary },
                { label: 'Credential', value: credentialSummary },
                { label: 'Runtime', value: runtimeLabel },
              ]}
            />
          </div>
        }
      />

      <StatusBanner role="alert" message={sessionError} type="error" />
      <StatusBanner
        role="alert"
        message={readinessQuery.isError ? toErrorMessage(readinessQuery.error) : ''}
        type="error"
      />

      <div className="two-col">
        <div className="stack">
          <div className="two-up-grid">
            <MetricCard label="Agent Readiness" value="96 / 100" accent="Excellent">
              <p className="muted">Your environment is fully agent-ready.</p>
              <TextLink to="/app/diagnostics">Open diagnostics</TextLink>
            </MetricCard>
            <MetricCard
              label="Research Sessions"
              value="12 active sessions"
              accent="4 awaiting review"
            >
              <TextLink to="/app/sessions">Open sessions</TextLink>
            </MetricCard>
            <MetricCard
              label="Human Review Queue"
              value="3 pending approvals"
              accent="Review required"
            >
              <TextLink to="/app/review">View queue</TextLink>
            </MetricCard>
            <MetricCard
              label="Agent Observability"
              value="342 requests in 24h"
              accent="812ms avg latency · 1.2M tokens"
            >
              <TextLink to="/app/observability">View observability</TextLink>
            </MetricCard>
          </div>

          <Card
            title="Recent sessions"
            subtitle="Keep active, pending-review, and completed work visible from the overview."
          >
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Query / Description</th>
                    <th>Status</th>
                    <th>Last Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {WORKSPACE_RECENT_SESSIONS.map((row) => {
                    const tone =
                      row[2] === 'Active'
                        ? 'ok'
                        : row[2] === 'Awaiting Review'
                          ? 'warn'
                          : 'neutral';
                    return (
                      <tr key={row.join('-')}>
                        <td>{row[0]}</td>
                        <td>{row[1]}</td>
                        <td>
                          <Badge tone={tone}>{row[2]}</Badge>
                        </td>
                        <td>{row[3]}</td>
                        <td>
                          <TextLink to="/app/sessions">Open</TextLink>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="Credentials"
            subtitle="Bring your own keys. Keep your billing. We never share or use your keys for other users."
          >
            <div className="two-up-grid">
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

        <aside className="stack">
          <Card title="Provider Status" subtitle="All systems operational">
            <ul className="ordered">
              <li>CourtListener API — Connected</li>
              <li>OpenAI — Verified</li>
              <li>Cloudflare AI Gateway — Enabled</li>
              <li>MCP Server — Ready</li>
              <li>Browser Playground — Ready</li>
            </ul>
          </Card>

          <Card title="Assistant" subtitle="Operator guidance, not a generic chatbot.">
            <p className="muted">
              Hi! I can help you set up your MCP client, build tool calls from natural language,
              diagnose errors, and understand results.
            </p>
            <InlineGroup>
              <ButtonLink to="/app/tools" variant="secondary">
                Build a query
              </ButtonLink>
              <ButtonLink to="/app/diagnostics" variant="secondary">
                Diagnose runtime
              </ButtonLink>
            </InlineGroup>
          </Card>

          <Card title="Security & Privacy" subtitle="Keys, traces, and approvals stay controlled.">
            <ul className="ordered">
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
              ]}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
