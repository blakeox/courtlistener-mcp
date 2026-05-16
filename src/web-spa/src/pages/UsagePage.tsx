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
  TextLink,
} from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../lib/auth';
import { getUsage, toErrorMessage } from '../lib/api';

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'None recorded';
}

export function UsagePage(): React.JSX.Element {
  useDocumentTitle('Usage');
  const { session } = useAuth();
  const authed = Boolean(session?.authenticated);
  const usageQuery = useQuery({
    queryKey: ['usage-page', authed],
    queryFn: getUsage,
    enabled: authed,
    retry: false,
  });

  const routeEntries = Object.entries(usageQuery.data?.byRoute ?? {}).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });
  const topRoute = routeEntries[0];
  const bootstrap = usageQuery.data?.browserBootstrap;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Monitor"
        title="Usage & History"
        description="Read the live user-level activity snapshot, route mix, and browser recovery behavior from the worker."
        actions={
          <InlineGroup>
            <ButtonLink to="/app/account">Open account</ButtonLink>
            <ButtonLink to="/app/observability" variant="secondary">
              View observability
            </ButtonLink>
          </InlineGroup>
        }
      />

      {!authed ? (
        <Card
          title="Sign-in required"
          subtitle="Usage history is tied to an authenticated operator session."
        >
          <TextLink to="/app/account">Open account controls</TextLink>
        </Card>
      ) : null}

      <StatusBanner
        role="alert"
        message={usageQuery.isError ? toErrorMessage(usageQuery.error) : ''}
        type="error"
      />

      {authed ? (
        <>
          <div className="two-up-grid">
            <MetricCard
              label="Requests today"
              value={usageQuery.data ? String(usageQuery.data.dailyRequests) : 'Loading'}
              accent={usageQuery.data?.currentDay ?? 'Daily window'}
            >
              <p className="muted">Current authenticated operator usage for today.</p>
            </MetricCard>
            <MetricCard
              label="Total requests"
              value={usageQuery.data ? String(usageQuery.data.totalRequests) : 'Loading'}
              accent={usageQuery.data?.userId ?? 'User scope'}
            >
              <p className="muted">Cumulative requests recorded for this user.</p>
            </MetricCard>
            <MetricCard
              label="Top route"
              value={topRoute ? topRoute[0] : 'No route data yet'}
              accent={topRoute ? `${topRoute[1]} requests` : 'Awaiting activity'}
            >
              <p className="muted">Highest-volume route in the current usage snapshot.</p>
            </MetricCard>
            <MetricCard
              label="Bootstrap recovery"
              value={
                bootstrap
                  ? `${bootstrap.succeeded} succeeded / ${bootstrap.failed} failed`
                  : 'Loading'
              }
              accent={
                bootstrap
                  ? `${bootstrap.attempted} attempts · ${bootstrap.turnstileRefreshed} refreshes`
                  : 'Browser recovery telemetry'
              }
            >
              <p className="muted">
                Manual browser-session recovery outcomes from the account page.
              </p>
            </MetricCard>
          </div>

          <div className="two-col">
            <div className="stack">
              <Card
                title="Route activity"
                subtitle="Live route counts from the current worker-backed usage snapshot."
              >
                {routeEntries.length ? (
                  <div className="table-scroll">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Route</th>
                          <th>Requests</th>
                          <th>Posture</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routeEntries.map(([route, count]) => (
                          <tr key={route}>
                            <td>{route}</td>
                            <td>{count}</td>
                            <td>
                              <Badge tone={count === topRoute?.[1] ? 'warn' : 'neutral'}>
                                {count === topRoute?.[1] ? 'Highest volume' : 'Observed'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">No route activity has been recorded yet.</p>
                )}
              </Card>
            </div>

            <aside className="stack">
              <Card
                title="Browser bootstrap history"
                subtitle="Recovery telemetry dual-written to Cloudflare analytics and the usage snapshot."
              >
                <DefinitionList
                  entries={[
                    {
                      term: 'Last outcome',
                      description: bootstrap?.lastOutcome ?? 'None recorded',
                    },
                    {
                      term: 'Last event',
                      description: formatDateTime(bootstrap?.lastEventAt ?? null),
                    },
                    {
                      term: 'Last activity',
                      description: formatDateTime(usageQuery.data?.lastSeenAt ?? null),
                    },
                    {
                      term: 'Turnstile refreshes',
                      description: bootstrap ? String(bootstrap.turnstileRefreshed) : '0',
                    },
                  ]}
                />
              </Card>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
