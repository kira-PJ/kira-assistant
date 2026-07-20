import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — Catches render errors in child components
 * and shows a recovery UI instead of a blank screen.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <p className="text-[14px] font-medium text-ghost-danger mb-2">
            Something went wrong{this.props.fallbackLabel ? ` in ${this.props.fallbackLabel}` : ''}
          </p>
          <p className="text-[12px] text-ghost-text-dim mb-4 max-w-xs">
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-[12px] px-4 py-1.5 rounded border border-ghost-border text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
