import { Icon } from '../Icon/Icon';
import styles from './AsyncStateWrapper.module.css';
import { useI18n } from '../../i18n';

interface Props {
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  loadingLabel?: string;
  children: React.ReactNode;
}

/**
 * Wraps page content with loading spinner and error panel handling.
 *
 * - While `loading` is true, shows a centered spinner.
 * - When `error` is set, shows a user-friendly error panel with a Retry button.
 * - Otherwise renders `children`.
 */
export function AsyncStateWrapper({ loading, error, onRetry, loadingLabel = 'Loading…', children }: Props) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className={styles.loadingWrapper} role="status" aria-live="polite">
        <div className={styles.spinner} aria-hidden="true" />
        <span>{loadingLabel === 'Loading…' ? t('common.loading') : loadingLabel}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorPanel} role="alert">
        <div className={styles.errorTitle}>
          <Icon name="warning" size={18} />
          {t('common.failedToLoadData')}
        </div>
        <p className={styles.errorMessage}>{error.message}</p>
        <button className={styles.retryBtn} onClick={onRetry}>
          {t('component.async.retry')}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
