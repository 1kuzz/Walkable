import styles from './LoadingFallback.module.css';
import { useI18n } from '../../i18n';

export function LoadingFallback() {
  const { t } = useI18n();

  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
      <p className={styles.text}>{t('component.loadingFallback.text')}</p>
    </div>
  );
}
