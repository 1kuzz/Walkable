import { Router } from 'express';
import { pool } from '../db/client';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

/** GET /api/promoted-apps — list of promoted app IDs */
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query<{ app_id: number }>(
      'SELECT app_id FROM promoted_apps',
    );
    const ids = result.rows.map((r) => r.app_id);
    res.json(ids);
  } catch (err) {
    console.error('[promoted-apps] GET / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/promoted-apps/:id/toggle — toggle promotion (admin only) */
router.post('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const appId = parseInt(String(req.params.id), 10);
    if (isNaN(appId)) {
      res.status(400).json({ error: 'Invalid app ID.' });
      return;
    }

    const existing = await pool.query<{ app_id: number }>(
      'SELECT app_id FROM promoted_apps WHERE app_id = $1',
      [appId],
    );

    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM promoted_apps WHERE app_id = $1', [appId]);
      res.json({ promoted: false });
    } else {
      await pool.query(
        'INSERT INTO promoted_apps (app_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [appId],
      );
      res.json({ promoted: true });
    }
  } catch (err) {
    console.error('[promoted-apps] POST /:id/toggle error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
