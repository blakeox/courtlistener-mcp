import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { TokenProvider } from '../lib/token-context';
import { ToastProvider } from '../components/Toast';

export function createStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

export function stubBrowserStorage(): void {
  vi.stubGlobal('localStorage', createStorageMock());
  vi.stubGlobal('sessionStorage', createStorageMock());
}

export function createMatchMediaMock(
  matches: boolean | ((query: string) => boolean) = false,
): typeof window.matchMedia {
  return ((query: string) => ({
    matches: typeof matches === 'function' ? matches(query) : matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
}

export function createControlledMatchMediaMock(initialMatches = false): {
  matchMedia: typeof window.matchMedia;
  setMatches: (matches: boolean) => void;
} {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  return {
    matchMedia: ((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia,
    setMatches: (nextMatches: boolean) => {
      matches = nextMatches;
      const event = { matches: nextMatches } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

export function renderWithSpaProviders(
  ui: React.ReactElement,
  options: {
    initialEntries?: string[];
    includeQueryClient?: boolean;
    includeRouter?: boolean;
    includeTokenProvider?: boolean;
    includeToastProvider?: boolean;
  } = {},
): RenderResult {
  const {
    initialEntries = ['/'],
    includeQueryClient = true,
    includeRouter = true,
    includeTokenProvider = false,
    includeToastProvider = false,
  } = options;

  let wrapped = ui;

  if (includeToastProvider) {
    wrapped = <ToastProvider>{wrapped}</ToastProvider>;
  }

  if (includeTokenProvider) {
    wrapped = <TokenProvider>{wrapped}</TokenProvider>;
  }

  if (includeRouter) {
    wrapped = <MemoryRouter initialEntries={initialEntries}>{wrapped}</MemoryRouter>;
  }

  if (includeQueryClient) {
    wrapped = <QueryClientProvider client={createTestQueryClient()}>{wrapped}</QueryClientProvider>;
  }

  return render(wrapped);
}
