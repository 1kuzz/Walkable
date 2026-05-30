import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { APP_IFRAME_SANDBOX } from '../../services/appIframeSandbox';
import styles from './VipPage.module.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function VipPage() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [metaLoaded, setMetaLoaded] = useState(false);

  const isValid = !!token && UUID_RE.test(token);

  useEffect(() => {
    if (!isValid) { setNotFound(true); return; }
    fetch(`/api/share/${token}/meta`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return; }
        return r.json() as Promise<{ name: string }>;
      })
      .then((data) => {
        if (data) {
          setName(data.name);
          document.title = data.name;
          setMetaLoaded(true);
        }
      })
      .catch(() => setNotFound(true));
  }, [token, isValid]);

  if (isValid && !notFound && !metaLoaded) {
    return <div className={styles.loading}>Loading…</div>;
  }

  if (!isValid || notFound) {
    return (
      <div className={styles.error}>
        <div className={styles.errorIcon}>📭</div>
        <h1 className={styles.errorTitle}>Link Not Found</h1>
        <p className={styles.errorMsg}>This VIP link does not exist or has been removed.</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <iframe
        key={token}
        className={styles.frame}
        src={`/api/share/${token}`}
        title={name ?? 'Project'}
        sandbox={APP_IFRAME_SANDBOX}
        allow="autoplay; fullscreen"
        loading="eager"
      />
    </div>
  );
}
