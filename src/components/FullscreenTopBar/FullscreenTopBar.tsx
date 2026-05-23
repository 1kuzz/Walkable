import { useNavigate } from 'react-router-dom';
import { useUnreadCount } from '../../services/updates';
import styles from './FullscreenTopBar.module.css';
import { useI18n } from '../../i18n';

const HIDE_DELAY_MS = 400;
import { useRef, useState } from 'react';

export function FullscreenTopBar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setVisible(true);
  }

  function scheduleHide() {
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
    }, HIDE_DELAY_MS);
  }

  return (
    <>
      <div className={styles.trigger} onMouseEnter={show} aria-hidden="true">
        <div className={`${styles.hint} ${visible ? styles.hintHidden : ''}`} />
      </div>

      <header
        className={`${styles.bar} ${visible ? styles.barVisible : ''}`}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        aria-label={t('nav.mainNavigation')}
      >
        <button
          className={styles.brandingBtn}
          onClick={() => navigate('/gallery')}
          aria-label={t('nav.goToGallery')}
        >
          <span className={styles.brandName}>Project Showcase</span>
        </button>

        <nav className={styles.nav}>
          <button className={styles.navLink} onClick={() => navigate('/gallery')}>
            {t('nav.gallery')}
          </button>
          <span className={styles.separator}>|</span>
          <button className={styles.navLink} onClick={() => navigate('/updates')}>
            <span className={styles.navLinkInner}>
              {t('nav.updates')}
              {unreadCount > 0 && (
                <span className={styles.unreadDot} aria-label={t('nav.unread', { count: unreadCount })} />
              )}
            </span>
          </button>
        </nav>
      </header>
    </>
  );
}
