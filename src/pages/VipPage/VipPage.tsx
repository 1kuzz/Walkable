import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import styles from './VipPage.module.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function VipPage() {
  const { token } = useParams<{ token: string }>();
  const [notFound, setNotFound] = useState(false);

  const isValid = !!token && UUID_RE.test(token);

  useEffect(() => {
    if (!isValid) { setNotFound(true); return; }
    // Redirect directly to the stable share URL — no per-visitor session needed.
    // The share URL works for the content's lifetime (24 h for free tier), then
    // the cleanup scheduler deletes it and the link returns 410.
    window.location.replace(`/api/share/${token}`);
  }, [token, isValid]);

  if (!isValid || notFound) {
    return (
      <div className={styles.error}>
        <div className={styles.errorIcon}>📭</div>
        <h1 className={styles.errorTitle}>Link Not Found</h1>
        <p className={styles.errorMsg}>This VIP link does not exist or has been removed.</p>
      </div>
    );
  }

  return <div className={styles.loading}>Redirecting…</div>;
}
