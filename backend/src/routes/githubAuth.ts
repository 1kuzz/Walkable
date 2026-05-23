import { Router } from 'express';
import type { Request, Response } from 'express';

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

    req.session.githubToken = tokenData.access_token;
    req.session.githubUser  = { login: user.login, avatar_url: user.avatar_url, name: user.name };

    res.redirect(`${FRONTEND_URL()}/?auth=success`);
  } catch {
    res.redirect(`${FRONTEND_URL()}/?auth=error`);
  }
});

/** GET /api/auth/me — return signed-in user or null */
router.get('/me', (req: Request, res: Response) => {
  res.json(req.session.githubUser ?? null);
});

/** POST /api/auth/logout */
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => res.json({ ok: true }));
});

export default router;
