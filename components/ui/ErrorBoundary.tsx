import { Component, type ReactNode } from 'react';

import { ErrorState } from '@/components/ui/ErrorState';

type ErrorBoundaryProps = {
  /** Shown in the fallback so the user knows what failed. */
  label?: string;
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches render-time errors in a screen subtree and shows a recoverable
 * ErrorState instead of taking down the whole app. "Try again" clears the
 * error and re-renders the children (data fixes itself on the next fetch in
 * most data-shape crashes).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (__DEV__) {
      console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error);
    }
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          message={
            this.props.label
              ? `Something went wrong showing ${this.props.label}. ${this.state.error.message}`
              : this.state.error.message
          }
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}
