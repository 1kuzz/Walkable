import { Router } from 'express';
import { pool } from '../db/client';
import type { AuthenticatedUser } from '../types';
import type { Request } from 'express';

const router = Router();

function getUser(req: Request): AuthenticatedUser {
  return (req as unknown as { authUser: AuthenticatedUser }).authUser;
}

/** GET /api/quick-buttons — return all slot rows for the authenticated user */
router.get('/', async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    const result = await pool.query<{
      slot_index: number;
      app_id: string | null;
      app_name: string | null;
      app_project_path: string | null;
    }>(
      `SELECT slot_index, app_id, app_name, app_project_path
       FROM user_quick_buttons
       WHERE user_login = $1
       ORDER BY slot_index ASC`,
      [user.login],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[quick-buttons] GET / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PUT /api/quick-buttons/:index — upsert a slot (0-based index) */
router.put('/:index', async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    const slotIndex = parseInt(req.params.index as string, 10);
    if (isNaN(slotIndex) || slotIndex < 0) {
      res.status(400).json({ error: 'Invalid slot index.' });
      return;
    }

    const { appId, appName, appProjectPath } = req.body as {
      appId?: string | null;
      appName?: string | null;
      appProjectPath?: string | null;
    };

    await pool.query(
      `INSERT INTO user_quick_buttons (user_login, slot_index, app_id, app_name, app_project_path, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_login, slot_index) DO UPDATE
         SET app_id           = EXCLUDED.app_id,
             app_name         = EXCLUDED.app_name,
             app_project_path = EXCLUDED.app_project_path,
             updated_at       = NOW()`,
      [user.login, slotIndex, appId ?? null, appName ?? null, appProjectPath ?? null],
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[quick-buttons] PUT /:index error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** DELETE /api/quick-buttons/:index — clear a slot */
router.delete('/:index', async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    const slotIndex = parseInt(req.params.index as string, 10);
    if (isNaN(slotIndex) || slotIndex < 0) {
      res.status(400).json({ error: 'Invalid slot index.' });
      return;
    }

    await pool.query(
      `UPDATE user_quick_buttons
       SET app_id = NULL, app_name = NULL, app_project_path = NULL, updated_at = NOW()
       WHERE user_login = $1 AND slot_index = $2`,
      [user.login, slotIndex],
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[quick-buttons] DELETE /:index error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
