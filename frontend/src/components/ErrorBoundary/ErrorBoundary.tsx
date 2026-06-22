# Fix for Issue #4: [$50 BOUNTY] [React] Add top-level frontend ErrorBoundary

import React, { Component, ErrorInfo, ReactNode } from 'react';

/**
 * Props for the ErrorBoundary component
 */
export interface ErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode;
  /** Optional custom fallback UI component */
  fallback?: ReactNode;
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional custom error logging function for telemetry */
  logError?: (error: Error, errorInfo: ErrorInfo) => void;
}

/**
 * State for the ErrorBoundary component
 */
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

/**
 * Generates a unique error ID for tracking/support purposes
 */
const generateErrorId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `ERR-${timestamp}-${randomPart}`.toUpperCase();
};

/**
 * Default error logging function that can be wired to telemetry later
 */
const defaultLogError = (error: Error, errorInfo: ErrorInfo, errorId: string): void => {
  // Structure error data for telemetry integration
  const errorReport = {
    errorId,
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    componentStack: errorInfo.componentStack,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    url: typeof window !== 'undefined' ? window.location.href : 'unknown',
  };

  // Log to console in development, can be extended to send to telemetry service
  console.error('[ErrorBoundary] Captured error:', errorReport);

  // Store in sessionStorage for potential recovery/debugging
  try {
    const existingErrors = JSON.parse(sessionStorage.getItem('errorBoundaryLogs') || '[]');
    existingErrors.push(errorReport);
    // Keep only last 10 errors to prevent storage bloat
    const trimmedErrors = existingErrors.slice(-10);
    sessionStorage.setItem('errorBoundaryLogs', JSON.stringify(trimmedErrors));
  } catch {
    // Silently fail if sessionStorage is unavailable
  }
};

/**
 * ErrorBoundary - A reusable React error boundary component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: generateErrorId(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError, logError } = this.props;
    const { errorId } = this.state;

    // Use custom log function if provided, otherwise use default
    if (logError) {
      logError(error, errorInfo);
    } else {
      defaultLogError(error, errorInfo, errorId || 'UNKNOWN');
    }

    // Call optional error callback
    if (onError) {
      onError(error, errorInfo);
    }
  }

  /**
   * Attempts to recover by resetting error state
   */
  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorId: null,
    });
  };

  /**
   * Performs a full page reload
   */
  handleReload = (): void => {
    window.location.reload();
  };

  /**
   * Copies error ID to clipboard for support purposes
   */
  handleCopyErrorId = async (): Promise<void> => {
    const { errorId } = this.state;
    if (errorId && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(errorId);
      } catch {
        // Silently fail if clipboard access is denied
      }
    }
  };

  render(): ReactNode {
    const { hasError, errorId } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default fallback UI
      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            backgroundColor: '#f8f9fa',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: '500px',
              padding: '2rem',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
              textAlign: 'center',
            }}
          >
            {/* Error Icon */}
            <div
              style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 1.5rem',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#dc2626"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h1
              style={{
                margin: '0 0 0.5rem',
                fontSize: '1.5rem',
                fontWeight: 600,
                color: '#1f2937',
              }}
            >
              Something went wrong
            </h1>

            <p
              style={{
                margin: '0 0 1.5rem',
                fontSize: '1rem',
                color: '#6b7280',
                lineHeight: 1.5,
              }}
            >
              We encountered an unexpected error. Please try again or reload the page.
            </p>

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={this.handleRetry}
                style={{
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#ffffff',
                  backgroundColor: '#3b82f6',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
              >
                Try Again
              </button>

              <button
                onClick={this.handleReload}
                style={{
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  backgroundColor: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
              >
                Reload Page
              </button>
            </div>

            {/* Error ID for support */}
            {errorId && (
              <div
                style={{
                  marginTop: '1.5rem',
                  padding: '0.75rem',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '4px',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.75rem',
                    color: '#6b7280',
                  }}
                >
                  Error ID:{' '}
                  <code
                    style={{
                      fontFamily: 'monospace',
                      color: '#374151',
                      cursor: 'pointer',
                    }}
                    onClick={this.handleCopyErrorId}
                    title="Click to copy"
                  >
                    {errorId}
                  </code>
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;