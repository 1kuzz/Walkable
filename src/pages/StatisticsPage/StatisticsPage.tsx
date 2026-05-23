import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjectStats, type ProjectSummary } from '../../api/projectsClient';
import styles from './StatisticsPage.module.css';

export function StatisticsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProjectStats()
      .then(setStats)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Statistics</h1>
        <p className={styles.pageSubtitle}>Platform overview and top projects</p>
      </div>

      {loading && <p className={styles.loading}>Loading…</p>}
      {error && <p className={styles.errorMsg}>Failed to load stats: {error}</p>}

      {stats && (
        <>
          <div className={styles.totalCard}>
            <span className={styles.totalNumber}>{stats.totalProjects}</span>
            <span className={styles.totalLabel}>approved project{stats.totalProjects !== 1 ? 's' : ''}</span>
          </div>

          <div className={styles.tables}>
            <section className={styles.tableSection}>
              <h2 className={styles.sectionTitle}>Most viewed</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>#</th>
                    <th className={styles.th}>Project</th>
                    <th className={`${styles.th} ${styles.thNum}`}>Views</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topByViews.length === 0 && (
                    <tr><td colSpan={3} className={styles.emptyRow}>No data yet</td></tr>
                  )}
                  {stats.topByViews.map((p, i) => (
                    <tr
                      key={p.id}
                      className={styles.row}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/projects/${p.id}`)}
                    >
                      <td className={styles.tdRank}>{i + 1}</td>
                      <td className={styles.tdName}>
                        <span className={styles.projectName}>{p.name}</span>
                        {p.owner_login && <span className={styles.ownerName}>{p.owner_login}</span>}
                      </td>
                      <td className={`${styles.td} ${styles.tdNum}`}>{p.views.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={styles.tableSection}>
              <h2 className={styles.sectionTitle}>Most starred on GitHub</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>#</th>
                    <th className={styles.th}>Project</th>
                    <th className={`${styles.th} ${styles.thNum}`}>Stars</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topByStars.length === 0 && (
                    <tr><td colSpan={3} className={styles.emptyRow}>No data yet</td></tr>
                  )}
                  {stats.topByStars.map((p, i) => (
                    <tr
                      key={p.id}
                      className={styles.row}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/projects/${p.id}`)}
                    >
                      <td className={styles.tdRank}>{i + 1}</td>
                      <td className={styles.tdName}>
                        <span className={styles.projectName}>{p.name}</span>
                        {p.owner_login && <span className={styles.ownerName}>{p.owner_login}</span>}
                      </td>
                      <td className={`${styles.td} ${styles.tdNum}`}>⭐ {p.stars.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
