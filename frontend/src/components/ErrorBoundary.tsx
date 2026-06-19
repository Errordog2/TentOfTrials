import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console for development — can be wired to production telemetry later
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div style={containerStyle}>
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 600 }}>
                Something went wrong
              </h2>
              <p style={{ margin: '0 0 20px', color: '#666', fontSize: '14px', lineHeight: 1.5 }}>
                An unexpected error occurred while rendering this page.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  onClick={this.handleRetry}
                  style={buttonStyle}
                >
                  Try Again
                </button>
                <button
                  onClick={this.handleReload}
                  style={{ ...buttonStyle, background: '#e2e8f0', color: '#333' }}
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: '20px',
  backgroundColor: '#f8f9fa',
  boxSizing: 'border-box',
};

const cardStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px 48px',
  maxWidth: '420px',
  background: '#fff',
  borderRadius: '12px',
  boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 24px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#fff',
  background: '#4f46e5',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
};

export default ErrorBoundary;
export type { ErrorBoundaryProps, ErrorBoundaryState };
