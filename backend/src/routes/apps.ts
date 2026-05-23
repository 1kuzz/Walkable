import { Router } from 'express';
import { pool } from '../db/client';

const router = Router();

/** GET /api/apps — list apps visible to the current user */
router.get('/', async (_req, res): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, category, color, promoted, url
       FROM apps
       ORDER BY id ASC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[apps] GET / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/apps — create a new app (admin only) */
router.post('/', async (req, res): Promise<void> => {
  try {
    const { name, description, category, color, promoted, url } = req.body as {
      name: string;
      description?: string;
      category: string;
      color?: string;
      promoted?: boolean;
      url?: string;
    };

    if (!name || !category) {
      res.status(400).json({ error: 'name and category are required.' });
      return;
    }

    const result = await pool.query<{ id: number }>(
      `INSERT INTO apps (name, description, category, color, promoted, url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [name, description ?? '', category, color ?? '#4a90d9', promoted ?? false, url ?? ''],
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[apps] POST / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PATCH /api/apps/:id — update an app (admin only) */
router.patch('/:id', async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { name, description, category, color, promoted, url } = req.body as {
      name?: string;
      description?: string;
      category?: string;
      color?: string;
      promoted?: boolean;
      url?: string;
    };

    await pool.query(
      `UPDATE apps SET
         name        = COALESCE($2, name),
         description = COALESCE($3, description),
         category    = COALESCE($4, category),
         color       = COALESCE($5, color),
         promoted    = COALESCE($6, promoted),
         url         = COALESCE($7, url)
       WHERE id = $1`,
      [id, name ?? null, description ?? null, category ?? null, color ?? null, promoted ?? null, url ?? null],
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[apps] PATCH /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** DELETE /api/apps/:id — delete an app (admin only) */
router.delete('/:id', async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    await pool.query('DELETE FROM apps WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[apps] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
