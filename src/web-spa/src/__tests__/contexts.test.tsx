import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// Token context tests need storage mocking
function createStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

describe('PlaygroundProvider', () => {
  it('provides initial empty state', async () => {
    const { PlaygroundProvider, usePlayground } = await import('../lib/playground-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlaygroundProvider token="test-token">{children}</PlaygroundProvider>
    );
    const { result } = renderHook(() => usePlayground(), { wrapper });
    expect(result.current.token).toBe('test-token');
    expect(result.current.tokenMissing).toBe(false);
    expect(result.current.transcript).toEqual([]);
    expect(result.current.mcpSessionId).toBe('');
    expect(result.current.lastRawMcp).toBe('');
  });

  it('tokenMissing is true for empty token', async () => {
    const { PlaygroundProvider, usePlayground } = await import('../lib/playground-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlaygroundProvider token="">{children}</PlaygroundProvider>
    );
    const { result } = renderHook(() => usePlayground(), { wrapper });
    expect(result.current.tokenMissing).toBe(true);
  });

  it('append adds to transcript', async () => {
    const { PlaygroundProvider, usePlayground } = await import('../lib/playground-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlaygroundProvider token="tok">{children}</PlaygroundProvider>
    );
    const { result } = renderHook(() => usePlayground(), { wrapper });
    act(() => result.current.append('user', 'Hello'));
    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0].role).toBe('user');
    expect(result.current.transcript[0].text).toBe('Hello');
  });

  it('clearTranscript empties transcript', async () => {
    const { PlaygroundProvider, usePlayground } = await import('../lib/playground-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlaygroundProvider token="tok">{children}</PlaygroundProvider>
    );
    const { result } = renderHook(() => usePlayground(), { wrapper });
    act(() => result.current.append('user', 'msg'));
    act(() => result.current.clearTranscript());
    expect(result.current.transcript).toEqual([]);
  });

  it('setMcpSessionId updates session', async () => {
    const { PlaygroundProvider, usePlayground } = await import('../lib/playground-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlaygroundProvider token="tok">{children}</PlaygroundProvider>
    );
    const { result } = renderHook(() => usePlayground(), { wrapper });
    act(() => result.current.setMcpSessionId('session-123'));
    expect(result.current.mcpSessionId).toBe('session-123');
  });

  it('setLastRawMcp updates raw MCP data', async () => {
    const { PlaygroundProvider, usePlayground } = await import('../lib/playground-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlaygroundProvider token="tok">{children}</PlaygroundProvider>
    );
    const { result } = renderHook(() => usePlayground(), { wrapper });
    act(() => result.current.setLastRawMcp('{"test": true}'));
    expect(result.current.lastRawMcp).toBe('{"test": true}');
  });

  it('throws when used outside provider', async () => {
    const { usePlayground } = await import('../lib/playground-context');
    expect(() => {
      renderHook(() => usePlayground());
    }).toThrow('usePlayground must be used within PlaygroundProvider');
  });
});

describe('TokenProvider', () => {
  let mockLocal: Storage;
  let mockSession: Storage;

  beforeEach(() => {
    mockLocal = createStorageMock();
    mockSession = createStorageMock();
    vi.stubGlobal('localStorage', mockLocal);
    vi.stubGlobal('sessionStorage', mockSession);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with empty token', async () => {
    const { TokenProvider, useToken } = await import('../lib/token-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TokenProvider>{children}</TokenProvider>
    );
    const { result } = renderHook(() => useToken(), { wrapper });
    expect(result.current.token).toBe('');
    expect(result.current.persisted).toBe(false);
  });

  it('setToken saves token persistently', async () => {
    const { TokenProvider, useToken } = await import('../lib/token-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TokenProvider>{children}</TokenProvider>
    );
    const { result } = renderHook(() => useToken(), { wrapper });
    act(() => result.current.setToken('my-token', true));
    expect(result.current.token).toBe('my-token');
    expect(result.current.persisted).toBe(true);
  });

  it('clear removes token', async () => {
    const { TokenProvider, useToken } = await import('../lib/token-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TokenProvider>{children}</TokenProvider>
    );
    const { result } = renderHook(() => useToken(), { wrapper });
    act(() => result.current.setToken('tok', true));
    act(() => result.current.clear());
    expect(result.current.token).toBe('');
    expect(result.current.persisted).toBe(false);
  });

  it('throws when used outside provider', async () => {
    const { useToken } = await import('../lib/token-context');
    expect(() => {
      renderHook(() => useToken());
    }).toThrow('useToken must be used within TokenProvider');
  });
});
