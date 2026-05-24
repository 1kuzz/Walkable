import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import { listContent, submitForReview, deleteContent, uploadFromGitHub, listGitHubRepos } from '../../api/contentClient';
import type { GitHubRepo } from '../../api/contentClient';
import type { UploadedContent } from '../../services/uploadedContent';
import styles from './MyProjectsPage.module.css';

function uploadZipWithProgress(
  fd: FormData,
  onProgress: (pct: number) => void,
): Promise<{ id: string; buildLog?: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/content');
    xhr.withCredentials = true;
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      try {
        const json = JSON.parse(xhr.responseText) as { id?: string; error?: string; buildLog?: string };
        if (xhr.status >= 200 && xhr.status < 300 && json.id) {
          resolve({ id: json.id, buildLog: json.buildLog });
        } else {
          reject(Object.assign(new Error(json.error ?? 'Upload failed.'), { buildLog: json.buildLog }));
        }
      } catch {
        reject(new Error('Upload failed.'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.send(fd);
  });
}

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
  const navigate = useNavigate();
  const [tab, setTab] = useState<'zip' | 'github'>('zip');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [gitUrl, setGitUrl] = useState('');
  const [build, setBuild] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [buildPhase, setBuildPhase] = useState(false);
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buildLog, setBuildLog] = useState<string | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [reposLoaded, setReposLoaded] = useState(false);
  const [hasMoreRepos, setHasMoreRepos] = useState(false);
  const [repoPage, setRepoPage] = useState(1);

  const repoLabel = tab === 'github' ? parseGitHubRepo(gitUrl) : null;
  const gitUrlValid = tab !== 'github' || !!repoLabel;

  useEffect(() => {
    if (tab !== 'github' || reposLoaded) return;
    setReposLoading(true);
    void listGitHubRepos(1).then((r) => {
      setRepos(r);
      setHasMoreRepos(r.length === 50);
      setReposLoaded(true);
    }).finally(() => setReposLoading(false));
  }, [tab, reposLoaded]);

  const filteredRepos = repos.filter((r) =>
    !repoSearch ||
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(repoSearch.toLowerCase()),
  );

  const loadMoreRepos = () => {
    const nextPage = repoPage + 1;
    setRepoPage(nextPage);
    void listGitHubRepos(nextPage).then((r) => {
      setRepos((prev) => [...prev, ...r]);
      setHasMoreRepos(r.length === 50);
    });
  };

  const handleSubmit = async () => {
    setError(null);
    setBuildLog(null);
    if (!name.trim()) { setError('Name is required.'); return; }

    setSubmitting(true);
    setUploadProgress(0);
    setBuildPhase(false);

    try {
      let id: string;
      let log: string | null = null;

      if (tab === 'zip') {
        if (!file) { setError('Please select a ZIP file.'); setSubmitting(false); return; }
        const fd = new FormData();
        fd.append('archive', file);
        fd.append('name', name.trim());
        fd.append('description', description.trim());
        if (build) fd.append('build', 'true');

        const result = await uploadZipWithProgress(fd, (pct) => {
          setUploadProgress(pct);
          if (pct >= 100 && build) setBuildPhase(true);
        });
        id = result.id;
        log = result.buildLog ?? null;
      } else {
        if (!gitUrlValid) { setError('Enter a valid GitHub URL (https://github.com/owner/repo).'); setSubmitting(false); return; }
        const result = await uploadFromGitHub(gitUrl.trim(), name.trim(), description.trim() || undefined, build);
        id = result.id;
        log = result.buildLog ?? null;
      }

      setBuildLog(log);
      setUploadedId(id);
    } catch (err: unknown) {
      const e = err as Error & { buildLog?: string };
      setBuildLog(e.buildLog ?? null);
      setError(e.message ?? 'Upload failed.');
    } finally {
      setSubmitting(false);
      setBuildPhase(false);
    }
  };

  if (uploadedId) {
    return (
      <div className={styles.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget) { onUploaded(uploadedId); } }}>
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Upload successful">
          <div className={styles.successScreen}>
            <div className={styles.successIcon}>✓</div>
            <h3 className={styles.successTitle}>Uploaded successfully!</h3>
            <p className={styles.successMsg}>Your project is ready to preview. Submit it for review when you're happy with it.</p>
            {buildLog && (
              <details className={styles.buildLogDetails}>
                <summary>Build log</summary>
                <pre className={styles.buildLog}>{buildLog}</pre>
              </details>
            )}
            <div className={styles.successActions}>
              <button
                className={styles.uploadBtn}
                onClick={() => { onUploaded(uploadedId); navigate(`/apps/${uploadedId}`); }}
              >
                Preview project
              </button>
              <button
                className={styles.cancelBtn}
                onClick={() => onUploaded(uploadedId)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Repository</span>
              {gitUrl ? (
                <div className={styles.repoSelected}>
                  <span className={styles.repoSelectedName}>{repoLabel ?? gitUrl}</span>
                  <button
                    type="button"
                    className={styles.repoSelectedClear}
                    onClick={() => setGitUrl('')}
                    aria-label="Clear selection"
                  >✕</button>
                </div>
              ) : (
                <div className={styles.repoPickerWrap}>
                  <input
                    className={styles.repoSearch}
                    placeholder="Search your repositories…"
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                  />
                  {reposLoading && <span className={styles.reposStatus}>Loading repositories…</span>}
                  {!reposLoading && reposLoaded && filteredRepos.length === 0 && (
                    <span className={styles.reposStatus}>No repositories found.</span>
                  )}
                  {!reposLoading && !reposLoaded && repos.length === 0 && (
                    <span className={styles.reposStatus}>Sign in with GitHub to browse your repos.</span>
                  )}
                  {filteredRepos.length > 0 && (
                    <div className={styles.repoList}>
                      {filteredRepos.map((repo) => (
                        <button
                          key={repo.full_name}
                          type="button"
                          className={styles.repoItem}
                          onClick={() => {
                            setGitUrl(repo.html_url);
                            if (!name) setName(repo.name);
                          }}
                        >
                          <div className={styles.repoItemTop}>
                            <span className={styles.repoName}>{repo.full_name}</span>
                            {repo.private && <span className={styles.repoBadge}>Private</span>}
                          </div>
                          {repo.description && (
                            <span className={styles.repoDesc}>{repo.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {hasMoreRepos && (
                    <button type="button" className={styles.loadMoreBtn} onClick={loadMoreRepos}>
                      Load more
                    </button>
                  )}
                </div>
              )}
              {gitUrl && !gitUrlValid && (
                <span className={styles.fieldError}>Enter a valid https://github.com/owner/repo URL.</span>
              )}
            </div>
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

          {submitting && (
            <div className={styles.progressWrap}>
              {buildPhase ? (
                <span className={styles.progressLabel}>Building… this may take a few minutes</span>
              ) : (
                <>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span className={styles.progressLabel}>{uploadProgress}%</span>
                </>
              )}
            </div>
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
        <button className={styles.actionBtn} onClick={() => navigate(`/apps/${item.id}`)}>
          {status === 'approved' ? 'Open' : 'Preview'}
        </button>
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
