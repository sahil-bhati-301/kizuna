import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearState } from './persistence';
import { errorMessage } from './format';

interface Props {
  children: ReactNode;
}

interface State {
  error: unknown;
  /** Bumped to remount the app after "Try again". */
  epoch: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, epoch: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error ?? new Error('Unknown error') };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[kizuna] UI error', error, info.componentStack);
  }

  private retry = () => this.setState((s) => ({ error: null, epoch: s.epoch + 1 }));

  private resetAll = () => {
    clearState();
    this.retry();
  };

  render() {
    const { error, epoch } = this.state;
    if (!error) return <div key={epoch} className="app-root">{this.props.children}</div>;
    const stack = error instanceof Error ? error.stack : undefined;
    return (
      <main className="app-root crash" role="alert">
        <div className="card crash-card">
          <div className="crash-knot" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="64" height="64">
              <path
                d="M6 40 C 20 40, 22 14, 34 18 C 46 22, 30 44, 22 34 C 14 24, 44 20, 58 26"
                fill="none"
                stroke="var(--thread)"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1>We hit a knot</h1>
          <p className="lead">Something went wrong while running Kizuna. Your saved progress is untouched unless you reset.</p>
          <pre className="crash-message">{errorMessage(error)}</pre>
          {stack && (
            <details className="crash-stack">
              <summary>Technical details</summary>
              <pre>{stack}</pre>
            </details>
          )}
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={this.retry}>
              Back to start
            </button>
            <button type="button" className="btn btn-ghost" onClick={this.resetAll}>
              Reset everything
            </button>
          </div>
        </div>
      </main>
    );
  }
}
