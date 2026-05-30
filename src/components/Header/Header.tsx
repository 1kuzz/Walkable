import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import styles from './Header.module.css';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink;

export function Header() {
  const { user, loading, login, logout } = useGitHubAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const isPro = (user as (typeof user & { tier?: string }) | null)?.tier === 'pro';

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen]);

  return (
    <header className={styles.header}>
      {/* Brand */}
      <button className={styles.brand} onClick={() => navigate(user ? '/deploy' : '/')} aria-label="VibePort home">
        <span className={styles.brandName}>VibePort</span>
      </button>

      {/* Desktop nav */}
      <nav className={styles.nav}>
        {user && (
          <NavLink to="/deploy" className={navLinkClass}>Deploy</NavLink>
        )}
        <NavLink to="/apps" className={navLinkClass}>Apps</NavLink>
        <NavLink to="/help" className={navLinkClass}>Docs</NavLink>
      </nav>

      {/* Auth / user */}
      <div className={styles.authArea}>
        {loading ? (
          <span className={styles.placeholder} />
        ) : user ? (
          <div className={styles.userMenu} ref={dropRef}>
            <button className={styles.userBtn} onClick={() => setDropOpen(v => !v)} aria-expanded={dropOpen}>
              {user.avatar_url
                ? <img src={user.avatar_url} alt={user.login} className={styles.avatar} />
                : <span className={styles.avatarInitial}>{user.login[0].toUpperCase()}</span>}
              <span className={styles.userLogin}>{user.login}</span>
              {isPro && <span className={styles.proBadge}>PRO</span>}
              <span className={styles.chevron}>{dropOpen ? '▲' : '▼'}</span>
            </button>
            {dropOpen && (
              <div className={styles.dropdown}>
                <button className={styles.dropItem} onClick={() => { navigate('/settings'); setDropOpen(false); }}>
                  Settings
                </button>
                <button className={styles.dropItem} onClick={() => { navigate('/updates'); setDropOpen(false); }}>
                  Updates
                </button>
                <button className={styles.dropItem} onClick={() => { navigate('/statistics'); setDropOpen(false); }}>
                  Statistics
                </button>
                <div className={styles.dropDivider} />
                <button className={`${styles.dropItem} ${styles.dropItemDanger}`} onClick={() => void logout()}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className={styles.loginBtn} onClick={login}>
            Deploy with GitHub
          </button>
        )}

        {/* Mobile hamburger */}
        <button className={styles.hamburger} onClick={() => setMobileOpen(v => !v)} aria-label="Menu">
          <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.hamburgerOpen1 : ''}`} />
          <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.hamburgerOpen2 : ''}`} />
          <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.hamburgerOpen3 : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className={styles.mobileMenu} onClick={() => setMobileOpen(false)}>
          {user && <NavLink to="/deploy" className={styles.mobileLink}>Deploy</NavLink>}
          <NavLink to="/apps" className={styles.mobileLink}>Apps</NavLink>
          <NavLink to="/help" className={styles.mobileLink}>Docs</NavLink>
          <NavLink to="/updates" className={styles.mobileLink}>Updates</NavLink>
          <NavLink to="/statistics" className={styles.mobileLink}>Statistics</NavLink>
          <NavLink to="/settings" className={styles.mobileLink}>Settings</NavLink>
          <div className={styles.mobileDivider} />
          {user
            ? <button className={styles.mobileLink} onClick={() => void logout()}>Sign out</button>
            : <button className={styles.mobileCta} onClick={login}>Deploy with GitHub</button>}
        </div>
      )}
    </header>
  );
}
