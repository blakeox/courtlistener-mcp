import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TokenProvider } from '../lib/token-context';
import { ToastProvider } from '../components/Toast';
import { createTestQueryClient, stubBrowserStorage } from './test-utils';

vi.mock('../lib/api', () => ({
  getUsage: vi.fn().mockResolvedValue({
    userId: 'u1',
    totalRequests: 17,
    dailyRequests: 4,
    currentDay: '2026-03-05',
    lastSeenAt: '2026-03-05T12:00:00.000Z',
    byRoute: {
      '/mcp': 11,
      '/api/ai-chat': 4,
      '/api/session/bootstrap': 2,
    },
    browserBootstrap: {
      attempted: 2,
      succeeded: 1,
      failed: 1,
      turnstileRefreshed: 3,
      lastOutcome: 'success',
      lastEventAt: '2026-03-05T11:59:00.000Z',
    },
  }),
  getWorkerHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    service: 'courtlistener-mcp',
    transport: 'cloudflare-agents-streamable-http',
    diagnostics: {
      cloudflare: {
        analytics_enabled: true,
        async_queue_configured: true,
        async_jobs_kv_configured: true,
        turnstile_enforced_routes: ['session_bootstrap', 'ai_chat'],
      },
      metrics: {
        latency_ms: {
          route_latency_ms: { '/mcp': { count: 4, avg_ms: 120 } },
          runtime_latency_ms: { queue_latency_ms: { count: 2, avg_ms: 40 } },
        },
      },
      session_topology: {
        version: 'v1',
        shard_count: 4,
        idle_ttl_ms: 1800000,
        absolute_ttl_ms: 43200000,
        eviction_sweep_limit: 100,
      },
    },
  }),
  toErrorMessage: vi.fn().mockReturnValue('Error'),
}));

vi.mock('../lib/auth', () => ({
  useAuth: vi.fn().mockReturnValue({
    session: { authenticated: true, user: { id: 'u1' }, turnstile_site_key: 'site-key-1' },
    loading: false,
    sessionReady: true,
    sessionError: '',
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <TokenProvider>
          <ToastProvider>{children}</ToastProvider>
        </TokenProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('monitoring pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubBrowserStorage();
  });

  it('renders live usage metrics and route activity on the usage page', async () => {
    const { UsagePage } = await import('../pages/UsagePage');
    render(<UsagePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Usage & History')).toBeTruthy();
      expect(screen.getByText('17')).toBeTruthy();
      expect(screen.getAllByText('/mcp').length).toBeGreaterThan(0);
      expect(screen.getByText('1 succeeded / 1 failed')).toBeTruthy();
      expect(screen.getByText('Turnstile refreshes')).toBeTruthy();
    });
  });

  it('renders live worker posture and Cloudflare controls on the observability page', async () => {
    const { ObservabilityPage } = await import('../pages/ObservabilityPage');
    render(<ObservabilityPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Agent Observability')).toBeTruthy();
      expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0);
      expect(screen.getByText('Queue bound')).toBeTruthy();
      expect(screen.getAllByText('session_bootstrap, ai_chat').length).toBeGreaterThan(0);
      expect(screen.getByText('route_latency_ms')).toBeTruthy();
      expect(screen.getByText('runtime_latency_ms')).toBeTruthy();
    });
  });
});
