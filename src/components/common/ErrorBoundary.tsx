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
        <div className="min-h-screen bg-[#0f172a] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 text-center shadow-2xl">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Aether could not start</h2>
            <p className="text-sm text-slate-400 mb-4">
              An unexpected renderer error occurred. Restart the application or review the application logs.
            </p>
            {this.state.error?.message && (
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs font-mono text-rose-300 text-left overflow-x-auto mb-4">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg transition-colors"
            >
              Restart Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
