import { Router } from 'express';
import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { pool } from '../db/client';
import { requireAuth } from '../middleware/requireAuth';
import type { AuthRequest } from '../types';

const router = Router();

function getUser(req: Request) {
  return (req as unknown as AuthRequest).authUser;
}

function maskToken(id: string): string {
  return `${id.slice(0, 10)}...`;
}

/** GET /api/tokens — list caller's tokens (no plaintext returned) */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  try {
    const result = await pool.query(
      `SELECT id, name, created_at, last_used_at, expires_at
       FROM api_tokens WHERE user_login = $1 ORDER BY created_at DESC`,
      [user.login],
    );
    res.json(result.rows.map(r => ({ ...r, masked: maskToken(r.id) })));
  } catch (err) {
    console.error('[tokens] GET / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/tokens — create a new token; returns plaintext ONCE */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Token name is required.' });
    return;
  }
  try {
    const count = await pool.query(
      `SELECT COUNT(*) FROM api_tokens WHERE user_login = $1`,
      [user.login],
    );
    if (parseInt((count.rows[0] as { count: string }).count, 10) >= 10) {
      res.status(429).json({ error: 'Maximum 10 tokens per user.' });
      return;
    }

    const rawToken = `tok_${randomBytes(20).toString('hex')}`;
    const hash = createHash('sha256').update(rawToken).digest('hex');
    const id = `tkid_${randomBytes(8).toString('hex')}`;

    await pool.query(
      `INSERT INTO api_tokens (id, user_login, name, token_hash) VALUES ($1, $2, $3, $4)`,
      [id, user.login, name.trim(), hash],
    );

    res.json({ id, name: name.trim(), token: rawToken, note: 'Copy this token now — it will not be shown again.' });
  } catch (err) {
    console.error('[tokens] POST / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** DELETE /api/tokens/:id — revoke a token */
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const { id } = req.params as { id: string };
  try {
    const result = await pool.query(
      `DELETE FROM api_tokens WHERE id = $1 AND user_login = $2 RETURNING id`,
      [id, user.login],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Token not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[tokens] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
