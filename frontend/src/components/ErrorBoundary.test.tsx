import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from './ErrorBoundary';

vi.mock('../services/telemetry', () => ({
  trackError: vi.fn(),
}));

function ThrowingChild() {
  throw new Error('Test error');
}

function SafeChild() {
  return <div>Child content</div>;
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <SafeChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeDefined();
  });

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText(/unexpected error occurred/)).toBeDefined();
  });

  it('shows Try again and Reload page buttons', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Try again')).toBeDefined();
    expect(screen.getByText('Reload page')).toBeDefined();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom fallback')).toBeDefined();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('calls onReset when Try again is clicked', () => {
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingChild />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText('Try again'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('reports error to telemetry', async () => {
    const telemetry = await import('../services/telemetry');
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(telemetry.trackError).toHaveBeenCalled();
  });
});
