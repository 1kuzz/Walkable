import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useUnreadCount } from '../../services/updates';
import { Icon } from '../Icon/Icon';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import styles from './Header.module.css';
import { useI18n } from '../../i18n';

export function Header() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, login, logout } = useGitHubAuth();

  return (
    <header className={styles.header}>
      <button className={styles.brandingBtn} onClick={() => navigate('/gallery')} aria-label={t('nav.goToGallery')}>
        <span className={styles.brandName}>Project Showcase</span>
      </button>

      <button
        className={styles.menuToggle}
        onClick={() => setMobileMenuOpen((v) => !v)}
        aria-expanded={mobileMenuOpen}
        aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
      >
        <Icon name={mobileMenuOpen ? 'close' : 'menu'} size={22} />
      </button>

      <nav className={styles.nav} aria-label={t('nav.mainNavigation')}>
        <NavLink
          to="/gallery"
          className={({ isActive }) => isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
        >
          {t('nav.gallery')}
        </NavLink>
        <span className={styles.separator}>|</span>
        <NavLink
          to="/content"
          className={({ isActive }) => isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
        >
          Submit
        </NavLink>
        <span className={styles.separator}>|</span>
        <NavLink
          to="/updates"
          className={({ isActive }) => isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
        >
          <span className={styles.navLinkInner}>
            {t('nav.updates')}
            {unreadCount > 0 && (
              <span className={styles.unreadDot} aria-label={t('nav.unread', { count: unreadCount })} />
            )}
          </span>
        </NavLink>
        <span className={styles.separator}>|</span>
        <NavLink
          to="/statistics"
          className={({ isActive }) => isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
        >
          {t('nav.statistics') || 'Stats'}
        </NavLink>
        <span className={styles.separator}>|</span>
        <NavLink
          to="/settings"
          className={({ isActive }) => isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
        >
          Settings
        </NavLink>
        <span className={styles.separator}>|</span>
        {user ? (
          <span className={styles.authGroup}>
            {user.avatar_url && (
              <img src={user.avatar_url} alt={user.login} className={styles.avatar} />
            )}
            <span className={styles.navLink}>{user.login}</span>
            <button className={styles.logoutBtn} onClick={() => void logout()}>Sign out</button>
          </span>
        ) : (
          <button className={styles.githubBtn} onClick={login}>
            Sign in with GitHub
          </button>
        )}
      </nav>
    </header>
  );
}
