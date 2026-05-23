import { useState, useEffect } from 'react';
import styles from './VersionChangeModal.module.css';

interface Props {
  /** 'portal' shows a "Portal Updated" header; 'app' shows the app name. */
  type: 'portal' | 'app';
  appName?: string;
  /** Pre-filled version string (e.g. from config.appVersion or last known app version). */
  defaultVersion?: string;
  /** Pre-filled "What changed?" text (e.g. auto-detected visibility change). */
  defaultChanges?: string;
  /** Called when the admin clicks "Publish". */
  onPublish: (version: string, changes: string) => void;
  /** Called when the admin dismisses the modal without publishing. */
  onSkip: () => void;
}

/**
 * Modal that prompts an administrator to document a version bump.
 * Used for both portal-level releases and individual app updates.
 */
export function VersionChangeModal({ type, appName, defaultVersion = '', defaultChanges = '', onPublish, onSkip }: Props) {
  const [version, setVersion] = useState(defaultVersion);
  const [changes, setChanges] = useState(defaultChanges);
  const [error, setError] = useState('');

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onSkip();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSkip]);

  const isPortal = type === 'portal';
  const title = isPortal ? '🚀 Portal Updated' : `📦 App Updated: ${appName}`;
  const subtitle = isPortal
    ? 'A new version of the portal has been deployed. Document the changes so users stay informed.'
    : `You've edited "${appName}". Optionally publish a changelog entry so users know what's new.`;

  function handlePublish() {
    if (!version.trim()) {
      setError('Version is required');
      return;
    }
    if (!changes.trim()) {
      setError('Please describe what changed');
      return;
    }
    onPublish(version.trim(), changes.trim());
  }

  return (
    <div className={styles.overlay} onClick={onSkip} role="dialog" aria-modal="true" aria-labelledby="vcm-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title} id="vcm-title">{title}</h3>
          <button className={styles.closeBtn} onClick={onSkip} aria-label="Close">✕</button>
        </div>

        <p className={styles.subtitle}>{subtitle}</p>

        {error && <div className={styles.errorMsg}>{error}</div>}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="vcm-version">Version *</label>
          <input
            id="vcm-version"
            className={styles.input}
            type="text"
            value={version}
            onChange={(e) => { setVersion(e.target.value); setError(''); }}
            placeholder="e.g. 1.2.0"
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="vcm-changes">What changed? *</label>
          <textarea
            id="vcm-changes"
            className={styles.textarea}
            value={changes}
            onChange={(e) => { setChanges(e.target.value); setError(''); }}
            placeholder={'• Added new feature\n• Fixed bug in X\n• Improved performance'}
            rows={5}
          />
        </div>

        <div className={styles.actions}>
          <button className={styles.publishBtn} onClick={handlePublish}>
            ✓ Publish Changelog
          </button>
          <button className={styles.skipBtn} onClick={onSkip}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
