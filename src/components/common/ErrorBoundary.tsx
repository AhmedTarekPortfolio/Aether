import { Component, ErrorInfo, ReactNode } from 'react';
import { EmptyState } from '../ui/EmptyState';
import { logger } from '../../services/logger';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Uncaught React Component Error Boundary Catch', error, { componentStack: errorInfo.componentStack });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center p-6">
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8 text-[var(--accent-rose)]" />}
            title="Something Went Wrong"
            description="Aether encountered an unexpected application runtime error. Your local IndexedDB state remains safe."
            actionLabel="Reload Application"
            onAction={() => window.location.reload()}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
