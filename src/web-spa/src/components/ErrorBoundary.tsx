import React from 'react';
import { stackClass } from '../lib/workspace-classes';
import { Button, ButtonLink, Card, InlineGroup, StatusBanner } from './ui';

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
      <div className={stackClass}>
        <Card
          title="Something went wrong"
          subtitle="An unexpected error occurred. You can try again or return to the workspace overview."
        >
          <StatusBanner
            role="alert"
            message={this.state.error?.message || 'An unknown error occurred.'}
            type="error"
          />
          <InlineGroup>
            <Button onClick={() => this.setState({ hasError: false, error: null })}>
              Try again
            </Button>
            <ButtonLink href="/app" variant="secondary">
              Go to Workspace Overview
            </ButtonLink>
          </InlineGroup>
        </Card>
      </div>
    );
  }
}
