import type { ReactNode } from 'react';
import { config } from '../../config';
import styles from './MainContent.module.css';

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  return (
    <main className={styles.main}>
      <div className={styles.inner}>{children}</div>
      <footer className={styles.footer}>
        Version: {config.appVersion}
      </footer>
    </main>
  );
}
