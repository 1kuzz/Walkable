import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import styles from './VipPage.module.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function VipPage() {
  const { token } = useParams<{ token: string }>();
  const [notFound, setNotFound] = useState(false);
  const [status, setStatus] = useState('Launching…');

  const isValid = !!token && UUID_RE.test(token);

  useEffect(() => {
    if (!isValid) { setNotFound(true); return; }

    // Create a 24h viewer session, then navigate into it.
    // Each visitor gets a unique /api/vs/:sessionId URL.
    fetch(`/api/share/${token}/session`, { method: 'POST' })
      .then(async (r) => {
        if (!r.ok) { setNotFound(true); return; }
        const { sessionId } = await r.json() as { sessionId: string };
        window.location.replace(`/api/vs/${sessionId}`);
      })
      .catch(() => {
        // Fallback: direct share URL if session creation fails
        setStatus('Redirecting…');
        window.location.replace(`/api/share/${token}`);
      });
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

  return <div className={styles.loading}>{status}</div>;
}
