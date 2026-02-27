import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

describe('useRateLimitBackoff integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-trigger during countdown resets to new value', async () => {
    const { useRateLimitBackoff } = await import('../hooks/useRateLimitBackoff');
    const { result } = renderHook(() => useRateLimitBackoff());
    act(() => result.current.trigger({ retry_after_seconds: 5, status: 429 }));
    expect(result.current.secondsLeft).toBe(5);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.secondsLeft).toBe(3);
    // Re-trigger with new value
    act(() => result.current.trigger({ retry_after_seconds: 10, status: 429 }));
    expect(result.current.secondsLeft).toBe(10);
  });

  it('fractional retry_after_seconds rounds up', async () => {
    const { useRateLimitBackoff } = await import('../hooks/useRateLimitBackoff');
    const { result } = renderHook(() => useRateLimitBackoff());
    act(() => result.current.trigger({ retry_after_seconds: 2.3, status: 429 }));
    expect(result.current.secondsLeft).toBe(3);
  });
});

describe('useSessionHeartbeat integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call with zero interval', async () => {
    const mockGetSession = vi.fn().mockResolvedValue({ authenticated: true, user: { id: 'u1' } });
    vi.doMock('../lib/api', () => ({ getSession: mockGetSession }));
    const { useSessionHeartbeat } = await import('../hooks/useSessionHeartbeat');
    const onExpired = vi.fn();
    renderHook(() => useSessionHeartbeat(0, { enabled: true, onExpired }));
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(mockGetSession).not.toHaveBeenCalled();
    vi.doUnmock('../lib/api');
  });

  it('does not call with negative interval', async () => {
    const mockGetSession = vi.fn().mockResolvedValue({ authenticated: true, user: { id: 'u1' } });
    vi.doMock('../lib/api', () => ({ getSession: mockGetSession }));
    const { useSessionHeartbeat } = await import('../hooks/useSessionHeartbeat');
    const onExpired = vi.fn();
    renderHook(() => useSessionHeartbeat(-1000, { enabled: true, onExpired }));
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(mockGetSession).not.toHaveBeenCalled();
    vi.doUnmock('../lib/api');
  });
});
