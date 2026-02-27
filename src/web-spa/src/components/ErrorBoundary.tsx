import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="stack" style={{ padding: '32px', maxWidth: '600px', margin: '0 auto' }}>
        <section className="ui-card">
          <h2>Something went wrong</h2>
          <p className="muted">
            An unexpected error occurred. You can try again or return to the dashboard.
          </p>
          <div className="status error" role="alert">
            {this.state.error?.message || 'An unknown error occurred.'}
          </div>
          <div className="row" style={{ marginTop: '16px' }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
            <a href="/app/onboarding" className="btn secondary">
              Go to Dashboard
            </a>
          </div>
        </section>
      </div>
    );
  }
}
