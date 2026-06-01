import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import { listContent, deleteContent, updateContent, stopBackend, restartBackend, getStorageInfo, getQueue, enqueueGitHub, cancelQueueItem, configureBackend } from '../../api/contentClient';
import type { GitHubRepo, StorageInfo, QueueItem } from '../../api/contentClient';
import type { UploadedContent } from '../../services/uploadedContent';
import styles from './DeployPage.module.css';

type DeployStatus = 'idle' | 'uploading' | 'building' | 'live' | 'failed' | 'queued' | 'filtering' | 'configuring-backend';

interface DirScanEntry {
  name: string;   // top-level dir name, or '__root__' for root-level files
  files: number;
  bytes: number;
}

interface DetectedBackend {
  entryPoint: string;
  suggestedPrefix: string;
  provisionDb: boolean;
}

interface DeployState {
  status: DeployStatus;
  progress: number;
  id?: string;
  shareToken?: string;
  error?: string;
  buildLog?: string;
  envVarsRequired?: string[];
  detectedBackend?: DetectedBackend | null;
  queuePosition?: number;
  queueMessage?: string;
  // filtering step
  tempId?: string;
  scanDirs?: DirScanEntry[];
  totalScannedFiles?: number;
}

const BUILD_OUTPUT_DIRS = new Set(['dist', 'build', 'out', 'output', 'public', 'www', '.next', '__sveltekit']);

function fmtBytes(b: number): string {
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
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

// ── GitHub Repo Picker ────────────────────────────────────────────────────────

interface RepoBrowserProps {
  onSelect: (repo: GitHubRepo) => void;
  selected: string | null;
}

function RepoBrowser({ onSelect, selected }: RepoBrowserProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, p: number, append: boolean) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const url = q
        ? `/api/github/repos?page=${p}&q=${encodeURIComponent(q)}`
        : `/api/github/repos?page=${p}`;
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json() as GitHubRepo[];
      if (append) {
        setRepos(prev => [...prev, ...data]);
      } else {
        setRepos(data);
      }
      setHasMore(data.length >= (q ? 30 : 50));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void load('', 1, false); }, [load]);

  const handleSearch = (q: string) => {
    setSearch(q);
    setPage(1);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { void load(q, 1, false); }, 300);
  };

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    void load(search, next, true);
  };

  return (
    <div className={styles.repoBrowser}>
      <div className={styles.repoSearch}>
        <span className={styles.repoSearchIcon}>🔍</span>
        <input
          className={styles.repoSearchInput}
          placeholder="Search your repos…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      <div className={styles.repoList}>
        {loading ? (
          <div className={styles.repoLoading}>Loading repos…</div>
        ) : repos.length === 0 ? (
          <div className={styles.repoEmpty}>No repos found.</div>
        ) : (
          repos.map(repo => (
            <button
              key={repo.full_name}
              className={`${styles.repoItem} ${selected === repo.html_url ? styles.repoItemSelected : ''}`}
              onClick={() => onSelect(repo)}
            >
              <div className={styles.repoItemLeft}>
                <span className={styles.repoName}>{repo.name}</span>
                {repo.private && <span className={styles.privateBadge}>Private</span>}
                {repo.description && (
                  <span className={styles.repoDesc}>{repo.description}</span>
                )}
              </div>
              <span className={styles.repoDate}>
                {new Date(repo.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </button>
          ))
        )}
      </div>

      {hasMore && !loading && (
        <button className={styles.loadMoreBtn} onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

// ── Deploy Card ───────────────────────────────────────────────────────────────

interface DeployCardProps {
  item: UploadedContent;
  onRefresh: () => void;
}

function DeployCard({ item, onRefresh }: DeployCardProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<'delete' | 'stop' | 'restart' | null>(null);

  const vipUrl = item.shareToken ? `${window.location.origin}/vip/${item.shareToken}` : null;
  const hasBackend = !!(item.backendPort || item.backendPrefix);
  const backendRunning = !!item.backendPort;
  const isExpired = !!item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now();

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
      onRefresh();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setActing('delete');
    try { await deleteContent(item.id); onRefresh(); } finally { setActing(null); }
  };

  const handleStop = async () => {
    setActing('stop');
    try { await stopBackend(item.id); onRefresh(); } catch { /* ignore */ } finally { setActing(null); }
  };

  const handleRestart = async () => {
    setActing('restart');
    try { await restartBackend(item.id); onRefresh(); } catch { /* ignore */ } finally { setActing(null); }
  };

  const expiry = formatExpiry(item.expiresAt ?? undefined);

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
            {hasBackend && (
              <span className={`${styles.backendBadge} ${backendRunning ? styles.backendRunning : styles.backendStopped}`}>
                {backendRunning ? '● Node' : '○ Node (stopped)'}
              </span>
            )}
          </div>
        </div>
        <button
          className={styles.openBtn}
          onClick={() => navigate(`/apps/${item.id}`)}
          title="Open app"
        >↗</button>
      </div>

      {vipUrl && (
        <div className={styles.vipRow}>
          <a href={vipUrl} target="_blank" rel="noreferrer" className={styles.vipUrl}>
            {vipUrl.replace(window.location.origin, '')}
          </a>
          <button className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`} onClick={handleCopy}>
            {copied ? '✓' : 'Copy'}
          </button>
        </div>
      )}

      <div className={styles.cardFooter}>
        {hasBackend && (
          backendRunning ? (
            <button
              className={styles.stopBtn}
              onClick={() => void handleStop()}
              disabled={acting !== null}
            >
              {acting === 'stop' ? 'Stopping…' : '■ Stop backend'}
            </button>
          ) : (
            <button
              className={styles.restartBtn}
              onClick={() => void handleRestart()}
              disabled={acting !== null}
            >
              {acting === 'restart' ? 'Starting…' : '▶ Start backend'}
            </button>
          )
        )}
        <button className={styles.dangerBtn} onClick={() => void handleDelete()} disabled={acting !== null}>
          {acting === 'delete' ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ── Deploy Page ───────────────────────────────────────────────────────────────

export function DeployPage() {
  const { user } = useGitHubAuth();
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<UploadedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);

  const [tab, setTab] = useState<'zip' | 'github'>('zip');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [build, setBuild] = useState(false);
  const [deploy, setDeploy] = useState<DeployState>({ status: 'idle', progress: 0 });
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [liveCopied, setLiveCopied] = useState(false);
  const [filterSelected, setFilterSelected] = useState<Record<string, boolean>>({});
  const [backendEntry, setBackendEntry] = useState('');
  const [backendPrefix, setBackendPrefix] = useState('');
  const [backendDb, setBackendDb] = useState(false);
  const [backendConfiguring, setBackendConfiguring] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const importUrl = searchParams.get('import');
    if (importUrl) { setGitUrl(importUrl); setTab('github'); }
  }, [searchParams]);

  const fetchItems = useCallback(async () => {
    try {
      const [all, storageData, queueData] = await Promise.all([
        listContent(),
        getStorageInfo(),
        user ? getQueue().catch(() => null) : Promise.resolve(null),
      ]);
      setItems(all.filter(i => i.uploadedBy === user?.login).sort(
        (a, b) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime()
      ));
      setStorage(storageData);
      if (queueData) setQueueItems(queueData.items.filter(q => q.status === 'waiting' || q.status === 'processing'));
    } finally { setLoading(false); }
  }, [user, user?.login]);

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

  const handleRepoSelect = (repo: GitHubRepo) => {
    setGitUrl(repo.html_url);
    setSelectedRepo(repo.html_url);
    if (!name) setName(repo.name);
    // Guess that source repos need building
    if (repo.description?.toLowerCase().includes('react') || repo.description?.toLowerCase().includes('vite')) {
      setBuild(true);
    }
  };

  const resetDeploy = () => {
    setDeploy({ status: 'idle', progress: 0 });
    setFile(null);
    setName('');
    setGitUrl('');
    setSelectedRepo(null);
    setBuild(false);
    setEnvValues({});
    setShowEnvForm(false);
    setFilterSelected({});
    setBackendEntry('');
    setBackendPrefix('');
    setBackendDb(false);
    setBackendConfiguring(false);
  };

  const handleDeploy = async () => {
    if (!name.trim()) return;
    if (tab === 'zip' && !file) return;
    if (tab === 'github' && !gitUrl.trim()) return;

    // Storage is low — free users must queue (GitHub only); ZIP not accepted
    if (storage?.status === 'low' && !isPro) {
      if (tab === 'zip') {
        setDeploy({ status: 'failed', progress: 0, error: 'Storage is at capacity. ZIP uploads require Pro when storage is low. Use GitHub import to join the queue, or upgrade to Pro.' });
        return;
      }
      // GitHub → enqueue
      setDeploy({ status: 'uploading', progress: 10 });
      try {
        const q = await enqueueGitHub(gitUrl, name.trim(), '', build);
        setDeploy({ status: 'queued', progress: 100, queuePosition: q.position, queueMessage: q.message });
        void fetchItems();
      } catch (err) {
        setDeploy({ status: 'failed', progress: 0, error: err instanceof Error ? err.message : 'Queue failed' });
      }
      return;
    }

    if (storage?.status === 'critical') {
      setDeploy({ status: 'failed', progress: 0, error: 'Server storage is critically full. Deployments are suspended. Please try again later.' });
      return;
    }

    setDeploy({ status: 'uploading', progress: 0 });

    try {
      let result: { id: string; shareToken?: string; buildLog?: string | null; envVarsRequired?: string[] };

      if (tab === 'zip') {
        const fd = new FormData();
        fd.append('archive', file!);
        fd.append('name', name.trim());
        if (build) fd.append('build', 'true');

        result = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/content');
          xhr.withCredentials = true;
          xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) setDeploy(s => ({ ...s, progress: Math.round(e.loaded / e.total * 80) }));
          });
          xhr.addEventListener('load', () => {
            try {
              const json = JSON.parse(xhr.responseText) as typeof result & { error?: string; needsFilter?: boolean; tempId?: string; dirs?: DirScanEntry[]; totalFiles?: number };
              // Server needs us to pick which directories to include
              if (xhr.status === 200 && json.needsFilter && json.tempId && json.dirs) {
                const initial: Record<string, boolean> = {};
                for (const d of json.dirs) {
                  initial[d.name] = d.name === '__root__' || BUILD_OUTPUT_DIRS.has(d.name.toLowerCase());
                }
                setFilterSelected(initial);
                setDeploy({
                  status: 'filtering',
                  progress: 100,
                  tempId: json.tempId,
                  scanDirs: json.dirs,
                  totalScannedFiles: json.totalFiles,
                });
                resolve({ id: '', shareToken: undefined }); // sentinel — filtering state handles the rest
                return;
              }
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

      // If server returned needsFilter, state is already set to 'filtering' — bail out
      if (!result.id) return;

      setDeploy(s => ({ ...s, progress: 90, buildLog: result.buildLog ?? undefined }));

      const det = (result as typeof result & { detectedBackend?: DetectedBackend | null }).detectedBackend ?? null;

      if (result.envVarsRequired && result.envVarsRequired.length > 0) {
        const initial: Record<string, string> = {};
        result.envVarsRequired.forEach(k => { initial[k] = ''; });
        setEnvValues(initial);
        setShowEnvForm(true);
        setDeploy({ status: 'building', progress: 95, id: result.id, shareToken: result.shareToken, envVarsRequired: result.envVarsRequired, detectedBackend: det });
        return;
      }

      if (det) {
        setBackendEntry(det.entryPoint);
        setBackendPrefix(det.suggestedPrefix);
        setBackendDb(det.provisionDb);
        setDeploy({ status: 'configuring-backend', progress: 100, id: result.id, shareToken: result.shareToken, detectedBackend: det });
        return;
      }

      setDeploy({ status: 'live', progress: 100, id: result.id, shareToken: result.shareToken, buildLog: result.buildLog ?? undefined });
      void fetchItems();
    } catch (err) {
      setDeploy(s => ({ ...s, status: 'failed', error: err instanceof Error ? err.message : 'Deploy failed' }));
    }
  };

  const handleConfirmFilter = async () => {
    if (!deploy.tempId) return;
    const selected = Object.entries(filterSelected).filter(([, v]) => v).map(([k]) => k);
    if (selected.length === 0) return;
    setDeploy(s => ({ ...s, status: 'uploading', progress: 10 }));
    try {
      const res = await fetch('/api/content/confirm-filter', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempId: deploy.tempId, selectedDirs: selected, name: name.trim() }),
      });
      const json = await res.json() as { id?: string; shareToken?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? 'Deploy failed');
      setDeploy({ status: 'live', progress: 100, id: json.id, shareToken: json.shareToken });
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
    if (deploy.detectedBackend) {
      // Env vars saved — now offer backend configuration
      setBackendEntry(deploy.detectedBackend.entryPoint);
      setBackendPrefix(deploy.detectedBackend.suggestedPrefix);
      setBackendDb(deploy.detectedBackend.provisionDb);
      setDeploy(s => ({ ...s, status: 'configuring-backend', progress: 100 }));
    } else {
      setDeploy(s => ({ ...s, status: 'live', progress: 100 }));
      void fetchItems();
    }
  };

  const handleConfigureBackend = async () => {
    if (!deploy.id) return;
    setBackendConfiguring(true);
    try {
      await configureBackend(deploy.id, {
        entryPoint: backendEntry,
        prefix: backendPrefix,
        provisionDb: backendDb,
        envVars: envValues,
      });
      setDeploy(s => ({ ...s, status: 'live', progress: 100 }));
      void fetchItems();
    } catch (err) {
      setDeploy(s => ({
        ...s,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Backend configuration failed',
      }));
    } finally {
      setBackendConfiguring(false);
    }
  };

  const vipUrl = deploy.shareToken ? `${window.location.origin}/vip/${deploy.shareToken}` : null;
  const handleCopyLive = () => {
    if (!vipUrl) return;
    void navigator.clipboard.writeText(vipUrl).then(() => {
      setLiveCopied(true);
      setTimeout(() => setLiveCopied(false), 2000);
    });
  };

  const isPro = (user as (typeof user & { tier?: string }) | null)?.tier === 'pro';
  const canDeploy = !!(
    name.trim() &&
    (tab === 'zip' ? file : gitUrl.trim())
  );

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Deploy</h1>
          <p className={styles.subtitle}>Ship your AI code in seconds</p>
        </div>
        {isPro && <span className={styles.proBadge}>PRO</span>}
      </div>

      {/* ── Storage warning banner ── */}
      {storage && storage.status !== 'ok' && (
        <div className={`${styles.storageBanner} ${storage.status === 'critical' ? styles.storageCritical : styles.storageLow}`}>
          <span className={styles.storageBannerIcon}>{storage.status === 'critical' ? '🚫' : '⚠️'}</span>
          <div>
            <strong>{storage.status === 'critical' ? 'Storage critically full' : 'Storage at capacity'}</strong>
            {' — '}{storage.freeMB} MB free ({storage.percentUsed}% used).
            {storage.status === 'low' && !isPro && (
              <> Free-tier deployments are queued. <a href="/settings#pro" className={styles.storageBannerLink}>Upgrade to Pro</a> for instant deployment.</>
            )}
            {storage.status === 'critical' && ' All deployments are suspended until space frees up.'}
          </div>
        </div>
      )}

      {/* ── Deploy Panel ── */}
      <div className={styles.deployPanel}>
        {deploy.status === 'filtering' && deploy.scanDirs ? (
          <div className={styles.filterPanel}>
            <h2 className={styles.filterTitle}>Choose what to include</h2>
            <p className={styles.filterSubtitle}>
              This ZIP has {deploy.totalScannedFiles?.toLocaleString()} files after removing <code>node_modules</code>.
              Select the directories you need:
            </p>
            <div className={styles.filterList}>
              {deploy.scanDirs.map(dir => {
                const checked = filterSelected[dir.name] ?? false;
                const label = dir.name === '__root__' ? 'Root files (index.html, package.json, …)' : `${dir.name}/`;
                return (
                  <label key={dir.name} className={`${styles.filterRow} ${checked ? styles.filterRowChecked : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => setFilterSelected(s => ({ ...s, [dir.name]: e.target.checked }))}
                      className={styles.filterCheck}
                    />
                    <span className={styles.filterDirIcon}>{dir.name === '__root__' ? '📄' : '📁'}</span>
                    <span className={styles.filterDirName}>{label}</span>
                    <span className={styles.filterDirMeta}>{dir.files.toLocaleString()} files · {fmtBytes(dir.bytes)}</span>
                  </label>
                );
              })}
            </div>
            {(() => {
              const selectedFiles = deploy.scanDirs
                .filter(d => filterSelected[d.name])
                .reduce((s, d) => s + d.files, 0);
              const hasSelection = selectedFiles > 0;
              return (
                <div className={styles.filterActions}>
                  <button className={styles.deployBtn} disabled={!hasSelection} onClick={() => void handleConfirmFilter()}>
                    Deploy {hasSelection ? `${selectedFiles.toLocaleString()} files` : ''} →
                  </button>
                  <button className={styles.retryBtn} onClick={resetDeploy}>Cancel</button>
                </div>
              );
            })()}
          </div>
        ) : deploy.status === 'idle' || deploy.status === 'failed' ? (
          <>
            {deploy.status === 'failed' && (
              <div className={styles.errorBanner}>
                <span>✕ {deploy.error}</span>
                <button className={styles.retryBtn} onClick={resetDeploy}>Try again</button>
              </div>
            )}

            <div className={styles.tabs}>
              <button className={`${styles.tab} ${tab === 'zip' ? styles.tabActive : ''}`} onClick={() => setTab('zip')}>
                📦 ZIP Upload
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
                    <span className={styles.dropHint}>Max 200 MB · index.html required</span>
                  </div>
                )}
              </div>
            ) : (
              <RepoBrowser onSelect={handleRepoSelect} selected={selectedRepo} />
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
                npm build
              </label>
            </div>

            {tab === 'github' && gitUrl && !selectedRepo && (
              <div className={styles.manualUrlRow}>
                <span className={styles.manualUrlLabel}>URL:</span>
                <input
                  className={styles.urlInput}
                  value={gitUrl}
                  onChange={e => setGitUrl(e.target.value)}
                  placeholder="https://github.com/user/repo"
                />
              </div>
            )}

            {tab === 'github' && selectedRepo && (
              <div className={styles.selectedRepoRow}>
                <span className={styles.selectedRepoUrl}>{selectedRepo.replace('https://github.com/', '')}</span>
                <button className={styles.clearRepoBtn} onClick={() => { setSelectedRepo(null); setGitUrl(''); }}>
                  Change
                </button>
              </div>
            )}

            <button
              className={styles.deployBtn}
              disabled={!canDeploy}
              onClick={() => void handleDeploy()}
            >
              Deploy →
            </button>
          </>
        ) : deploy.status === 'configuring-backend' ? (
          <div className={styles.envForm}>
            <p className={styles.envTitle}>Backend detected — configure it to start automatically:</p>
            <div className={styles.envRow}>
              <label className={styles.envLabel}>Entry point</label>
              <input
                className={styles.envInput}
                value={backendEntry}
                onChange={e => setBackendEntry(e.target.value)}
                placeholder="backend/dist/index.js"
              />
            </div>
            <div className={styles.envRow}>
              <label className={styles.envLabel}>URL prefix</label>
              <input
                className={styles.envInput}
                value={backendPrefix}
                onChange={e => setBackendPrefix(e.target.value)}
                placeholder="/apps/my-project"
              />
            </div>
            <div className={styles.envRow}>
              <label className={styles.envLabel}>
                <input
                  type="checkbox"
                  checked={backendDb}
                  onChange={e => setBackendDb(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                Auto-provision PostgreSQL database
              </label>
            </div>
            <div className={styles.envActions}>
              <button
                className={styles.deployBtn}
                style={{ width: 'auto', padding: '10px 20px' }}
                disabled={backendConfiguring || !backendEntry.trim() || !backendPrefix.trim()}
                onClick={() => void handleConfigureBackend()}
              >
                {backendConfiguring ? 'Starting…' : 'Start backend →'}
              </button>
              <button className={styles.skipBtn} onClick={() => {
                setDeploy(s => ({ ...s, status: 'live', progress: 100 }));
                void fetchItems();
              }}>
                Skip
              </button>
            </div>
          </div>
        ) : deploy.status === 'uploading' || deploy.status === 'building' ? (
          <div className={styles.progressPanel}>
            <div className={styles.progressSteps}>
              <div className={`${styles.pStep} ${styles.pStepDone}`}>✓ Connected</div>
              <div className={`${styles.pStep} ${deploy.progress >= 50 ? styles.pStepDone : styles.pStepActive}`}>
                {deploy.status === 'uploading' ? '⟳ Uploading…' : '✓ Uploaded'}
              </div>
              <div className={`${styles.pStep} ${deploy.progress >= 90 ? styles.pStepDone : deploy.status === 'building' ? styles.pStepActive : ''}`}>
                {deploy.progress >= 90 ? '✓ Built' : deploy.status === 'building' ? '⟳ Building…' : '◦ Build'}
              </div>
              <div className={`${styles.pStep} ${showEnvForm ? styles.pStepActive : ''}`}>◦ Live</div>
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${deploy.progress}%` }} />
            </div>
            <p className={styles.progressNote}>
              {showEnvForm ? 'Set your env vars below to go live' : 'Usually under 30 seconds…'}
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
                  <button className={styles.deployBtn} style={{ width: 'auto', padding: '10px 20px' }} onClick={() => void handleSubmitEnv()}>
                    Set & go live
                  </button>
                  <button className={styles.skipBtn} onClick={() => {
                    setShowEnvForm(false);
                    setDeploy(s => ({ ...s, status: 'live', progress: 100 }));
                    void fetchItems();
                  }}>Skip</button>
                </div>
              </div>
            )}
          </div>
        ) : deploy.status === 'queued' ? (
          <div className={styles.queuedPanel}>
            <div className={styles.queuedIcon}>⏳</div>
            <h2 className={styles.queuedTitle}>You're #{deploy.queuePosition} in queue</h2>
            <p className={styles.queuedMsg}>
              Storage is currently at capacity for free accounts. Your deployment will run automatically when space frees up — usually within 24 hours as older deployments expire.
            </p>
            <a href="/settings#pro" className={styles.queuedUpgradeBtn}>
              Upgrade to Pro for instant deployment →
            </a>
            <button className={styles.newDeployBtn} style={{ marginTop: 12 }} onClick={resetDeploy}>Queue another</button>
          </div>
        ) : (
          <div className={styles.livePanel}>
            <div className={styles.liveIcon}>🚀</div>
            <h2 className={styles.liveTitle}>Live!</h2>
            {vipUrl && (
              <div className={styles.liveLink}>
                <a href={vipUrl} target="_blank" rel="noreferrer" className={styles.liveLinkText}>{vipUrl}</a>
                <button className={`${styles.copyBtn} ${liveCopied ? styles.copyBtnDone : ''}`} onClick={handleCopyLive}>
                  {liveCopied ? '✓' : 'Copy'}
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
            <p>No deployments yet. Drop a ZIP or pick a GitHub repo above.</p>
          </div>
        )}
        {items.length > 0 && (
          <div className={styles.grid}>
            {items.map(item => (
              <DeployCard key={item.id} item={item} onRefresh={() => { setLoading(true); void fetchItems(); }} />
            ))}
          </div>
        )}
        {!isPro && (items.length > 0 || queueItems.length > 0) && (
          <p className={styles.tierNote}>
            Free tier: 1 deploy/day · 24-hour links.{' '}
            <a href="/settings#pro" className={styles.upgradeLink}>Upgrade to Pro</a> for permanent links &amp; unlimited deploys.
          </p>
        )}
      </div>

      {/* ── Queue section ── */}
      {queueItems.length > 0 && (
        <div className={styles.deploymentsSection}>
          <h2 className={styles.deploymentsTitle}>
            ⏳ Queued deployments
            <span className={styles.queueHint}> — will deploy automatically when storage frees up</span>
          </h2>
          <div className={styles.queueList}>
            {queueItems.map((q, i) => (
              <div key={q.id} className={styles.queueItem}>
                <div className={styles.queueItemLeft}>
                  <span className={styles.queuePos}>#{i + 1}</span>
                  <div>
                    <div className={styles.queueItemName}>{q.name}</div>
                    <div className={styles.queueItemUrl}>{q.git_url.replace('https://github.com/', '')}</div>
                  </div>
                </div>
                <div className={styles.queueItemRight}>
                  {q.status === 'processing' && <span className={styles.queueProcessing}>⟳ Processing…</span>}
                  {q.status === 'waiting' && <span className={styles.queueWaiting}>Waiting</span>}
                  <button
                    className={styles.queueCancelBtn}
                    onClick={() => { void cancelQueueItem(q.id).then(() => fetchItems()); }}
                  >Cancel</button>
                </div>
              </div>
            ))}
          </div>
          <p className={styles.queueUpgradeCta}>
            <a href="/settings#pro" className={styles.upgradeLink}>Upgrade to Pro</a> to skip the queue and deploy instantly — always.
          </p>
        </div>
      )}
    </div>
  );
}
