import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';
import { logger } from '../../../services/logger';

const ThrowingComponent: React.FC = () => {
  throw new Error('Test runtime error');
};

describe('ErrorBoundary Component', () => {
  it('renders fallback EmptyState UI when a child component throws an uncaught error', () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something Went Wrong')).toBeInTheDocument();
    expect(
      screen.getByText(/Aether encountered an unexpected application runtime error/i)
    ).toBeInTheDocument();

    expect(loggerSpy).toHaveBeenCalled();
    loggerSpy.mockRestore();
  });
});
