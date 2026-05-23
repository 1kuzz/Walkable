import { Router } from 'express';
import { pool } from '../db/client';
import type { AuthenticatedUser } from '../types';
import type { Request } from 'express';

const router = Router();

function getUser(req: Request): AuthenticatedUser {
  return (req as unknown as { authUser: AuthenticatedUser }).authUser;
}

/** GET /api/update-tags — all tags */
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, label, color, created_by AS "createdBy"
       FROM update_tags ORDER BY label ASC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[update-tags] GET / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/update-tags — create (admin only) */
router.post('/', async (req, res) => {
  try {
    const user = getUser(req);
    const { id, label, color } = req.body as { id: string; label: string; color: string };

    if (!id || !label || !color) {
      res.status(400).json({ error: 'id, label, color are required.' });
      return;
    }

    await pool.query(
      `INSERT INTO update_tags (id, label, color, created_by) VALUES ($1, $2, $3, $4)`,
      [id, label.trim(), color, user.login],
    );

    res.status(201).json({ id });
  } catch (err) {
    console.error('[update-tags] POST / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PUT /api/update-tags/:id — edit label/color (admin only) */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { label, color } = req.body as { label: string; color: string };

    if (!label || !color) {
      res.status(400).json({ error: 'label and color are required.' });
      return;
    }

    const result = await pool.query(
      `UPDATE update_tags SET label=$1, color=$2 WHERE id=$3`,
      [label.trim(), color, id],
    );

    if (result.rowCount === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('[update-tags] PUT /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** DELETE /api/update-tags/:id — delete (admin only) */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`DELETE FROM update_tags WHERE id=$1`, [id]);
    if (result.rowCount === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('[update-tags] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
