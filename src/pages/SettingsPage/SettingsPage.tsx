import { useState } from 'react';
import { getTheme, setTheme, type Theme } from '../../services/themeService';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  function handleThemeChange(next: Theme) {
    setTheme(next);
    setThemeState(next);
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>Appearance preferences</p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Theme</h2>
        <div className={styles.themeOptions}>
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              className={`${styles.themeBtn} ${theme === t ? styles.themeBtnActive : ''}`}
              onClick={() => handleThemeChange(t)}
            >
              {t === 'light' ? '☀️ Light' : '🌙 Dark'}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Language</h2>
        <LanguageSwitcher />
      </div>
    </div>
  );
}
