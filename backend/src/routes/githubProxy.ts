import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

/**
 * GET /api/github/repos?page=1
 * Lists the authenticated user's GitHub repositories via their session OAuth token.
 */
router.get('/repos', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.session?.githubToken;
    if (!token) {
      res.status(401).json({ error: 'No GitHub token in session. Please sign in again.' });
      return;
    }

    const page = String(req.query['page'] ?? '1');
    const url = `https://api.github.com/user/repos?sort=updated&per_page=50&page=${page}&affiliation=owner,collaborator`;

    const ghRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Walkable-Portal/1.0',
      },
    });

    if (!ghRes.ok) {
      res.status(ghRes.status).json({ error: 'GitHub API error.' });
      return;
    }

    const repos = await ghRes.json();
    res.json(repos);
  } catch (err) {
    console.error('[github-proxy] GET /repos error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
