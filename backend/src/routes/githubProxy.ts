import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

/**
 * GET /api/github/repos?page=1&q=search
 * Lists the authenticated user's GitHub repositories via their session OAuth token.
 * Includes private repos if the OAuth scope includes 'repo'.
 */
router.get('/repos', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.session?.githubToken;
    if (!token) {
      res.status(401).json({ error: 'No GitHub token in session. Please sign in again.' });
      return;
    }

    const page = String(req.query['page'] ?? '1');
    const q = String(req.query['q'] ?? '').trim();

    // Use search API when query is provided, otherwise list user's repos
    let url: string;
    if (q) {
      // Search only the user's repos
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'VibePort/1.0',
        },
      });
      const userData = await userRes.json() as { login?: string };
      const login = userData.login ?? '';
      url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q + ' user:' + login)}&sort=updated&per_page=30&page=${page}`;
    } else {
      url = `https://api.github.com/user/repos?sort=updated&per_page=50&page=${page}&affiliation=owner,collaborator`;
    }

    const ghRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'VibePort/1.0',
      },
    });

    if (!ghRes.ok) {
      res.status(ghRes.status).json({ error: 'GitHub API error.' });
      return;
    }

    const data = await ghRes.json();
    // Search API wraps results in { items: [] }, list API is a plain array
    const repos = Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? [];
    res.json(repos);
  } catch (err) {
    console.error('[github-proxy] GET /repos error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
