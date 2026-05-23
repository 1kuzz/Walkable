import { Router } from 'express';
import { pool } from '../db/client';
import type { AuthenticatedUser } from '../types';
import type { Request, Response } from 'express';

const router = Router();

function getUser(req: Request): AuthenticatedUser {
  return (req as unknown as { authUser: AuthenticatedUser }).authUser;
}

/**
 * Parse optional `from` and `to` ISO date query params.
 * Returns a SQL fragment and param array to append to an existing WHERE clause.
 * `paramOffset` is the index of the next positional parameter (e.g. 1 if no prior params).
 */
function buildDateRangeClause(
  req: Request,
  paramOffset: number,
): { clause: string; params: string[] } {
  const { from, to } = req.query as { from?: string; to?: string };
  const params: string[] = [];
  const conditions: string[] = [];

  if (from) {
    const d = new Date(String(from));
    if (!isNaN(d.getTime())) {
      params.push(d.toISOString());
      conditions.push(`timestamp >= $${paramOffset + params.length - 1}`);
    }
  }
  if (to) {
    const d = new Date(String(to));
    if (!isNaN(d.getTime())) {
      // Treat `to` as end-of-day when only a date (no time) is supplied
      if (!String(to).includes('T')) d.setUTCHours(23, 59, 59, 999);
      params.push(d.toISOString());
      conditions.push(`timestamp <= $${paramOffset + params.length - 1}`);
    }
  }

  return {
    clause: conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '',
    params,
  };
}

/** POST /api/usage/events — record a tracking event */
router.post('/events', async (req, res) => {
  try {
    const user = getUser(req);
    const { id, type, target, timestamp, sessionId, metadata } = req.body as {
      id?: string;
      type: string;
      target: string;
      timestamp?: string;
      sessionId?: string;
      metadata?: string;
    };

    if (!type || !target) {
      res.status(400).json({ error: 'type and target are required.' });
      return;
    }

    const eventId = id ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const ts = timestamp ?? new Date().toISOString();

    await pool.query(
      `INSERT INTO usage_events (id, type, user_login, target, timestamp, session_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [eventId, type, user.login, target, ts, sessionId ?? null, metadata ?? null],
    );

    res.status(201).json({ id: eventId });
  } catch (err) {
    console.error('[usage] POST /events error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/events — all events, newest first (admin only) */
router.get('/events', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '2000'), 10) || 2000, 2000);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
    const { clause, params } = buildDateRangeClause(req, 1);
    const result = await pool.query(
      `SELECT id, type, user_login AS "userLogin", target,
              timestamp, session_id AS "sessionId", metadata
       FROM usage_events
       WHERE TRUE${clause}
       ORDER BY timestamp DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[usage] GET /events error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/events/me — current user's events */
router.get('/events/me', async (req, res) => {
  try {
    const user = getUser(req);
    const limit = Math.min(parseInt(String(req.query.limit ?? '500'), 10) || 500, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
    const { clause, params } = buildDateRangeClause(req, 2);
    const result = await pool.query(
      `SELECT id, type, user_login AS "userLogin", target,
              timestamp, session_id AS "sessionId", metadata
       FROM usage_events
       WHERE user_login = $1${clause}
       ORDER BY timestamp DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [user.login, ...params],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[usage] GET /events/me error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/stats/apps — most viewed apps (admin only) */
router.get('/stats/apps', async (req, res) => {
  try {
    const { clause, params } = buildDateRangeClause(req, 1);
    const result = await pool.query(
      `SELECT target AS "appName", COUNT(*)::int AS views
       FROM usage_events
       WHERE type = 'app_click'${clause}
       GROUP BY target
       ORDER BY views DESC`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[usage] GET /stats/apps error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/stats/articles — most viewed KB articles (admin only) */
router.get('/stats/articles', async (req, res) => {
  try {
    const { clause, params } = buildDateRangeClause(req, 1);
    const result = await pool.query(
      `SELECT target AS "articleTitle", COUNT(*)::int AS views
       FROM usage_events
       WHERE type = 'kb_article_view'${clause}
       GROUP BY target
       ORDER BY views DESC`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[usage] GET /stats/articles error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/stats/users — per-user breakdown (admin only) */
router.get('/stats/users', async (req, res) => {
  try {
    const { clause, params } = buildDateRangeClause(req, 1);
    const result = await pool.query(
      `SELECT
         user_login AS "userLogin",
         COUNT(*)::int AS "totalEvents",
         COUNT(*) FILTER (WHERE type = 'page_view')::int AS "pageViews",
         COUNT(*) FILTER (WHERE type = 'app_click')::int AS "appClicks",
         COUNT(*) FILTER (WHERE type = 'kb_article_view')::int AS "articleViews",
         COUNT(*) FILTER (WHERE type = 'search_query')::int AS "searchQueries",
         COUNT(*) FILTER (WHERE type = 'content_view')::int AS "contentViews",
         MAX(timestamp) AS "lastActive"
       FROM usage_events
       WHERE TRUE${clause}
       GROUP BY user_login
       ORDER BY "totalEvents" DESC`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[usage] GET /stats/users error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/stats/app-details — per-app/per-user breakdown (admin only) */
router.get('/stats/app-details', async (req, res) => {
  try {
    const { clause, params } = buildDateRangeClause(req, 1);

    // Fetch session metadata from app_session_end events (supports both legacy integer and JSON formats)
    const durResult = await pool.query(
      `SELECT session_id, metadata
       FROM usage_events
       WHERE type = 'app_session_end' AND session_id IS NOT NULL
         AND metadata IS NOT NULL${clause}`,
      params,
    );

    type SessionMeta = { durationMs: number; wasFullscreen: boolean; hadInteraction: boolean };
    const sessionData = new Map<string, SessionMeta>();

    for (const row of durResult.rows as Array<{ session_id: string; metadata: string }>) {
      const meta = row.metadata.trim();
      if (meta.startsWith('{')) {
        try {
          const parsed = JSON.parse(meta) as {
            durationMs?: number;
            wasFullscreen?: boolean;
            hadInteraction?: boolean;
          };
          sessionData.set(row.session_id, {
            durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : 0,
            wasFullscreen: parsed.wasFullscreen === true,
            hadInteraction: parsed.hadInteraction === true,
          });
        } catch {
          // skip malformed JSON
        }
      } else {
        const ms = parseInt(meta, 10);
        if (!isNaN(ms)) {
          sessionData.set(row.session_id, { durationMs: ms, wasFullscreen: false, hadInteraction: false });
        }
      }
    }

    // Fetch all app_click and content_view events
    const evtResult = await pool.query(
      `SELECT target, user_login, timestamp, session_id
       FROM usage_events
       WHERE type IN ('app_click', 'content_view')${clause}
       ORDER BY timestamp ASC`,
      params,
    );

    type UserEntry = {
      visitCount: number;
      totalDurationMs: number;
      sessionCount: number;
      fullscreenSessions: number;
      interactionSessions: number;
      lastVisit: string;
    };
    const appMap = new Map<string, Map<string, UserEntry>>();

    for (const row of evtResult.rows as Array<{
      target: string;
      user_login: string;
      timestamp: string;
      session_id: string | null;
    }>) {
      if (!appMap.has(row.target)) appMap.set(row.target, new Map());
      const userMap = appMap.get(row.target)!;

      let entry = userMap.get(row.user_login);
      if (!entry) {
        entry = { visitCount: 0, totalDurationMs: 0, sessionCount: 0, fullscreenSessions: 0, interactionSessions: 0, lastVisit: row.timestamp };
        userMap.set(row.user_login, entry);
      }
      entry.visitCount++;
      if (row.timestamp > entry.lastVisit) entry.lastVisit = row.timestamp;

      if (row.session_id && sessionData.has(row.session_id)) {
        const sd = sessionData.get(row.session_id)!;
        entry.totalDurationMs += sd.durationMs;
        entry.sessionCount++;
        if (sd.wasFullscreen) entry.fullscreenSessions++;
        if (sd.hadInteraction) entry.interactionSessions++;
      }
    }

    const result = [];
    for (const [appName, userMap] of appMap) {
      const users = [];
      let totalOpens = 0, totalDuration = 0, sessionCount = 0, fullscreenSessions = 0, interactionSessions = 0;
      for (const [userLogin, entry] of userMap) {
        const avgDurationMs = entry.sessionCount > 0 ? Math.round(entry.totalDurationMs / entry.sessionCount) : 0;
        users.push({
          userLogin,
          visitCount: entry.visitCount,
          totalDurationMs: entry.totalDurationMs,
          avgDurationMs,
          fullscreenSessions: entry.fullscreenSessions,
          interactionSessions: entry.interactionSessions,
          lastVisit: entry.lastVisit,
        });
        totalOpens += entry.visitCount;
        totalDuration += entry.totalDurationMs;
        sessionCount += entry.sessionCount;
        fullscreenSessions += entry.fullscreenSessions;
        interactionSessions += entry.interactionSessions;
      }
      users.sort((a, b) => b.visitCount - a.visitCount);
      result.push({
        appName,
        totalOpens,
        totalDurationMs: totalDuration,
        avgDurationMs: sessionCount > 0 ? Math.round(totalDuration / sessionCount) : 0,
        fullscreenSessions,
        interactionSessions,
        users,
      });
    }
    result.sort((a, b) => b.totalOpens - a.totalOpens);
    res.json(result);
  } catch (err) {
    console.error('[usage] GET /stats/app-details error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/stats/pages — page view counts by path (admin only) */
router.get('/stats/pages', async (req, res) => {
  try {
    const { clause, params } = buildDateRangeClause(req, 1);
    const result = await pool.query(
      `SELECT target AS "page", COUNT(*)::int AS views
       FROM usage_events
       WHERE type = 'page_view'${clause}
       GROUP BY target
       ORDER BY views DESC`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[usage] GET /stats/pages error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/stats/search — search query counts (admin only) */
router.get('/stats/search', async (req, res) => {
  try {
    const { clause, params } = buildDateRangeClause(req, 1);
    const result = await pool.query(
      `SELECT target AS "query", COUNT(*)::int AS count
       FROM usage_events
       WHERE type = 'search_query'${clause}
       GROUP BY target
       ORDER BY count DESC`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[usage] GET /stats/search error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/stats/content — uploaded content view counts (admin only) */
router.get('/stats/content', async (req, res) => {
  try {
    const { clause, params } = buildDateRangeClause(req, 1);
    const result = await pool.query(
      `SELECT target AS "contentName", COUNT(*)::int AS views
       FROM usage_events
       WHERE type = 'content_view'${clause}
       GROUP BY target
       ORDER BY views DESC`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[usage] GET /stats/content error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/stats/overview — aggregate counts (admin only) */
router.get('/stats/overview', async (req, res) => {
  try {
    const { clause, params } = buildDateRangeClause(req, 1);
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS "totalEvents",
         COUNT(DISTINCT user_login)::int AS "uniqueUsers",
         COUNT(DISTINCT CASE WHEN type = 'app_click' THEN target END)::int AS "appsTracked",
         COUNT(DISTINCT CASE WHEN type = 'kb_article_view' THEN target END)::int AS "articlesViewed"
       FROM usage_events
       WHERE TRUE${clause}`,
      params,
    );
    res.json(result.rows[0] ?? { totalEvents: 0, uniqueUsers: 0, appsTracked: 0, articlesViewed: 0 });
  } catch (err) {
    console.error('[usage] GET /stats/overview error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/events/export — CSV download of all events (admin only) */
router.get('/events/export', async (req, res) => {
  try {
    const { clause, params } = buildDateRangeClause(req, 1);
    const result = await pool.query(
      `SELECT id, type, user_login, target, timestamp, session_id, metadata
       FROM usage_events
       WHERE TRUE${clause}
       ORDER BY timestamp DESC`,
      params,
    );

    const header = 'id,type,user_login,target,timestamp,session_id,metadata\n';
    const rows = result.rows.map((row: Record<string, string | null>) => {
      const escape = (v: string | null) => {
        if (v === null || v === undefined) return '';
        const str = String(v);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };
      return [
        escape(row.id),
        escape(row.type),
        escape(row.user_login),
        escape(row.target),
        escape(row.timestamp),
        escape(row.session_id),
        escape(row.metadata),
      ].join(',');
    });

    const filename = `usage_events_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(header + rows.join('\n'));
  } catch (err) {
    console.error('[usage] GET /events/export error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/usage/stats/trend — time-series event counts (admin only) */
router.get('/stats/trend', async (req: Request, res: Response) => {
  try {
    // Map validated granularity values to safe SQL date_trunc literals.
    // Interpolation is avoided: the query string is selected from a fixed map,
    // so no user input ever reaches the SQL template.
    const granularityQueries: Record<string, string> = {
      hour: `SELECT date_trunc('hour', timestamp) AS period, COUNT(*)::int AS events, COUNT(DISTINCT user_login)::int AS users FROM usage_events WHERE TRUE`,
      day: `SELECT date_trunc('day', timestamp) AS period, COUNT(*)::int AS events, COUNT(DISTINCT user_login)::int AS users FROM usage_events WHERE TRUE`,
      week: `SELECT date_trunc('week', timestamp) AS period, COUNT(*)::int AS events, COUNT(DISTINCT user_login)::int AS users FROM usage_events WHERE TRUE`,
      month: `SELECT date_trunc('month', timestamp) AS period, COUNT(*)::int AS events, COUNT(DISTINCT user_login)::int AS users FROM usage_events WHERE TRUE`,
    };
    const key = String(req.query.granularity ?? 'day');
    const baseQuery = granularityQueries[key] ?? granularityQueries.day;
    const { clause, params } = buildDateRangeClause(req, 1);
    const result = await pool.query(
      `${baseQuery}${clause} GROUP BY period ORDER BY period ASC`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[usage] GET /stats/trend error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
