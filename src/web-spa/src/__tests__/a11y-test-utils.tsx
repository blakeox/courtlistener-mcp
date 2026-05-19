import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TokenProvider } from '../lib/token-context';
import { ToastProvider } from '../components/Toast';
import { Shell } from '../components/Shell';
import { createTestQueryClient } from './test-utils';

export function renderWithSpaProviders(
  ui: React.ReactElement,
  options?: { route?: string },
): RenderResult {
  const route = options?.route ?? '/';
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <TokenProvider>
          <ToastProvider>{ui}</ToastProvider>
        </TokenProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export function renderWorkspaceRoute(page: React.ReactElement, route: string): RenderResult {
  return renderWithSpaProviders(
    <Shell>
      <Routes>
        <Route path={route} element={page} />
      </Routes>
    </Shell>,
    { route },
  );
}
