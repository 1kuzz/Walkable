import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useUnreadCount } from '../../services/updates';
import { Icon } from '../Icon/Icon';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import styles from './Header.module.css';
import { useI18n } from '../../i18n';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink;
const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.mobileNavLink} ${styles.mobileNavLinkActive}` : styles.mobileNavLink;

function AuthSection({ compact = false }: { compact?: boolean }) {
  const { user, loading, login, logout } = useGitHubAuth();
  const navigate = useNavigate();

  if (loading) {
    return <span className={styles.authPlaceholder} />;
  }

  if (!user) {
    return (
      <button
        className={compact ? styles.mobileNavLink : styles.githubBtn}
        onClick={login}
      >
        Sign in with GitHub
      </button>
    );
  }

  if (compact) {
    return (
      <div className={styles.mobileUserRow}>
        {user.avatar_url && (
          <img src={user.avatar_url} alt={user.login} className={styles.avatar} />
        )}
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--color-white)' }}>
          {user.login}
        </span>
        <button className={styles.logoutBtn} onClick={() => void logout()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      className={styles.accountBtn}
      onClick={() => navigate('/settings')}
      title={`${user.login} — Settings`}
    >
      {user.avatar_url ? (
        <img src={user.avatar_url} alt={user.login} className={styles.accountAvatar} />
      ) : (
        <span className={styles.accountInitial}>{user.login[0].toUpperCase()}</span>
      )}
      <span className={styles.accountLogin}>{user.login}</span>
    </button>
  );
}

export function Header() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useGitHubAuth();

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
        <NavLink to="/gallery" className={navLinkClass}>
          {t('nav.gallery')}
        </NavLink>
        <span className={styles.separator}>|</span>
        <NavLink to="/content" className={navLinkClass}>
          Submit
        </NavLink>
        <span className={styles.separator}>|</span>
        <NavLink to="/updates" className={navLinkClass}>
          <span className={styles.navLinkInner}>
            {t('nav.updates')}
            {unreadCount > 0 && (
              <span className={styles.unreadDot} aria-label={t('nav.unread', { count: unreadCount })} />
            )}
          </span>
        </NavLink>
        <span className={styles.separator}>|</span>
        <NavLink to="/statistics" className={navLinkClass}>
          {t('nav.statistics') || 'Stats'}
        </NavLink>
        {user && (
          <>
            <span className={styles.separator}>|</span>
            <NavLink to="/my-projects" className={navLinkClass}>
              My Projects
            </NavLink>
          </>
        )}
        <span className={styles.separator}>|</span>
        <AuthSection />
      </nav>

      {mobileMenuOpen && (
        <div className={styles.mobileMenu} role="navigation" aria-label={t('nav.mainNavigation')}>
          <NavLink to="/gallery" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
            {t('nav.gallery')}
          </NavLink>
          <NavLink to="/content" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
            Submit
          </NavLink>
          <NavLink to="/updates" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
            {t('nav.updates')}
            {unreadCount > 0 && (
              <span className={styles.unreadDot} aria-label={t('nav.unread', { count: unreadCount })} />
            )}
          </NavLink>
          <NavLink
            to="/statistics"
            className={mobileNavLinkClass}
            onClick={() => setMobileMenuOpen(false)}
          >
            {t('nav.statistics') || 'Stats'}
          </NavLink>
          {user && (
            <NavLink
              to="/my-projects"
              className={mobileNavLinkClass}
              onClick={() => setMobileMenuOpen(false)}
            >
              My Projects
            </NavLink>
          )}
          <NavLink to="/settings" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
            Settings
          </NavLink>
          <hr className={styles.mobileDivider} />
          <AuthSection compact />
        </div>
      )}
    </header>
  );
}
