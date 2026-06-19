import React from 'react';
import { trackError } from '../services/telemetry';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Unhandled render error', {
      error,
      componentStack: errorInfo.componentStack,
    });

    trackError(error, 'ErrorBoundary', ['react', 'render']);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section className="error-boundary" role="alert" aria-live="assertive">
        <div className="error-boundary__panel">
          <p className="error-boundary__eyebrow">Application error</p>
          <h1 className="error-boundary__title">
            {this.props.fallbackTitle ?? 'Something went wrong'}
          </h1>
          <p className="error-boundary__message">
            The workspace hit an unexpected rendering problem. You can retry the
            current view or reload the app.
          </p>
          <div className="error-boundary__actions">
            <button className="btn btn-primary" type="button" onClick={this.handleRetry}>
              Retry
            </button>
            <button className="btn btn-secondary" type="button" onClick={this.handleReload}>
              Reload app
            </button>
          </div>
        </div>
      </section>
    );
  }
}

export default ErrorBoundary;
