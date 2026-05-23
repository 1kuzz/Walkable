import { useI18n, type Locale } from '../../i18n';
import styles from './LanguageSwitcher.module.css';

interface Props {
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: Props) {
  const { locale, setLocale, t } = useI18n();

  function handleChange(next: Locale) {
    setLocale(next);
  }

  return (
    <div className={`${styles.switcher} ${compact ? styles.compact : ''}`} role="group" aria-label={t('nav.language')}>
      <button
        type="button"
        className={`${styles.button} ${locale === 'en' ? styles.active : ''}`}
        aria-pressed={locale === 'en'}
        onClick={() => handleChange('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`${styles.button} ${locale === 'ru' ? styles.active : ''}`}
        aria-pressed={locale === 'ru'}
        onClick={() => handleChange('ru')}
      >
        RU
      </button>
    </div>
  );
}
