import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitProject, type Project } from '../../api/projectsClient';
import styles from './ContentUploadPage.module.css';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function ContentUploadPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitted, setSubmitted] = useState<Project | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const project = await submitProject(url.trim());
      setSubmitted(project);
      setStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Extract the JSON error message if present
      const match = msg.match(/"error":"([^"]+)"/);
      setErrorMsg(match ? match[1] : msg);
      setStatus('error');
    }
  }

  if (status === 'success' && submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.successBox}>
          <div className={styles.successIcon}>✓</div>
          <h2 className={styles.successTitle}>Project submitted!</h2>
          <p className={styles.successText}>
            <strong>{submitted.name}</strong> by {submitted.owner_login} has been submitted
            and is pending review. It will appear in the gallery once approved.
          </p>
          <div className={styles.successActions}>
            <button className={styles.primaryBtn} onClick={() => navigate('/gallery')}>
              Back to gallery
            </button>
            <button className={styles.secondaryBtn} onClick={() => {
              setUrl(''); setStatus('idle'); setSubmitted(null);
            }}>
              Submit another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Submit a Project</h1>
        <p className={styles.pageSubtitle}>
          Share an open source GitHub repository with the community.
          Paste the URL below and we'll fetch the details automatically.
        </p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="github-url">
          GitHub repository URL
        </label>
        <input
          id="github-url"
          className={`${styles.input} ${status === 'error' ? styles.inputError : ''}`}
          type="url"
          placeholder="https://github.com/owner/repository"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setStatus('idle'); }}
          disabled={status === 'loading'}
          required
          autoFocus
        />
        {status === 'error' && (
          <p className={styles.errorMsg}>{errorMsg}</p>
        )}
        <p className={styles.hint}>
          Must be a public repository on github.com. The name, description,
          language and star count are fetched from the GitHub API.
        </p>

        <div className={styles.formActions}>
          <button
            className={styles.primaryBtn}
            type="submit"
            disabled={status === 'loading' || !url.trim()}
          >
            {status === 'loading' ? 'Fetching from GitHub…' : 'Submit project'}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => navigate('/gallery')}
          >
            Cancel
          </button>
        </div>
      </form>

      <div className={styles.infoBox}>
        <h3 className={styles.infoTitle}>How it works</h3>
        <ol className={styles.infoList}>
          <li>Paste a public GitHub URL and click Submit.</li>
          <li>We fetch the repo metadata (name, description, language, stars) from the GitHub API.</li>
          <li>A moderator reviews the submission — usually within 24 hours.</li>
          <li>Once approved, the project appears in the gallery and its view count starts tracking.</li>
        </ol>
      </div>
    </div>
  );
}
