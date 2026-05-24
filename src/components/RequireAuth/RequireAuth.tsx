import type { ReactNode } from 'react';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import styles from './RequireAuth.module.css';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, login } = useGitHubAuth();

  if (loading) return null;

  if (!user) {
    return (
      <div className={styles.wall}>
        <div className={styles.card}>
          <div className={styles.lockIcon} aria-hidden="true">🔒</div>
          <h2 className={styles.title}>Sign in to continue</h2>
          <p className={styles.body}>
            This page is available to signed-in members only.
          </p>
          <button className={styles.btn} onClick={login}>
            Sign in with GitHub
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
