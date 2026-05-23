import { Router } from 'express';
import { pool } from '../db/client';
import type { AuthenticatedUser } from '../types';
import type { Request } from 'express';

const router = Router();

function getUser(req: Request): AuthenticatedUser {
  return (req as unknown as { authUser: AuthenticatedUser }).authUser;
}

/** GET /api/news-updates — all news updates, newest first */
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, date, tag, created_by AS "createdBy"
       FROM news_updates
       ORDER BY date DESC, created_at DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[news-updates] GET / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/news-updates — create (admin only) */
router.post('/', async (req, res) => {
  try {
    const user = getUser(req);
    const { id, title, description, date, tag } = req.body as {
      id: string;
      title: string;
      description: string;
      date: string;
      tag?: string | null;
    };

    if (!id || !title || !description || !date) {
      res.status(400).json({ error: 'id, title, description, date are required.' });
      return;
    }

    await pool.query(
      `INSERT INTO news_updates (id, title, description, date, tag, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, title, description, date, tag ?? null, user.login],
    );

    res.status(201).json({ id });
  } catch (err) {
    console.error('[news-updates] POST / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PUT /api/news-updates/:id — update title/description/date (admin only) */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, date, tag } = req.body as {
      title: string;
      description: string;
      date: string;
      tag?: string | null;
    };

    if (!title || !description || !date) {
      res.status(400).json({ error: 'title, description, date are required.' });
      return;
    }

    const result = await pool.query(
      `UPDATE news_updates SET title = $1, description = $2, date = $3, tag = $4
       WHERE id = $5`,
      [title, description, date, tag ?? null, id],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[news-updates] PUT /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** DELETE /api/news-updates/:id — delete (admin only) */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM news_updates WHERE id = $1`,
      [id],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[news-updates] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
