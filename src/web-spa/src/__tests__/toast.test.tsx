import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ToastProvider, useToast } from '../components/Toast';

function TestConsumer(): React.JSX.Element {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast('Success!', 'ok')}>Show OK</button>
      <button onClick={() => toast('Error!', 'error')}>Show Error</button>
      <button onClick={() => toast('Info')}>Show Info</button>
    </div>
  );
}

describe('Toast system', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing initially', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    expect(screen.queryByText('Success!')).toBeNull();
  });

  it('shows toast when triggered', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    await user.click(screen.getByText('Show OK'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
  });

  it('applies correct CSS class for type', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    await user.click(screen.getByText('Show Error'));
    const toast = screen.getByText('Error!').closest('.toast');
    expect(toast?.className).toContain('toast-error');
  });

  it('defaults to info type', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    await user.click(screen.getByText('Show Info'));
    const toast = screen.getByText('Info').closest('.toast');
    expect(toast?.className).toContain('toast-info');
  });

  it('auto-dismisses after 4 seconds', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    await user.click(screen.getByText('Show OK'));
    expect(screen.getByText('Success!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByText('Success!')).toBeNull();
  });

  it('can be manually dismissed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    await user.click(screen.getByText('Show OK'));
    expect(screen.getByText('Success!')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Dismiss notification'));
    expect(screen.queryByText('Success!')).toBeNull();
  });

  it('shows multiple toasts', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    await user.click(screen.getByText('Show OK'));
    await user.click(screen.getByText('Show Error'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
    expect(screen.getByText('Error!')).toBeInTheDocument();
  });

  it('throws when useToast is used outside provider', () => {
    function BadComponent(): React.JSX.Element {
      useToast();
      return <div />;
    }
    expect(() => render(<BadComponent />)).toThrow('useToast must be used within ToastProvider');
  });
});
