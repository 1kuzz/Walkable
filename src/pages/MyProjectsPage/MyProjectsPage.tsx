import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import { listContent, submitForReview, deleteContent, uploadFromGitHub } from '../../api/contentClient';
import type { UploadedContent } from '../../services/uploadedContent';
import styles from './MyProjectsPage.module.css';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function parseGitHubRepo(url: string): string | null {
  const m = url.trim().match(/^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(\.git)?\/?$/);
  return m ? m[1] : null;
}

interface UploadModalProps {
  onClose: () => void;
  onUploaded: (id: string) => void;
}

function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  const [tab, setTab] = useState<'zip' | 'github'>('zip');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [gitUrl, setGitUrl] = useState('');
  const [build, setBuild] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildLog, setBuildLog] = useState<string | null>(null);

  const repoLabel = tab === 'github' ? parseGitHubRepo(gitUrl) : null;
  const gitUrlValid = tab !== 'github' || !!repoLabel;

  const handleNameFromUrl = (url: string) => {
    const repo = parseGitHubRepo(url);
    if (repo && !name) {
      setName(repo.split('/')[1] ?? '');
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setBuildLog(null);
    if (!name.trim()) { setError('Name is required.'); return; }

    setSubmitting(true);
    try {
      if (tab === 'zip') {
        if (!file) { setError('Please select a ZIP file.'); setSubmitting(false); return; }
        const fd = new FormData();
        fd.append('archive', file);
        fd.append('name', name.trim());
        fd.append('description', description.trim());
        if (build) fd.append('build', 'true');

        const res = await fetch('/api/content', {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        const json = await res.json() as { id?: string; error?: string; buildLog?: string };
        if (!res.ok) {
          setBuildLog(json.buildLog ?? null);
          setError(json.error ?? 'Upload failed.');
          setSubmitting(false);
          return;
        }
        setBuildLog(json.buildLog ?? null);
        onUploaded(json.id!);
      } else {
        if (!gitUrlValid) { setError('Enter a valid GitHub URL (https://github.com/owner/repo).'); setSubmitting(false); return; }
        const result = await uploadFromGitHub(gitUrl.trim(), name.trim(), description.trim() || undefined, build);
        setBuildLog(result.buildLog ?? null);
        onUploaded(result.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Upload project">
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Upload Project</h2>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.tabBar}>
          <button
            className={`${styles.tab} ${tab === 'zip' ? styles.tabActive : ''}`}
            onClick={() => setTab('zip')}
          >
            Upload ZIP
          </button>
          <button
            className={`${styles.tab} ${tab === 'github' ? styles.tabActive : ''}`}
            onClick={() => setTab('github')}
          >
            From GitHub
          </button>
        </div>

        <div className={styles.modalBody}>
          {tab === 'zip' ? (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>ZIP File</span>
              <input
                type="file"
                accept=".zip"
                className={styles.fileInput}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className={styles.fieldHint}>Upload your built project (HTML/CSS/JS) or source code with package.json.</span>
            </label>
          ) : (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>GitHub URL</span>
              <input
                type="url"
                placeholder="https://github.com/owner/repo"
                className={`${styles.textInput} ${gitUrl && !gitUrlValid ? styles.inputError : ''}`}
                value={gitUrl}
                onChange={(e) => { setGitUrl(e.target.value); handleNameFromUrl(e.target.value); }}
              />
              {repoLabel && <span className={styles.fieldHint}>Repo: {repoLabel}</span>}
              {gitUrl && !gitUrlValid && <span className={styles.fieldError}>Enter a valid https://github.com/owner/repo URL.</span>}
            </label>
          )}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Project Name <span className={styles.required}>*</span></span>
            <input
              type="text"
              className={styles.textInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome App"
              maxLength={120}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Description</span>
            <textarea
              className={styles.textArea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this project do?"
              rows={3}
              maxLength={500}
            />
          </label>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={build}
              onChange={(e) => setBuild(e.target.checked)}
            />
            <span>Build this project (runs <code>npm install &amp;&amp; npm run build</code> on the server)</span>
          </label>
          {build && (
            <p className={styles.buildWarning}>
              Build takes up to 5 minutes. The server runs npm install and npm run build. Output must be in dist/, build/, out/, or public/.
            </p>
          )}

          {error && <p className={styles.errorMsg}>{error}</p>}
          {buildLog && (
            <details className={styles.buildLogDetails} open={!!error}>
              <summary>Build log</summary>
              <pre className={styles.buildLog}>{buildLog}</pre>
            </details>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button className={styles.uploadBtn} onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProjectCardProps {
  item: UploadedContent;
  onAction: () => void;
}

function ProjectCard({ item, onAction }: ProjectCardProps) {
  const navigate = useNavigate();
  const [acting, setActing] = useState(false);

  const status = item.status ?? 'approved';
  const statusLabel = STATUS_LABEL[status] ?? status;

  const handleSubmitReview = async () => {
    setActing(true);
    try {
      await submitForReview(item.id);
      onAction();
    } catch {
      // ignore
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setActing(true);
    try {
      await deleteContent(item.id);
      onAction();
    } catch {
      // ignore
    } finally {
      setActing(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardThumb}>
        {item.thumbnailPath ? (
          <img src={item.thumbnailPath} alt={item.name} className={styles.thumbImg} />
        ) : (
          <div className={styles.thumbPlaceholder}>{item.name[0]?.toUpperCase()}</div>
        )}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardName}>{item.name}</span>
          <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>{statusLabel}</span>
        </div>
        {item.description && <p className={styles.cardDesc}>{item.description}</p>}
        {item.gitUrl && (
          <a href={item.gitUrl} target="_blank" rel="noreferrer" className={styles.gitLink}>
            {item.gitUrl.replace('https://github.com/', '')}
          </a>
        )}
        {status === 'rejected' && item.reviewNote && (
          <div className={styles.reviewNote}>
            <strong>Review note:</strong> {item.reviewNote}
          </div>
        )}
      </div>
      <div className={styles.cardActions}>
        {status === 'approved' && (
          <button className={styles.actionBtn} onClick={() => navigate(`/apps/${item.id}`)}>
            View
          </button>
        )}
        {(status === 'draft' || status === 'rejected') && (
          <button className={`${styles.actionBtn} ${styles.actionPrimary}`} onClick={() => void handleSubmitReview()} disabled={acting}>
            {status === 'rejected' ? 'Re-submit' : 'Submit for Review'}
          </button>
        )}
        {(status === 'draft' || status === 'rejected') && (
          <button className={`${styles.actionBtn} ${styles.actionDanger}`} onClick={() => void handleDelete()} disabled={acting}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export function MyProjectsPage() {
  const { user } = useGitHubAuth();
  const [items, setItems] = useState<UploadedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const all = await listContent();
      setItems(all.filter((i) => i.uploadedBy === user?.login));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.login]);

  useEffect(() => { void fetchItems(); }, [fetchItems]);

  const handleUploaded = (_id: string) => {
    setShowModal(false);
    setLoading(true);
    void fetchItems();
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>My Projects</h1>
          <p className={styles.pageSubtitle}>Upload and manage your projects</p>
        </div>
        <button className={styles.uploadButton} onClick={() => setShowModal(true)}>
          + Upload Project
        </button>
      </div>

      {loading && <p className={styles.loading}>Loading…</p>}

      {!loading && items.length === 0 && (
        <div className={styles.empty}>
          <p>You haven't uploaded any projects yet.</p>
          <button className={styles.uploadButton} onClick={() => setShowModal(true)}>
            Upload your first project
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className={styles.grid}>
          {items.map((item) => (
            <ProjectCard key={item.id} item={item} onAction={() => { setLoading(true); void fetchItems(); }} />
          ))}
        </div>
      )}

      {showModal && (
        <UploadModal
          onClose={() => setShowModal(false)}
          onUploaded={handleUploaded}
        />
      )}
    </div>
  );
}
