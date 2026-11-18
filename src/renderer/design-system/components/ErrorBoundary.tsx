import { Component, type ReactNode } from "react";
import { InlineError } from "./EmptyState";
import { Button } from "./Button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing this clears a previous error (e.g., switching tabs or resources). */
  resetKey?: string;
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps one broken view from taking the whole window down to a black screen.
 * A render error (bad API field, unexpected object where a string was expected)
 * shows an inline error with the message and a retry instead of unmounting the
 * React root.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown): void {
    console.error("[mLens] view render failed", error, info);
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-3">
        <InlineError
          title={this.props.title ?? "This view failed to render"}
          message={this.state.error.message}
          action={
            <Button size="xs" variant="secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }
}
