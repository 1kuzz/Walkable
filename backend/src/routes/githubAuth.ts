import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db/client';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();

const FRONTEND_URL = () => process.env.FRONTEND_URL ?? 'http://localhost:5173';
const BACKEND_URL  = () => process.env.BACKEND_URL  ?? 'http://localhost:3001';

/** GET /api/auth/github — redirect to GitHub OAuth consent screen */
router.get('/github', (req: Request, res: Response) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID.' });
    return;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'repo read:user',
    redirect_uri: `${BACKEND_URL()}/api/auth/github/callback`,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

/** GET /api/auth/github/callback — exchange code for token, save in session */
router.get('/github/callback', async (req: Request, res: Response) => {
  const { code } = req.query as { code?: string };

  if (!code) {
    res.redirect(`${FRONTEND_URL()}/?auth=error`);
    return;
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${BACKEND_URL()}/api/auth/github/callback`,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) {
      res.redirect(`${FRONTEND_URL()}/?auth=error`);
      return;
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    const user = await userRes.json() as { login: string; avatar_url: string; name: string | null };

    // Auto-promote users listed in ADMIN_LOGINS env var (bootstrap mechanism)
    const adminLogins = (process.env.ADMIN_LOGINS ?? '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const shouldBeAdmin = adminLogins.includes(user.login.toLowerCase());

    // Upsert user record; promote if in ADMIN_LOGINS
    await pool.query(
      `INSERT INTO github_users (login, display_name, avatar_url, last_seen${shouldBeAdmin ? ', is_admin' : ''})
       VALUES ($1, $2, $3, NOW()${shouldBeAdmin ? ', TRUE' : ''})
       ON CONFLICT (login) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             avatar_url   = EXCLUDED.avatar_url,
             last_seen    = NOW()${shouldBeAdmin ? ',\n             is_admin = TRUE' : ''}`,
      [user.login, user.name ?? user.login, user.avatar_url],
    );

    // Read the resolved is_admin value from DB (may have been set by another admin)
    const adminResult = await pool.query<{ is_admin: boolean }>(
      `SELECT is_admin FROM github_users WHERE login = $1`,
      [user.login],
    );
    const isAdmin = adminResult.rows[0]?.is_admin ?? false;

    req.session.githubToken = tokenData.access_token;
    req.session.githubUser  = { login: user.login, avatar_url: user.avatar_url, name: user.name, isAdmin };

    res.redirect(`${FRONTEND_URL()}/?auth=success`);
  } catch {
    res.redirect(`${FRONTEND_URL()}/?auth=error`);
  }
});

/** GET /api/auth/me — return signed-in user (including isAdmin) or null */
router.get('/me', (req: Request, res: Response) => {
  res.json(req.session.githubUser ?? null);
});

/** POST /api/auth/logout */
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/** GET /api/auth/users — list all users who have logged in (requires auth) */
router.get('/users', async (req: Request, res: Response) => {
  if (!req.session.githubUser) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  try {
    const result = await pool.query(
      `SELECT login, display_name AS "displayName", avatar_url AS "avatarUrl",
              is_admin AS "isAdmin", first_seen AS "firstSeen", last_seen AS "lastSeen"
       FROM github_users
       ORDER BY is_admin DESC, last_seen DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[auth] GET /users error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PATCH /api/auth/users/:login/admin — toggle admin status (admin only) */
router.patch('/users/:login/admin', requireAdmin, async (req: Request, res: Response) => {
  const { login } = req.params as { login: string };

  if (login === req.session.githubUser!.login) {
    res.status(400).json({ error: 'Cannot change your own admin status.' });
    return;
  }

  try {
    const result = await pool.query<{ is_admin: boolean }>(
      `UPDATE github_users SET is_admin = NOT is_admin
       WHERE login = $1 RETURNING is_admin`,
      [login],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ login, isAdmin: result.rows[0].is_admin });
  } catch (err) {
    console.error('[auth] PATCH /users/:login/admin error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
