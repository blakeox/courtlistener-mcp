import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import './styles.css';

function redirectRecoveryHashToResetPage(): void {
  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!rawHash) return;
  const params = new URLSearchParams(rawHash);
  const flowType = (params.get('type') || '').trim().toLowerCase();
  const accessToken = (params.get('access_token') || '').trim();
  if (flowType !== 'recovery' || !accessToken) return;
  if (window.location.pathname === '/app/reset-password') return;
  window.location.replace(`/app/reset-password#${rawHash}`);
}

redirectRecoveryHashToResetPage();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing root element');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
