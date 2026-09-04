import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidMount() {
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    // Log only. Unhandled rejections also come from browser extensions (MetaMask, wallets, ad blockers)
    // and must not take down the app; every Supabase call in the app checks its own error.
    console.error('Unhandled promise rejection:', event.reason);
  };

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '400px', padding: '2rem',
          textAlign: 'center', color: 'var(--text-muted)',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--danger-light)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', marginBottom: '1rem',
          }}>
            !
          </div>
          <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>
            Something went wrong
          </h3>
          <p style={{ marginBottom: '1rem', maxWidth: 400, fontSize: '0.9rem' }}>
            {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: 8,
              background: 'var(--primary)', color: 'var(--text)',
              border: 'none', cursor: 'pointer', fontWeight: 600,
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
