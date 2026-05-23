import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { FullscreenTopBar } from '../../components/FullscreenTopBar';
import { getAllUploadedContent } from '../../services/uploadedContent';
import { trackEvent } from '../../services/usageTracker';
import { useI18n } from '../../i18n';
import { APP_IFRAME_SANDBOX } from '../../services/appIframeSandbox';
import styles from './AppLaunchPage.module.css';

type AccessStatus = 'checking' | 'ok' | 'denied';

export function AppLaunchPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [iframeLoading, setIframeLoading] = useState(true);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('checking');

  const appId = (id ?? '').trim();
  const isValidId = /^[a-zA-Z0-9_-]+$/.test(appId);

  useEffect(() => {
    if (!isValidId) return;
    getAllUploadedContent()
      .then((items) => {
        const item = items.find((c) => c.id === appId);
        if (item) {
          trackEvent('app_click', item.name);
          if (item.portalRoute) {
            navigate(item.portalRoute, { replace: true });
            return;
          }
          setAccessStatus('ok');
        } else {
          setAccessStatus('denied');
        }
      })
      .catch(() => {
        trackEvent('app_click', appId);
        setAccessStatus('ok');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isValidId) {
    return (
      <div className={styles.invalidState}>
        <h2 className={styles.invalidTitle}>Invalid app link</h2>
        <p className={styles.invalidText}>The app URL is malformed.</p>
        <Link to="/gallery" className={styles.backInlineLink}>Back to Gallery</Link>
      </div>
    );
  }

  if (accessStatus === 'denied') {
    return (
      <div className={styles.deniedState}>
        <div className={styles.deniedIcon} aria-hidden="true">🔒</div>
        <h1 className={styles.deniedTitle}>{t('page.appLaunch.accessDenied.title')}</h1>
        <p className={styles.deniedBody}>{t('page.appLaunch.accessDenied.body')}</p>
        <p className={styles.deniedContact}>
          {t('page.appLaunch.accessDenied.contact')}{' '}
          <a className={styles.deniedEmail} href="mailto:support@1kuzz.org">
            support@1kuzz.org
          </a>
        </p>
        <Link to="/gallery" className={styles.deniedBack}>
          {t('page.appLaunch.accessDenied.back')}
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <FullscreenTopBar />

      {(accessStatus === 'checking' || iframeLoading) && (
        <div className={styles.loadingOverlay} aria-live="polite">
          Loading app…
        </div>
      )}

      {accessStatus === 'ok' && (
        <iframe
          className={styles.frame}
          src={`/api/content/${encodeURIComponent(appId)}/render`}
          title={`App ${appId}`}
          sandbox={APP_IFRAME_SANDBOX}
          allow="autoplay"
          onLoad={() => setIframeLoading(false)}
        />
      )}
    </div>
  );
}
