import { Router } from 'express';
import { pool } from '../db/client';
import { requireAuth } from '../middleware/requireAuth';
import type { AuthenticatedUser } from '../types';
import type { Request } from 'express';

const router = Router();

function getUser(req: Request): AuthenticatedUser {
  return (req as unknown as { authUser: AuthenticatedUser }).authUser
    ?? { login: 'anonymous', displayName: 'Anonymous', isAdmin: false };
}

const SELECT_COLS = `
  u.id, u.title, u.description, u.date, u.type,
  u.app_name AS "appName", u.version,
  u.tag_id AS "tagId",
  t.label AS "tagLabel", t.color AS "tagColor",
  u.published_by AS "publishedBy",
  u.is_pinned AS "isPinned",
  u.created_at AS "createdAt"
`;

/** GET /api/updates — paginated feed with optional filters */
router.get('/', async (req, res) => {
  try {
    const user = getUser(req);
    const { type, tagId, q, limit = '20', offset = '0' } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (type && type !== 'all') {
      conditions.push(`u.type = $${p++}`);
      params.push(type);
    }
    if (tagId) {
      conditions.push(`u.tag_id = $${p++}`);
      params.push(tagId);
    }
    if (q) {
      conditions.push(`(u.title ILIKE $${p} OR u.description ILIKE $${p})`);
      params.push(`%${q}%`);
      p++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM updates u ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const off = parseInt(offset, 10) || 0;

    const result = await pool.query(
      `SELECT ${SELECT_COLS}
       FROM updates u
       LEFT JOIN update_tags t ON t.id = u.tag_id
       ${where}
       ORDER BY u.is_pinned DESC, u.date DESC, u.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, lim, off],
    );

    // Compute unread count (total unread, ignoring current filters)
    const unreadResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM updates u
       WHERE NOT EXISTS (
         SELECT 1 FROM update_reads r
         WHERE r.update_id = u.id AND r.user_login = $1
       )`,
      [user.login],
    );
    const unreadCount = parseInt(unreadResult.rows[0]?.count ?? '0', 10);

    res.json({ updates: result.rows, total, unreadCount });
  } catch (err) {
    console.error('[updates] GET / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/updates/unread-count */
router.get('/unread-count', async (req, res) => {
  try {
    const user = getUser(req);
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM updates u
       WHERE NOT EXISTS (
         SELECT 1 FROM update_reads r
         WHERE r.update_id = u.id AND r.user_login = $1
       )`,
      [user.login],
    );
    res.json({ count: parseInt(result.rows[0]?.count ?? '0', 10) });
  } catch (err) {
    console.error('[updates] GET /unread-count error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/updates — create (admin only) */
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const { id, title, description, date, type, appName, version, tagId } = req.body as {
      id: string; title: string; description: string; date: string;
      type?: string; appName?: string; version?: string; tagId?: string | null;
    };

    if (!id || !title || !date) {
      res.status(400).json({ error: 'id, title, date are required.' });
      return;
    }

    await pool.query(
      `INSERT INTO updates (id, title, description, date, type, app_name, version, tag_id, published_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, title, description ?? '', date, type ?? 'news', appName ?? null, version ?? null, tagId ?? null, user.login],
    );

    res.status(201).json({ id });
  } catch (err) {
    console.error('[updates] POST / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PUT /api/updates/:id — edit (admin only) */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, date, type, appName, version, tagId } = req.body as {
      title: string; description: string; date: string;
      type?: string; appName?: string; version?: string; tagId?: string | null;
    };

    if (!title || !date) {
      res.status(400).json({ error: 'title and date are required.' });
      return;
    }

    const result = await pool.query(
      `UPDATE updates
       SET title=$1, description=$2, date=$3, type=$4, app_name=$5, version=$6, tag_id=$7
       WHERE id=$8`,
      [title, description ?? '', date, type ?? 'news', appName ?? null, version ?? null, tagId ?? null, id],
    );

    if (result.rowCount === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('[updates] PUT /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** DELETE /api/updates/:id — delete (admin only) */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`DELETE FROM updates WHERE id=$1`, [id]);
    if (result.rowCount === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('[updates] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/updates/:id/pin — toggle pin (admin only) */
router.post('/:id/pin', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query<{ is_pinned: boolean }>(
      `UPDATE updates SET is_pinned = NOT is_pinned WHERE id=$1 RETURNING is_pinned`,
      [id],
    );
    if (result.rowCount === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ isPinned: result.rows[0].is_pinned });
  } catch (err) {
    console.error('[updates] POST /:id/pin error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/updates/mark-read — mark update IDs as read for current user */
router.post('/mark-read', async (req, res) => {
  try {
    const user = getUser(req);
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) { res.json({ success: true }); return; }

    const values = ids.map((_, i) => `($1, $${i + 2})`).join(', ');
    await pool.query(
      `INSERT INTO update_reads (user_login, update_id) VALUES ${values}
       ON CONFLICT DO NOTHING`,
      [user.login, ...ids],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[updates] POST /mark-read error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
