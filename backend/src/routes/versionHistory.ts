import { Router } from 'express';
import { pool } from '../db/client';
import type { AuthenticatedUser } from '../types';
import type { Request } from 'express';

const router = Router();

function getUser(req: Request): AuthenticatedUser {
  return (req as unknown as { authUser: AuthenticatedUser }).authUser;
}

/** GET /api/versions/last-known — last known portal version for current admin */
router.get('/last-known', async (req, res) => {
  try {
    const user = getUser(req);
    const key = `last_known_portal_version_${user.login}`;
    const result = await pool.query<{ value: string }>(
      `SELECT value FROM setup_config WHERE key = $1`,
      [key],
    );
    res.json({ version: result.rows[0]?.value ?? null });
  } catch (err) {
    console.error('[versions] GET /last-known error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/versions/mark-seen — mark current portal version as seen */
router.post('/mark-seen', async (req, res) => {
  try {
    const user = getUser(req);
    const { version } = req.body as { version: string };
    if (!version) { res.status(400).json({ error: 'version is required.' }); return; }

    const key = `last_known_portal_version_${user.login}`;
    await pool.query(
      `INSERT INTO setup_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, version],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[versions] POST /mark-seen error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
