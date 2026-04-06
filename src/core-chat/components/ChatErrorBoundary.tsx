'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <AlertTriangle className="text-red-500" size={32} />
          <div>
            <h2 className="text-base font-semibold text-(--text-primary)">Something went wrong</h2>
            <p className="text-sm text-(--text-tertiary) mt-1">
              {this.state.error?.message ?? 'An unexpected error occurred in the chat.'}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-(--surface-secondary) text-sm text-(--text-primary) hover:bg-(--surface-tertiary) transition-colors"
          >
            <RotateCcw size={14} />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
