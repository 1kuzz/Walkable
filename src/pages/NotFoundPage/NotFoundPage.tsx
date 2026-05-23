import { Link } from 'react-router-dom';
import styles from './NotFoundPage.module.css';
import { useI18n } from '../../i18n';

export function NotFoundPage() {
  const { t } = useI18n();

  return (
    <div className={styles.page}>
      <span className={styles.code}>404</span>
      <h2 className={styles.title}>{t('page.notFound.title')}</h2>
      <p className={styles.description}>
        {t('page.notFound.description')}
      </p>
      <Link to="/gallery" className={styles.homeLink}>
        {t('page.notFound.back')}
      </Link>
    </div>
  );
}
