import React from 'react';
import ErrorBoundary from './ErrorBoundary';

const ThrowingChild: React.FC = () => {
  throw new Error('smoke render failure');
};

export const ErrorBoundarySmoke: React.FC = () => (
  <ErrorBoundary fallbackTitle="Smoke fallback">
    <ThrowingChild />
  </ErrorBoundary>
);
