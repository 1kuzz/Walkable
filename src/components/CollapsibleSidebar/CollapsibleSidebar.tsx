import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './CollapsibleSidebar.module.css';
import { useUpdates } from '../../services/updates';
import { useI18n } from '../../i18n';

const STORAGE_KEY = 'sidebar_collapsed';

export function CollapsibleSidebar() {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const { updates: allUpdates } = useUpdates({});
  const recentUpdates = allUpdates.slice(0, 3).map((u) => ({
    id: u.id,
    title: u.type === 'portal'
      ? `Portal${u.version ? ` v${u.version}` : ''} released`
      : u.type === 'app'
      ? `${u.appName ?? 'App'}${u.version ? ` — v${u.version}` : ''}`
      : u.title,
    date: u.date,
  }));

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <button
        className={styles.toggleButton}
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? t('component.sidebar.expand') : t('component.sidebar.collapse')}
        title={collapsed ? t('component.sidebar.expand') : t('component.sidebar.collapse')}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ transform: collapsed ? 'rotate(180deg)' : 'none', display: 'block' }}
        >
          <path d="M8 10L8 14L6 14L-2.62268e-07 8L6 2L8 2L8 6L16 6L16 10L8 10Z" fill="currentColor"/>
        </svg>
      </button>

      {!collapsed && (
        <div className={styles.content}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('component.sidebar.recentUpdates')}</h3>
            <ul className={styles.updateList}>
              {recentUpdates.map((update) => (
                <li key={update.id} className={styles.updateItem}>
                  <span className={styles.updateTitle}>{update.title}</span>
                  <span className={styles.updateDate}>{update.date}</span>
                </li>
              ))}
              {recentUpdates.length === 0 && (
                <li className={styles.updateItem}>
                  <span className={styles.updateDate}>{t('component.sidebar.noUpdates')}</span>
                </li>
              )}
            </ul>
            <Link to="/updates" className={styles.allLink}>
              {t('component.sidebar.allUpdates')}
            </Link>
          </section>
        </div>
      )}
    </aside>
  );
}
