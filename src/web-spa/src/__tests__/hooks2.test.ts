import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';

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

// useColorScheme needs special handling due to matchMedia
describe('useColorScheme', () => {
  let mockLocal: Storage;

  beforeEach(() => {
    mockLocal = createStorageMock();
    vi.stubGlobal('localStorage', mockLocal);
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? false : true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    document.documentElement.removeAttribute('data-theme');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to light when no stored preference and system is light', async () => {
    const { useColorScheme } = await import('../hooks/useColorScheme');
    const { result } = renderHook(() => useColorScheme());
    expect(result.current.scheme).toBe('light');
    expect(result.current.isSystem).toBe(true);
  });

  it('reads stored preference from localStorage', async () => {
    localStorage.setItem('clmcp_color_scheme', 'dark');
    const { useColorScheme } = await import('../hooks/useColorScheme');
    const { result } = renderHook(() => useColorScheme());
    expect(result.current.scheme).toBe('dark');
    expect(result.current.isSystem).toBe(false);
  });

  it('toggle switches scheme', async () => {
    const { useColorScheme } = await import('../hooks/useColorScheme');
    const { result } = renderHook(() => useColorScheme());
    expect(result.current.scheme).toBe('light');
    act(() => result.current.toggle());
    expect(result.current.scheme).toBe('dark');
    expect(localStorage.getItem('clmcp_color_scheme')).toBe('dark');
  });

  it('sets data-theme attribute on document', async () => {
    const { useColorScheme } = await import('../hooks/useColorScheme');
    renderHook(() => useColorScheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('useKeyboardShortcut', () => {
  it('calls handler on matching key with modifier', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut('Enter', handler));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler without modifier', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut('Enter', handler));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call handler on wrong key', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut('Enter', handler));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', metaKey: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('respects disabled option', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut('Enter', handler, { disabled: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('respects meta modifier requirement', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcut('k', handler, { meta: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(handler).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('cleans up listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcut('Enter', handler));
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useRateLimitBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts unblocked', async () => {
    const { useRateLimitBackoff } = await import('../hooks/useRateLimitBackoff');
    const { result } = renderHook(() => useRateLimitBackoff());
    expect(result.current.blocked).toBe(false);
    expect(result.current.secondsLeft).toBe(0);
  });

  it('trigger with retry_after_seconds activates countdown', async () => {
    const { useRateLimitBackoff } = await import('../hooks/useRateLimitBackoff');
    const { result } = renderHook(() => useRateLimitBackoff());
    act(() => result.current.trigger({ retry_after_seconds: 3, status: 429 }));
    expect(result.current.blocked).toBe(true);
    expect(result.current.secondsLeft).toBe(3);
  });

  it('countdown decrements to zero', async () => {
    const { useRateLimitBackoff } = await import('../hooks/useRateLimitBackoff');
    const { result } = renderHook(() => useRateLimitBackoff());
    act(() => result.current.trigger({ retry_after_seconds: 2, status: 429 }));
    expect(result.current.secondsLeft).toBe(2);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.secondsLeft).toBe(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.blocked).toBe(false);
  });

  it('ignores errors without retry_after_seconds', async () => {
    const { useRateLimitBackoff } = await import('../hooks/useRateLimitBackoff');
    const { result } = renderHook(() => useRateLimitBackoff());
    act(() => result.current.trigger({ status: 500, message: 'Server error' }));
    expect(result.current.blocked).toBe(false);
  });

  it('ignores null/undefined errors', async () => {
    const { useRateLimitBackoff } = await import('../hooks/useRateLimitBackoff');
    const { result } = renderHook(() => useRateLimitBackoff());
    act(() => result.current.trigger(null));
    expect(result.current.blocked).toBe(false);
    act(() => result.current.trigger(undefined));
    expect(result.current.blocked).toBe(false);
  });
});

describe('useSessionHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call getSession when disabled', async () => {
    const mockGetSession = vi.fn().mockResolvedValue({ authenticated: true, user: { id: 'u1' } });
    vi.doMock('../lib/api', () => ({ getSession: mockGetSession }));
    const { useSessionHeartbeat } = await import('../hooks/useSessionHeartbeat');
    const onExpired = vi.fn();
    renderHook(() => useSessionHeartbeat(1000, { enabled: false, onExpired }));
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
    vi.doUnmock('../lib/api');
  });

  it('calls getSession on interval when enabled', async () => {
    const mockGetSession = vi.fn().mockResolvedValue({ authenticated: true, user: { id: 'u1' } });
    vi.doMock('../lib/api', () => ({ getSession: mockGetSession }));
    const { useSessionHeartbeat } = await import('../hooks/useSessionHeartbeat');
    const onExpired = vi.fn();
    renderHook(() => useSessionHeartbeat(1000, { enabled: true, onExpired }));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mockGetSession).toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
    vi.doUnmock('../lib/api');
  });

  it('calls onExpired when session becomes unauthenticated', async () => {
    const mockGetSession = vi.fn().mockResolvedValue({ authenticated: false, user: null });
    vi.doMock('../lib/api', () => ({ getSession: mockGetSession }));
    const { useSessionHeartbeat } = await import('../hooks/useSessionHeartbeat');
    const onExpired = vi.fn();
    renderHook(() => useSessionHeartbeat(1000, { enabled: true, onExpired }));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(onExpired).toHaveBeenCalledTimes(1);
    vi.doUnmock('../lib/api');
  });

  it('handles network errors gracefully', async () => {
    const mockGetSession = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.doMock('../lib/api', () => ({ getSession: mockGetSession }));
    const { useSessionHeartbeat } = await import('../hooks/useSessionHeartbeat');
    const onExpired = vi.fn();
    renderHook(() => useSessionHeartbeat(1000, { enabled: true, onExpired }));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mockGetSession).toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
    vi.doUnmock('../lib/api');
  });

  it('cleans up interval on unmount', async () => {
    const mockGetSession = vi.fn().mockResolvedValue({ authenticated: true, user: { id: 'u1' } });
    vi.doMock('../lib/api', () => ({ getSession: mockGetSession }));
    const { useSessionHeartbeat } = await import('../hooks/useSessionHeartbeat');
    const onExpired = vi.fn();
    const { unmount } = renderHook(() => useSessionHeartbeat(1000, { enabled: true, onExpired }));
    unmount();
    await act(async () => { vi.advanceTimersByTime(3000); });
    // Only called once at most (for any tick before unmount)
    expect(mockGetSession.mock.calls.length).toBeLessThanOrEqual(1);
    vi.doUnmock('../lib/api');
  });
});
