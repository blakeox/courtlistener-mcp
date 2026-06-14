import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { LandingPage } from '../pages/LandingPage';
import { WorkspaceDashboardPage } from '../pages/WorkspaceDashboardPage';
import { PlaygroundPage } from '../pages/PlaygroundPage';
import { AccountPage } from '../pages/AccountPage';
import { UsagePage } from '../pages/UsagePage';
import { ObservabilityPage } from '../pages/ObservabilityPage';
import { OnboardingPage } from '../pages/OnboardingPage';
import { renderWithSpaProviders, renderWorkspaceRoute } from './a11y-test-utils';
import { createMatchMediaMock, stubBrowserStorage } from './test-utils';

vi.mock('../lib/api', () => ({
  getSession: vi
    .fn()
    .mockResolvedValue({ authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' }),
  getUsage: vi.fn().mockResolvedValue({
    userId: 'u1',
    totalRequests: 12,
    dailyRequests: 3,
    currentDay: '2026-05-18',
    lastSeenAt: '2026-05-18T12:00:00.000Z',
    byRoute: { '/mcp': 8 },
    browserBootstrap: {
      attempted: 1,
      succeeded: 1,
      failed: 0,
      turnstileRefreshed: 0,
      lastOutcome: 'success',
      lastEventAt: '2026-05-18T11:00:00.000Z',
    },
  }),
  getWorkerHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    service: 'courtlistener-mcp',
    transport: 'cloudflare-agents-streamable-http',
    cloudflare: {
      analytics_enabled: true,
      async_queue_configured: true,
      async_jobs_kv_configured: true,
      turnstile_enforced_routes: [],
    },
    metrics: { latency_ms: { p50: 120 } },
    session_topology: {
      version: 'v1',
      shard_count: 4,
      idle_ttl_ms: 1800000,
      absolute_ttl_ms: 43200000,
      eviction_sweep_limit: 100,
    },
  }),
  listKeys: vi.fn().mockResolvedValue({ user_id: 'u1', keys: [] }),
  logout: vi.fn().mockResolvedValue(undefined),
  bootstrapSession: vi.fn().mockResolvedValue({
    ok: true,
    userId: 'u1',
    expiresInSeconds: 43200,
  }),
  postUiTelemetryEvent: vi.fn().mockResolvedValue(undefined),
  createKey: vi.fn(),
  revokeKey: vi.fn(),
  mcpCall: vi.fn().mockResolvedValue({ body: {}, sessionId: 'sid' }),
  aiChat: vi.fn().mockResolvedValue({
    test_mode: true,
    fallback_used: false,
    mode: 'cheap',
    tool: 'search_cases',
    tool_reason: 'Default search',
    session_id: 'sid',
    ai_response: 'resp',
    mcp_result: {},
  }),
  aiPlain: vi.fn().mockResolvedValue({ ai_response: 'plain resp', mode: 'cheap' }),
  toErrorMessage: vi.fn().mockReturnValue('Error'),
}));

vi.mock('../lib/hosted-auth', () => ({
  buildHostedAuthStartHref: vi.fn().mockReturnValue('/auth/start?return_to=%2Fapp%2Faccount'),
  redirectToHostedAuth: vi.fn(),
}));

vi.mock('../lib/telemetry', () => ({
  trackEvent: vi.fn(),
  forwardUiTelemetryEvent: vi.fn(),
  markSignupStarted: vi.fn(),
  markFirstMcpSuccess: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  useAuth: vi.fn().mockReturnValue({
    session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: '' },
    loading: false,
    sessionReady: true,
    sessionError: '',
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../lib/turnstile', () => ({
  describeTurnstileStatus: vi.fn((status: string, error: string) => error || status),
  useTurnstileToken: vi.fn().mockReturnValue({
    enabled: false,
    status: 'disabled',
    token: '',
    error: '',
    containerRef: { current: null },
    refresh: vi.fn(),
  }),
}));

const tokensCssPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../styles/tokens.css',
);

describe('axe accessibility scans', () => {
  beforeEach(() => {
    stubBrowserStorage();
    vi.stubGlobal('matchMedia', createMatchMediaMock());
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('landing page has no detectable WCAG violations', async () => {
    const { container } = renderWithSpaProviders(<LandingPage />, { route: '/' });
    await screen.findByRole('heading', {
      name: 'Connect AI to the Law. Responsibly.',
      level: 1,
    });
    await expect(await axe(container)).toHaveNoViolations();
  });

  it('workspace dashboard has no detectable WCAG violations', async () => {
    const { container } = renderWorkspaceRoute(<WorkspaceDashboardPage />, '/app/control-center');
    await screen.findByRole('heading', { name: 'Overview', level: 1 });
    await expect(await axe(container)).toHaveNoViolations();
  });

  it('playground has no detectable WCAG violations', async () => {
    const { container } = renderWorkspaceRoute(<PlaygroundPage />, '/app/playground');
    await screen.findByRole('heading', { name: 'Playground', level: 1 });
    await expect(await axe(container)).toHaveNoViolations();
  });

  it('account page has no detectable WCAG violations', async () => {
    const { container } = renderWorkspaceRoute(<AccountPage />, '/app/account');
    await screen.findByRole('heading', { name: 'Account', level: 1 });
    await expect(await axe(container)).toHaveNoViolations();
  });

  it('usage page has no detectable WCAG violations', async () => {
    const { container } = renderWorkspaceRoute(<UsagePage />, '/app/usage');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Usage & History', level: 1 })).toBeVisible();
    });
    await expect(await axe(container)).toHaveNoViolations();
  });

  it('observability page has no detectable WCAG violations', async () => {
    const { container } = renderWorkspaceRoute(<ObservabilityPage />, '/app/observability');
    await screen.findByRole('heading', { name: 'Agent Observability', level: 1 });
    await expect(await axe(container)).toHaveNoViolations();
  });

  it('onboarding diagnostics page has no detectable WCAG violations', async () => {
    const { container } = renderWorkspaceRoute(<OnboardingPage />, '/app/onboarding');
    await screen.findByRole('heading', { name: 'Runtime Diagnostics', level: 1 });
    await expect(await axe(container)).toHaveNoViolations();
  });

  it('workspace chrome keeps muted and utility text above the unreadable floor', async () => {
    renderWorkspaceRoute(<WorkspaceDashboardPage />, '/app/control-center');
    await screen.findByRole('heading', { name: 'Overview', level: 1 });

    const utilityLabel = screen.getByText('Workspace utilities');
    const utilityLink = screen.getByRole('link', { name: 'Diagnostics' });
    const mutedCopy = screen.getByText('Your environment is fully agent-ready.');
    const topbarDescription = screen.getByText('Legacy overview route.');
    const tokensCss = readFileSync(tokensCssPath, 'utf8');
    const readRemToken = (name: string) => {
      const match = tokensCss.match(new RegExp(`${name}:\\s*([0-9.]+)rem;`));
      return match ? Number.parseFloat(match[1]) * 16 : Number.NaN;
    };

    expect(readRemToken('--text-base-sm')).toBeGreaterThanOrEqual(14);
    expect(readRemToken('--text-base-plus')).toBeGreaterThanOrEqual(16);
    expect(readRemToken('--text-md')).toBeGreaterThanOrEqual(16);

    expect(utilityLabel.className).toContain('text-[length:var(--text-base-plus)]');
    expect(utilityLink.className).toContain('sidebar-secondary-link');
    expect(mutedCopy.className).toContain('text-muted');
    expect(topbarDescription.className).toContain('text-[length:var(--text-md)]');
  });
});
