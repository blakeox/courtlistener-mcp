import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  ButtonLink,
  Card,
  DefinitionList,
  InlineGroup,
  MetricCard,
  PageHeader,
  StatusBanner,
} from '../components/ui';
import { mutedCopyClass } from '../lib/ui-classes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  orderedListClass,
  stackClass,
  twoColClass,
  twoUpGridClass,
} from '../lib/workspace-classes';
import { getUsage, getWorkerHealth, toErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

function formatRoutes(routes: string[]): string {
  return routes.length ? routes.join(', ') : 'None enforced';
}

export function ObservabilityPage(): React.JSX.Element {
  useDocumentTitle('Observability');
  const { session } = useAuth();
  const authed = Boolean(session?.authenticated);

  const healthQuery = useQuery({
    queryKey: ['observability-health'],
    queryFn: getWorkerHealth,
    retry: false,
  });
  const usageQuery = useQuery({
    queryKey: ['observability-usage', authed],
    queryFn: getUsage,
    enabled: authed,
    retry: false,
  });

  const queueConfigured = Boolean(healthQuery.data?.cloudflare.async_queue_configured);
  const analyticsEnabled = Boolean(healthQuery.data?.cloudflare.analytics_enabled);
  const kvConfigured = Boolean(healthQuery.data?.cloudflare.async_jobs_kv_configured);
  const enforcedRoutes = healthQuery.data?.cloudflare.turnstile_enforced_routes ?? [];
  const latencyKeys = Object.keys(
    (healthQuery.data?.metrics.latency_ms as Record<string, unknown> | null) ?? {},
  );

  return (
    <div className={stackClass}>
      <PageHeader
        eyebrow="Monitor"
        title="Agent Observability"
        description="Inspect the live Cloudflare worker posture, control-plane bindings, and operator-visible telemetry coverage."
        actions={
          <InlineGroup>
            <ButtonLink to="/app/usage">Open usage</ButtonLink>
            <ButtonLink to="/app/diagnostics" variant="secondary">
              Runtime diagnostics
            </ButtonLink>
          </InlineGroup>
        }
      />

      <StatusBanner
        role="alert"
        message={healthQuery.isError ? toErrorMessage(healthQuery.error) : ''}
        type="error"
      />
      <StatusBanner
        role="alert"
        message={usageQuery.isError ? toErrorMessage(usageQuery.error) : ''}
        type="error"
      />

      <div className={twoUpGridClass}>
        <MetricCard
          label="Analytics Engine"
          value={analyticsEnabled ? 'Enabled' : 'Disabled'}
          accent={analyticsEnabled ? 'Worker export active' : 'No Cloudflare analytics write path'}
        >
          <p className={mutedCopyClass}>
            Controls whether worker telemetry is exported into Cloudflare.
          </p>
        </MetricCard>
        <MetricCard
          label="Async execution"
          value={queueConfigured ? 'Queue bound' : 'Queue missing'}
          accent={kvConfigured ? 'Job KV bound' : 'Job KV missing'}
        >
          <p className={mutedCopyClass}>
            Shows whether async jobs can survive process-local state loss.
          </p>
        </MetricCard>
        <MetricCard
          label="Turnstile policy"
          value={
            enforcedRoutes.length ? `${enforcedRoutes.length} routes enforced` : 'Not enforced'
          }
          accent={formatRoutes(enforcedRoutes)}
        >
          <p className={mutedCopyClass}>
            Server-side challenge gates currently active on browser surfaces.
          </p>
        </MetricCard>
        <MetricCard
          label="Usage telemetry"
          value={
            authed && usageQuery.data
              ? `${usageQuery.data.totalRequests} requests tracked`
              : authed
                ? 'Loading'
                : 'Sign in for user scope'
          }
          accent={
            authed && usageQuery.data
              ? `${usageQuery.data.browserBootstrap.attempted} bootstrap events mirrored`
              : 'Per-user analytics summary'
          }
        >
          <p className={mutedCopyClass}>
            Confirms whether UI recovery telemetry is visible to operators.
          </p>
        </MetricCard>
      </div>

      <div className={twoColClass}>
        <div className={stackClass}>
          <Card
            title="Cloudflare control surface"
            subtitle="Bindings and policies the worker is currently reporting through /health."
          >
            <DefinitionList
              entries={[
                {
                  term: 'Transport',
                  description: healthQuery.data?.transport ?? 'Loading',
                },
                {
                  term: 'Analytics Engine',
                  description: analyticsEnabled ? 'Enabled' : 'Disabled',
                },
                {
                  term: 'Async queue',
                  description: queueConfigured ? 'Configured' : 'Not configured',
                },
                {
                  term: 'Async jobs KV',
                  description: kvConfigured ? 'Configured' : 'Not configured',
                },
                {
                  term: 'Turnstile routes',
                  description: formatRoutes(enforcedRoutes),
                },
              ]}
            />
          </Card>

          <Card
            title="Latency telemetry"
            subtitle="Worker latency keys exposed through the live health payload."
          >
            {latencyKeys.length ? (
              <ul className={orderedListClass}>
                {latencyKeys.map((metric) => (
                  <li key={metric}>{metric}</li>
                ))}
              </ul>
            ) : (
              <p className={mutedCopyClass}>No latency metric groups have been reported yet.</p>
            )}
          </Card>
        </div>

        <aside className={stackClass}>
          <Card title="Session topology" subtitle="Current Durable Object session model shape.">
            <DefinitionList
              entries={[
                {
                  term: 'Topology version',
                  description: healthQuery.data?.session_topology.version ?? 'Loading',
                },
                {
                  term: 'Shard count',
                  description: healthQuery.data
                    ? String(healthQuery.data.session_topology.shard_count)
                    : 'Loading',
                },
                {
                  term: 'Idle TTL',
                  description: healthQuery.data
                    ? `${healthQuery.data.session_topology.idle_ttl_ms} ms`
                    : 'Loading',
                },
                {
                  term: 'Absolute TTL',
                  description: healthQuery.data
                    ? `${healthQuery.data.session_topology.absolute_ttl_ms} ms`
                    : 'Loading',
                },
                {
                  term: 'Eviction sweep limit',
                  description: healthQuery.data
                    ? String(healthQuery.data.session_topology.eviction_sweep_limit)
                    : 'Loading',
                },
              ]}
            />
          </Card>

          <Card
            title="Operator posture"
            subtitle="Whether the browser-facing control path is measurable end to end."
          >
            <ul className={orderedListClass}>
              <li>
                <Badge tone={analyticsEnabled ? 'ok' : 'warn'}>
                  {analyticsEnabled ? 'Cloudflare export active' : 'Analytics export inactive'}
                </Badge>
              </li>
              <li>
                <Badge tone={queueConfigured && kvConfigured ? 'ok' : 'warn'}>
                  {queueConfigured && kvConfigured
                    ? 'Durable async path configured'
                    : 'Async durability incomplete'}
                </Badge>
              </li>
              <li>
                <Badge tone={enforcedRoutes.length ? 'ok' : 'neutral'}>
                  {enforcedRoutes.length
                    ? 'Turnstile policy visible'
                    : 'No challenge policy active'}
                </Badge>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
