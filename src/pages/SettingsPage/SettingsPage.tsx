import { useState } from 'react';
import { getTheme, setTheme, type Theme } from '../../services/themeService';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const { user, logout } = useGitHubAuth();
  const [theme, setThemeState] = useState<Theme>(getTheme);

  function handleThemeChange(next: Theme) {
    setTheme(next);
    setThemeState(next);
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>Account and preferences</p>
      </div>

      {user && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Account</h2>
          <div className={styles.accountRow}>
            {user.avatar_url && (
              <img src={user.avatar_url} alt={user.login} className={styles.accountAvatar} />
            )}
            <div className={styles.accountInfo}>
              <span className={styles.accountLogin}>{user.login}</span>
              {user.name && <span className={styles.accountName}>{user.name}</span>}
              <span className={styles.accountProvider}>GitHub account</span>
            </div>
            <button className={styles.signOutBtn} onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Deployment</h2>
        <div className={styles.deployInfo}>
          <div className={styles.deployRow}>
            <span className={styles.deployLabel}>Repository</span>
            <a
              href="https://github.com/1kuzz/Walkable"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.deployLink}
            >
              1kuzz/Walkable
            </a>
          </div>
          <div className={styles.deployRow}>
            <span className={styles.deployLabel}>CI/CD</span>
            <a
              href="https://github.com/1kuzz/Walkable/actions"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.deployLink}
            >
              GitHub Actions
            </a>
          </div>
          <div className={styles.deployRow}>
            <span className={styles.deployLabel}>Deploy trigger</span>
            <span className={styles.deployValue}>Push to <code className={styles.code}>main</code></span>
          </div>
          <div className={styles.deployRow}>
            <span className={styles.deployLabel}>Deploy script</span>
            <span className={styles.deployValue}><code className={styles.code}>deploy/deploy.sh</code></span>
          </div>
          <div className={styles.deployRow}>
            <span className={styles.deployLabel}>Server path</span>
            <span className={styles.deployValue}><code className={styles.code}>/var/www/walkable/app</code></span>
          </div>
        </div>
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
