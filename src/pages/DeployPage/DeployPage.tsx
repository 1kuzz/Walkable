import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import { listContent, deleteContent, updateContent } from '../../api/contentClient';
import type { UploadedContent } from '../../services/uploadedContent';
import styles from './DeployPage.module.css';

type DeployStatus = 'idle' | 'uploading' | 'building' | 'live' | 'failed';

interface DeployState {
  status: DeployStatus;
  progress: number;
  id?: string;
  shareToken?: string;
  error?: string;
  buildLog?: string;
  envVarsRequired?: string[];
}

function formatExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return 'Permanent';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `Expires in ${Math.floor(h / 24)}d`;
  if (h >= 1) return `Expires in ${h}h ${m}m`;
  return `Expires in ${m}m`;
}

function statusDot(expiresAt: string | null | undefined): string {
  if (!expiresAt) return styles.dotLive;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return styles.dotExpired;
  if (ms < 2 * 3_600_000) return styles.dotWarning;
  return styles.dotLive;
}

function parseGitHubUrl(url: string): string | null {
  const m = url.trim().match(/^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(\.git)?\/?$/);
  return m ? m[1] : null;
}

interface DeployCardProps {
  item: UploadedContent;
  onDelete: () => void;
}

function DeployCard({ item, onDelete }: DeployCardProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const vipUrl = item.shareToken ? `${window.location.origin}/vip/${item.shareToken}` : null;

  const handleCopy = () => {
    if (!vipUrl) return;
    void navigator.clipboard.writeText(vipUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updateContent(item.id, { name: editName.trim(), description: item.description ?? '' });
      setEditing(false);
      onDelete(); // refresh
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    setDeleting(true);
    try { await deleteContent(item.id); onDelete(); } finally { setDeleting(false); }
  };

  const expiry = formatExpiry(item.expiresAt ?? undefined);
  const isExpired = !!item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now();

  return (
    <div className={`${styles.card} ${isExpired ? styles.cardExpired : ''}`}>
      <div className={styles.cardHeader}>
        <div className={styles.cardThumb}>
          {item.thumbnailPath
            ? <img src={item.thumbnailPath} alt="" className={styles.thumbImg} />
            : <span className={styles.thumbLetter}>{item.name[0]?.toUpperCase()}</span>}
        </div>
        <div className={styles.cardMeta}>
          {editing ? (
            <div className={styles.editRow}>
              <input
                className={styles.editInput}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleSave()}
                autoFocus
              />
              <button className={styles.saveBtn} onClick={() => void handleSave()} disabled={saving}>
                {saving ? '…' : 'Save'}
              </button>
              <button className={styles.cancelBtn2} onClick={() => setEditing(false)}>✕</button>
            </div>
          ) : (
            <div className={styles.cardName} onClick={() => setEditing(true)} title="Click to rename">{item.name}</div>
          )}
          <div className={styles.cardBadges}>
            <span className={`${styles.dot} ${statusDot(item.expiresAt ?? undefined)}`} />
            <span className={styles.expiryText}>{expiry}</span>
            {item.gitUrl && <span className={styles.gitBadge}>GitHub</span>}
            {(item as UploadedContent & { backendPort?: number }).backendPort && <span className={styles.backendBadge}>Node</span>}
          </div>
        </div>
        <div className={styles.cardActions}>
          <button
            className={styles.openBtn}
            onClick={() => navigate(`/apps/${item.id}`)}
            title="Open in portal"
          >↗</button>
        </div>
      </div>

      {vipUrl && (
        <div className={styles.vipRow}>
          <span className={styles.vipUrl}>{vipUrl.replace(window.location.origin, '')}</span>
          <button className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`} onClick={handleCopy}>
            {copied ? '✓' : 'Copy link'}
          </button>
        </div>
      )}

      <div className={styles.cardFooter}>
        <button className={styles.dangerBtn} onClick={() => void handleDelete()} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

export function DeployPage() {
  const { user } = useGitHubAuth();
  const [searchParams] = useSearchParams();

  // Deployments list
  const [items, setItems] = useState<UploadedContent[]>([]);
  const [loading, setLoading] = useState(true);

  // Deploy form
  const [tab, setTab] = useState<'zip' | 'github'>('zip');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [build, setBuild] = useState(false);
  const [deploy, setDeploy] = useState<DeployState>({ status: 'idle', progress: 0 });
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [showEnvForm, setShowEnvForm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill GitHub URL from ?import= param
  useEffect(() => {
    const importUrl = searchParams.get('import');
    if (importUrl) { setGitUrl(importUrl); setTab('github'); }
  }, [searchParams]);

  const fetchItems = useCallback(async () => {
    try {
      const all = await listContent();
      setItems(all.filter(i => i.uploadedBy === user?.login).sort(
        (a, b) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime()
      ));
    } finally { setLoading(false); }
  }, [user?.login]);

  useEffect(() => { void fetchItems(); }, [fetchItems]);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); if (!name) setName(f.name.replace(/\.zip$/i, '')); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.zip$/i, ''));
  };

  const resetDeploy = () => {
    setDeploy({ status: 'idle', progress: 0 });
    setFile(null);
    setName('');
    setGitUrl('');
    setBuild(false);
    setEnvValues({});
    setShowEnvForm(false);
  };

  const handleDeploy = async () => {
    if (!name.trim()) return;
    if (tab === 'zip' && !file) return;
    if (tab === 'github' && !parseGitHubUrl(gitUrl)) return;

    setDeploy({ status: 'uploading', progress: 0 });

    try {
      let result: { id: string; shareToken?: string; buildLog?: string | null; envVarsRequired?: string[] };

      if (tab === 'zip') {
        const fd = new FormData();
        fd.append('archive', file!);
        fd.append('name', name.trim());
        if (build) fd.append('build', 'true');

        setDeploy(s => ({ ...s, status: 'uploading', progress: 10 }));
        result = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/content');
          xhr.withCredentials = true;
          xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) setDeploy(s => ({ ...s, progress: Math.round(e.loaded / e.total * 80) }));
          });
          xhr.addEventListener('load', () => {
            try {
              const json = JSON.parse(xhr.responseText) as typeof result & { error?: string };
              if (xhr.status >= 200 && xhr.status < 300 && json.id) resolve(json);
              else reject(new Error(json.error ?? 'Upload failed'));
            } catch { reject(new Error('Upload failed')); }
          });
          xhr.addEventListener('error', () => reject(new Error('Network error')));
          xhr.send(fd);
        });
      } else {
        setDeploy(s => ({ ...s, status: 'building', progress: 20 }));
        const res = await fetch('/api/content/github', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gitUrl, name: name.trim(), build }),
        });
        if (!res.ok) {
          const err = await res.json() as { error?: string };
          throw new Error(err.error ?? 'Import failed');
        }
        result = await res.json() as typeof result;
      }

      setDeploy(s => ({ ...s, progress: 90, buildLog: result.buildLog ?? undefined }));

      // If env vars required, show the form before marking live
      if (result.envVarsRequired && result.envVarsRequired.length > 0) {
        const initial: Record<string, string> = {};
        result.envVarsRequired.forEach(k => { initial[k] = ''; });
        setEnvValues(initial);
        setShowEnvForm(true);
        setDeploy({ status: 'building', progress: 95, id: result.id, shareToken: result.shareToken, envVarsRequired: result.envVarsRequired });
        return;
      }

      setDeploy({ status: 'live', progress: 100, id: result.id, shareToken: result.shareToken, buildLog: result.buildLog ?? undefined });
      void fetchItems();
    } catch (err) {
      setDeploy(s => ({ ...s, status: 'failed', error: err instanceof Error ? err.message : 'Deploy failed' }));
    }
  };

  const handleSubmitEnv = async () => {
    if (!deploy.id) return;
    try {
      await fetch(`/api/content/${deploy.id}/env`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envValues),
      });
    } catch { /* non-fatal */ }
    setShowEnvForm(false);
    setDeploy(s => ({ ...s, status: 'live', progress: 100 }));
    void fetchItems();
  };

  const vipUrl = deploy.shareToken ? `${window.location.origin}/vip/${deploy.shareToken}` : null;
  const [liveCopied, setLiveCopied] = useState(false);
  const handleCopyLive = () => {
    if (!vipUrl) return;
    void navigator.clipboard.writeText(vipUrl).then(() => {
      setLiveCopied(true);
      setTimeout(() => setLiveCopied(false), 2000);
    });
  };

  const isPro = (user as (typeof user & { tier?: string }) | null)?.tier === 'pro';

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Deploy</h1>
          <p className={styles.subtitle}>Ship your AI code in seconds</p>
        </div>
        {isPro && <span className={styles.proBadge}>PRO</span>}
      </div>

      {/* ── Deploy Panel ── */}
      <div className={styles.deployPanel}>
        {deploy.status === 'idle' || deploy.status === 'failed' ? (
          <>
            {deploy.status === 'failed' && (
              <div className={styles.errorBanner}>
                <span>✕ {deploy.error}</span>
                <button className={styles.retryBtn} onClick={resetDeploy}>Try again</button>
              </div>
            )}

            {/* Tabs */}
            <div className={styles.tabs}>
              <button className={`${styles.tab} ${tab === 'zip' ? styles.tabActive : ''}`} onClick={() => setTab('zip')}>
                ZIP Upload
              </button>
              <button className={`${styles.tab} ${tab === 'github' ? styles.tabActive : ''}`} onClick={() => setTab('github')}>
                GitHub
              </button>
            </div>

            {tab === 'zip' ? (
              <div
                className={`${styles.dropZone} ${dragOver ? styles.dropZoneOver : ''} ${file ? styles.dropZoneHasFile : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".zip" className={styles.hidden} onChange={handleFileChange} />
                {file ? (
                  <div className={styles.fileSelected}>
                    <span className={styles.fileIcon}>📦</span>
                    <span className={styles.fileName}>{file.name}</span>
                    <button className={styles.clearFile} onClick={e => { e.stopPropagation(); setFile(null); }}>✕</button>
                  </div>
                ) : (
                  <div className={styles.dropPlaceholder}>
                    <span className={styles.dropIcon}>📁</span>
                    <span className={styles.dropText}>Drop your ZIP here or <u>click to browse</u></span>
                    <span className={styles.dropHint}>Max 200 MB</span>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.githubInput}>
                <input
                  className={styles.urlInput}
                  placeholder="https://github.com/user/repo"
                  value={gitUrl}
                  onChange={e => setGitUrl(e.target.value)}
                />
              </div>
            )}

            <div className={styles.formRow}>
              <input
                className={styles.nameInput}
                placeholder="Project name"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={120}
              />
              <label className={styles.buildToggle}>
                <input type="checkbox" checked={build} onChange={e => setBuild(e.target.checked)} />
                Build (npm run build)
              </label>
            </div>

            <button
              className={styles.deployBtn}
              disabled={!name.trim() || (tab === 'zip' && !file) || (tab === 'github' && !parseGitHubUrl(gitUrl))}
              onClick={() => void handleDeploy()}
            >
              Deploy →
            </button>
          </>
        ) : deploy.status === 'uploading' || deploy.status === 'building' ? (
          <div className={styles.progressPanel}>
            <div className={styles.progressSteps}>
              <div className={`${styles.pStep} ${styles.pStepDone}`}>✓ Connecting</div>
              <div className={`${styles.pStep} ${deploy.progress >= 50 ? styles.pStepDone : styles.pStepActive}`}>
                {deploy.status === 'uploading' ? '⟳ Uploading…' : '✓ Uploaded'}
              </div>
              <div className={`${styles.pStep} ${deploy.status === 'building' ? styles.pStepActive : ''}`}>
                {deploy.progress >= 90 ? '✓ Building' : deploy.status === 'building' ? '⟳ Building…' : '◦ Build'}
              </div>
              <div className={styles.pStep}>◦ Live</div>
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${deploy.progress}%` }} />
            </div>
            <p className={styles.progressNote}>
              {showEnvForm ? 'Almost there — set your env vars below' : 'Hang tight, this usually takes under 30 seconds…'}
            </p>

            {showEnvForm && deploy.envVarsRequired && (
              <div className={styles.envForm}>
                <p className={styles.envTitle}>Found <code>.env.example</code> — set these values:</p>
                {deploy.envVarsRequired.map(k => (
                  <div key={k} className={styles.envRow}>
                    <label className={styles.envLabel}>{k}</label>
                    <input
                      className={styles.envInput}
                      placeholder={`Enter ${k}`}
                      value={envValues[k] ?? ''}
                      onChange={e => setEnvValues(v => ({ ...v, [k]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className={styles.envActions}>
                  <button className={styles.deployBtn} onClick={() => void handleSubmitEnv()}>Set & go live</button>
                  <button className={styles.skipBtn} onClick={() => {
                    setShowEnvForm(false);
                    setDeploy(s => ({ ...s, status: 'live', progress: 100 }));
                    void fetchItems();
                  }}>Skip for now</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* status === 'live' */
          <div className={styles.livePanel}>
            <div className={styles.liveIcon}>🚀</div>
            <h2 className={styles.liveTitle}>Live!</h2>
            {vipUrl && (
              <div className={styles.liveLink}>
                <a href={vipUrl} target="_blank" rel="noreferrer" className={styles.liveLinkText}>{vipUrl}</a>
                <button className={`${styles.copyBtn} ${liveCopied ? styles.copyBtnDone : ''}`} onClick={handleCopyLive}>
                  {liveCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            )}
            {deploy.buildLog && (
              <details className={styles.buildLogDetails}>
                <summary>Build log</summary>
                <pre className={styles.buildLog}>{deploy.buildLog}</pre>
              </details>
            )}
            <button className={styles.newDeployBtn} onClick={resetDeploy}>Deploy another →</button>
          </div>
        )}
      </div>

      {/* ── Deployments list ── */}
      <div className={styles.deploymentsSection}>
        <h2 className={styles.deploymentsTitle}>Your deployments</h2>
        {loading && <p className={styles.loadingText}>Loading…</p>}
        {!loading && items.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📭</span>
            <p>No deployments yet. Drop a ZIP above to get started.</p>
          </div>
        )}
        {items.length > 0 && (
          <div className={styles.grid}>
            {items.map(item => (
              <DeployCard key={item.id} item={item} onDelete={() => { setLoading(true); void fetchItems(); }} />
            ))}
          </div>
        )}
        {!isPro && items.length > 0 && (
          <p className={styles.tierNote}>
            Free tier: 1 deploy/day, 24-hour links.{' '}
            <a href="/settings#pro" className={styles.upgradeLink}>Upgrade to Pro</a> for permanent links &amp; unlimited deploys.
          </p>
        )}
      </div>
    </div>
  );
}
