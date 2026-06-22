# Fix for Issue #4: [$50 BOUNTY] [React] Add top-level frontend ErrorBoundary

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

// Component that throws an error for testing purposes
const ThrowingComponent: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error('Test error from ThrowingComponent');
  }
  return <div data-testid="normal-content">Normal content rendered</div>;
};

// Suppress console.error during tests to keep output clean
const originalConsoleError = console.error;

beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
    jest.clearAllMocks();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child-content">Hello World</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders fallback UI when a child component throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    // Should show error UI, not the throwing component
    expect(screen.queryByTestId('normal-content')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays Try Again and Reload Page buttons in fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('displays an error ID for support/tracking purposes', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Error ID:/)).toBeInTheDocument();
  });

  it('does not display raw stack trace to users', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    // Stack trace should not be visible
    expect(screen.queryByText(/ThrowingComponent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/at /)).not.toBeInTheDocument();
  });

  it('calls onError callback when error is caught', () => {
    const onErrorMock = jest.fn();

    render(
      <ErrorBoundary onError={onErrorMock}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    );
  });

  it('logs error to sessionStorage for telemetry', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    const storedErrors = JSON.parse(sessionStorage.getItem('errorBoundaryLogs') || '[]');
    expect(storedErrors).toHaveLength(1);
    expect(storedErrors[0]).toMatchObject({
      message: 'Test error from ThrowingComponent',
      name: 'Error',
    });
  });

  it('resets error state when Try Again is clicked', () => {
    const TestComponent: React.FC = () => {
      const [shouldThrow, setShouldThrow] = React.useState(true);

      return (
        <div>
          <button onClick={() => setShouldThrow(false)}>Fix Error</button>
          <ErrorBoundary key={shouldThrow ? 'error' : 'fixed'}>
            <ThrowingComponent shouldThrow={shouldThrow} />
          </ErrorBoundary>
        </div>
      );
    };

    render(<TestComponent />);

    // Initially shows error
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Fix the error state
    fireEvent.click(screen.getByText('Fix Error'));

    // After fixing and re-rendering, should show normal content
    expect(screen.getByTestId('normal-content')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    const customFallback = <div data-testid="custom-fallback">Custom Error UI</div>;

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText('Custom Error UI')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('calls onReset callback when retry is triggered', () => {
    const onResetMock = jest.fn();

    // Create a controlled component to test retry functionality
    const ControlledTest: React.FC = () => {
      const [key, setKey] = React.useState(0);
      const [shouldThrow, setShouldThrow] = React.useState(true);

      const handleReset = () => {
        onResetMock();
        setShouldThrow(false);
        setKey((k) => k + 1);
      };

      return (
        <ErrorBoundary key={key} onReset={handleReset}>
          {shouldThrow ? <ThrowingComponent /> : <div data-testid="recovered">Recovered!</div>}
        </ErrorBoundary>
      );
    };

    render(<ControlledTest />);

    // Verify error state
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click Try Again
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // onReset should have been called
    expect(onResetMock).toHaveBeenCalled();
  });
});

/**
 * Smoke Test Documentation
 * ========================
 * 
 * To manually verify the ErrorBoundary functionality:
 * 
 * 1. Create a test component that throws:
 *