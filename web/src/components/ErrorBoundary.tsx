import { Component, type ErrorInfo, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';

type Props = WithTranslation & { children: ReactNode };
type State = { error: Error | null };

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the crash in the console for debugging; never silently blank the app.
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { t, children } = this.props;
    if (!error) return children;
    return (
      <main className="login-screen">
        <div className="login-card">
          <div className="mp-logo">M</div>
          <h1>{t('common.crash.title')}</h1>
          <p className="mp-muted">{t('common.crash.body')}</p>
          <pre className="mp-mono mp-wrap mp-crash-detail">{error.message}</pre>
          <div className="auth-links">
            <button className="mp-button dark" onClick={this.handleReset}>{t('common.crash.retry')}</button>
            <button className="mp-button" onClick={() => window.location.assign('/missions')}>{t('common.crash.home')}</button>
          </div>
        </div>
      </main>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner);
