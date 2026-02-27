import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStatus } from '../hooks/useStatus';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useElapsedTimer } from '../hooks/useElapsedTimer';

describe('useStatus', () => {
  it('starts with empty status', () => {
    const { result } = renderHook(() => useStatus());
    expect(result.current.status).toBe('');
    expect(result.current.statusType).toBe('info');
  });

  it('setOk sets status and type', () => {
    const { result } = renderHook(() => useStatus());
    act(() => result.current.setOk('Done!'));
    expect(result.current.status).toBe('Done!');
    expect(result.current.statusType).toBe('ok');
  });

  it('setError sets status and type', () => {
    const { result } = renderHook(() => useStatus());
    act(() => result.current.setError('Failed'));
    expect(result.current.status).toBe('Failed');
    expect(result.current.statusType).toBe('error');
  });

  it('setInfo sets status and type', () => {
    const { result } = renderHook(() => useStatus());
    act(() => result.current.setInfo('Loading...'));
    expect(result.current.status).toBe('Loading...');
    expect(result.current.statusType).toBe('info');
  });

  it('clear resets to empty', () => {
    const { result } = renderHook(() => useStatus());
    act(() => result.current.setOk('Done!'));
    act(() => result.current.clear());
    expect(result.current.status).toBe('');
    expect(result.current.statusType).toBe('info');
  });
});

describe('useDocumentTitle', () => {
  const originalTitle = document.title;

  afterEach(() => {
    document.title = originalTitle;
  });

  it('sets document title with suffix', () => {
    renderHook(() => useDocumentTitle('Keys'));
    expect(document.title).toBe('Keys — CourtListener MCP');
  });

  it('restores title on unmount', () => {
    document.title = 'Original';
    const { unmount } = renderHook(() => useDocumentTitle('Test'));
    expect(document.title).toBe('Test — CourtListener MCP');
    unmount();
    expect(document.title).toBe('Original');
  });

  it('handles empty title', () => {
    renderHook(() => useDocumentTitle(''));
    expect(document.title).toBe('CourtListener MCP Portal');
  });
});

describe('useNetworkStatus', () => {
  it('defaults to online', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.online).toBe(true);
  });

  it('responds to offline event', () => {
    const { result } = renderHook(() => useNetworkStatus());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.online).toBe(false);
  });

  it('responds to online event', () => {
    const { result } = renderHook(() => useNetworkStatus());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.online).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.online).toBe(true);
  });
});

describe('useElapsedTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at 0 when not running', () => {
    const { result } = renderHook(() => useElapsedTimer(false));
    expect(result.current).toBe(0);
  });

  it('increments when running', () => {
    const { result } = renderHook(() => useElapsedTimer(true));
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBeGreaterThan(0);
  });

  it('resets when stopped', () => {
    const { result, rerender } = renderHook(
      ({ running }) => useElapsedTimer(running),
      { initialProps: { running: true } },
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBeGreaterThan(0);
    rerender({ running: false });
    expect(result.current).toBe(0);
  });
});
