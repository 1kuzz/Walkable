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
    // Validate the token exists, then navigate directly to the app (no iframe)
    fetch(`/api/share/${token}/meta`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return; }
        // Replace current history entry so Back still works
        window.location.replace(`/api/share/${token}`);
      })
      .catch(() => setNotFound(true));
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

  return <div className={styles.loading}>Launching…</div>;
}
