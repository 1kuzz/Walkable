import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import { logger } from '../../services/logger';
import styles from './ErrorBoundary.module.css';
import { translateStatic } from '../../i18n/messages';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    logger.error('ErrorBoundary', error.message, {
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={styles.container}>
          <div className={styles.icon}><Icon name="warning" size={48} /></div>
          <h2 className={styles.title}>{translateStatic('component.errorBoundary.title')}</h2>
          <p className={styles.message}>
            {this.state.error?.message ?? translateStatic('component.errorBoundary.fallback')}
          </p>
          <button className={styles.retryButton} onClick={this.handleReset}>
            {translateStatic('component.errorBoundary.tryAgain')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
