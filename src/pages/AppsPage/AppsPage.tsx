import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUploadedContentItems, type UploadedContent } from '../../services/uploadedContent';
import styles from './AppsPage.module.css';

function AppCard({ app, onLaunch }: { app: UploadedContent; onLaunch: () => void }) {
  const uploadedDate = new Date(app.uploadedAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  return (
    <div className={styles.card}>
      {app.thumbnailPath ? (
        <img
          src={app.thumbnailPath}
          alt=""
          className={styles.thumbnail}
          loading="lazy"
        />
      ) : (
        <div className={styles.thumbnailPlaceholder}>📦</div>
      )}
      <div className={styles.cardBody}>
        <h3 className={styles.cardName}>{app.name}</h3>
        {app.description && <p className={styles.cardDesc}>{app.description}</p>}
        <span className={styles.cardMeta}>by {app.uploadedBy} · {uploadedDate}</span>
      </div>
      <div className={styles.cardFooter}>
        <button className={styles.launchBtn} onClick={onLaunch}>
          Launch →
        </button>
      </div>
    </div>
  );
}

export function AppsPage() {
  const navigate = useNavigate();
  const { items } = useUploadedContentItems();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const handleLaunch = (app: UploadedContent) => {
    if (app.portalRoute) {
      navigate(app.portalRoute);
    } else {
      navigate(`/apps/${encodeURIComponent(app.id)}`);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Apps</h2>
          <p className={styles.pageSubtitle}>Publish and launch your projects instantly</p>
        </div>
        <Link to="/content" className={styles.publishBtn}>
          + Publish App
        </Link>
      </div>

      {items.length > 0 && (
        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search apps…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🚀</span>
          <h3 className={styles.emptyTitle}>No apps yet</h3>
          <p className={styles.emptyDesc}>
            Publish your first project — HTML, React build, or any static bundle.
          </p>
          <Link to="/content" className={styles.emptyBtn}>Publish your first app</Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className={styles.loading}>No apps match your search.</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map((app) => (
            <AppCard key={app.id} app={app} onLaunch={() => handleLaunch(app)} />
          ))}
        </div>
      )}
    </div>
  );
}
