import { useState, useEffect, useMemo } from 'react';
import { useGitHubAuth } from '../../contexts/useGitHubAuth';
import styles from './StatisticsPage.module.css';

interface DayActivity { day: string; count: number }
interface GithubUser {
  login: string;
  displayName: string;
  avatarUrl: string;
  isAdmin: boolean;
  firstSeen: string;
  lastSeen: string;
}
interface Overview {
  totalEvents: number;
  uniqueUsers: number;
  appsTracked: number;
}

function buildCalendar(activity: DayActivity[]) {
  const countByDay = new Map(activity.map((d) => [d.day, d.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from 52 weeks ago, snapped to Sunday
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay()); // snap to Sunday

  const weeks: Array<Array<{ date: string; count: number; inRange: boolean }>> = [];
  const cursor = new Date(start);

  while (cursor <= today) {
    const week: typeof weeks[0] = [];
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().slice(0, 10);
      week.push({ date: iso, count: countByDay.get(iso) ?? 0, inRange: cursor <= today });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function getLevel(count: number) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ActivityGraph({ activity }: { activity: DayActivity[] }) {
  const weeks = useMemo(() => buildCalendar(activity), [activity]);
  const total = activity.reduce((s, d) => s + d.count, 0);

  // Month labels: find where each month starts
  const monthLabels: Array<{ label: string; col: number }> = [];
  weeks.forEach((week, wi) => {
    const first = week.find((d) => d.inRange);
    if (!first) return;
    const date = new Date(first.date + 'T00:00:00Z');
    if (date.getUTCDate() <= 7 || wi === 0) {
      const m = MONTHS[date.getUTCMonth()];
      if (!monthLabels.length || monthLabels[monthLabels.length - 1].label !== m) {
        monthLabels.push({ label: m, col: wi });
      }
    }
  });

  return (
    <div className={styles.graphWrap}>
      <div className={styles.graphHeader}>
        <span className={styles.graphTitle}>Your activity</span>
        <span className={styles.graphTotal}>{total} events in the last year</span>
      </div>
      <div className={styles.graphScroll}>
        <div className={styles.graphInner}>
          <div className={styles.monthRow}>
            {monthLabels.map((m) => (
              <span key={m.label + m.col} className={styles.monthLabel} style={{ gridColumn: m.col + 1 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className={styles.calendarGrid} style={{ gridTemplateColumns: `repeat(${weeks.length}, 12px)` }}>
            {weeks.map((week, wi) =>
              week.map((day, di) => (
                <div
                  key={`${wi}-${di}`}
                  className={`${styles.cell} ${styles[`level${getLevel(day.count)}`]} ${!day.inRange ? styles.cellFuture : ''}`}
                  title={day.count > 0 ? `${day.date}: ${day.count} events` : day.date}
                  style={{ gridRow: di + 1, gridColumn: wi + 1 }}
                />
              ))
            )}
          </div>
          <div className={styles.legend}>
            <span className={styles.legendLabel}>Less</span>
            {[0,1,2,3,4].map((l) => (
              <div key={l} className={`${styles.cell} ${styles[`level${l}`]}`} />
            ))}
            <span className={styles.legendLabel}>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

async function toggleAdmin(login: string): Promise<{ isAdmin: boolean }> {
  const res = await fetch(`/api/auth/users/${encodeURIComponent(login)}/admin`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to update admin status');
  return res.json() as Promise<{ isAdmin: boolean }>;
}

export function StatisticsPage() {
  const { user } = useGitHubAuth();
  const [activity, setActivity] = useState<DayActivity[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<GithubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingLogin, setTogglingLogin] = useState<string | null>(null);

  useEffect(() => {
    const p1 = fetch('/api/usage/stats/my-activity')
      .then((r) => r.ok ? r.json() as Promise<DayActivity[]> : [])
      .then(setActivity).catch(() => {});
    const p2 = fetch('/api/usage/stats/overview')
      .then((r) => r.ok ? r.json() as Promise<Overview> : null)
      .then((d) => d && setOverview(d)).catch(() => {});
    const p3 = fetch('/api/auth/users')
      .then((r) => r.ok ? r.json() as Promise<GithubUser[]> : [])
      .then(setUsers).catch(() => {});
    void Promise.all([p1, p2, p3]).finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Statistics</h1>
        <p className={styles.pageSubtitle}>Your activity and platform overview</p>
      </div>

      {loading && <p className={styles.loading}>Loading…</p>}

      {!loading && user && <ActivityGraph activity={activity} />}

      {overview && (
        <div className={styles.overviewRow}>
          <div className={styles.overviewCard}>
            <span className={styles.overviewNum}>{overview.totalEvents.toLocaleString()}</span>
            <span className={styles.overviewLabel}>Total events</span>
          </div>
          <div className={styles.overviewCard}>
            <span className={styles.overviewNum}>{overview.uniqueUsers}</span>
            <span className={styles.overviewLabel}>Unique users</span>
          </div>
          <div className={styles.overviewCard}>
            <span className={styles.overviewNum}>{overview.appsTracked}</span>
            <span className={styles.overviewLabel}>Apps launched</span>
          </div>
        </div>
      )}

      {users.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Members</h2>
          <div className={styles.userList}>
            {users.map((u) => (
              <div key={u.login} className={styles.userRow}>
                {u.avatarUrl && (
                  <img src={u.avatarUrl} alt={u.login} className={styles.userAvatar} />
                )}
                <div className={styles.userInfo}>
                  <div className={styles.userLoginRow}>
                    <span className={styles.userLogin}>{u.login}</span>
                    {u.isAdmin && <span className={styles.adminBadge}>Admin</span>}
                  </div>
                  {u.displayName && u.displayName !== u.login && (
                    <span className={styles.userDisplay}>{u.displayName}</span>
                  )}
                </div>
                <span className={styles.userSeen}>
                  Last seen {new Date(u.lastSeen).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {user?.isAdmin && u.login !== user.login && (
                  <button
                    className={`${styles.adminToggle} ${u.isAdmin ? styles.adminToggleRemove : ''}`}
                    disabled={togglingLogin === u.login}
                    onClick={() => {
                      setTogglingLogin(u.login);
                      toggleAdmin(u.login)
                        .then(({ isAdmin }) => {
                          setUsers((prev) => prev.map((x) => x.login === u.login ? { ...x, isAdmin } : x));
                        })
                        .catch(() => {})
                        .finally(() => setTogglingLogin(null));
                    }}
                  >
                    {togglingLogin === u.login ? '…' : u.isAdmin ? 'Remove admin' : 'Make admin'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
