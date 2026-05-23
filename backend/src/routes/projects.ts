import { Router, type Request, type Response } from 'express';
import { pool } from '../db/client';
import { logger } from '../utils/logger';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseGitHubUrl(raw: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(raw.trim());
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

interface GitHubRepo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  owner: { login: string; avatar_url: string };
}

async function fetchGitHubRepo(owner: string, repo: string, userToken?: string): Promise<GitHubRepo> {
  const token = userToken ?? process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<GitHubRepo>;
}

function isAdmin(req: Request): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true; // dev mode: no password required
  const auth = req.headers.authorization ?? '';
  return auth === `Bearer ${adminPassword}`;
}

// ── Public endpoints ──────────────────────────────────────────────────────────

/** GET /api/projects — list approved projects ordered by views then stars */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, COALESCE(s.views, 0) AS views
      FROM projects p
      LEFT JOIN project_stats s ON p.id = s.project_id
      WHERE p.approved = TRUE
      ORDER BY s.views DESC NULLS LAST, p.stars DESC, p.submitted_at DESC
    `);
    res.json(rows);
  } catch (err) {
    logger.error('[projects] GET / error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/projects/:id — single approved project */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, COALESCE(s.views, 0) AS views
      FROM projects p
      LEFT JOIN project_stats s ON p.id = s.project_id
      WHERE p.id = $1 AND p.approved = TRUE
    `, [req.params.id]);
    if (rows.length === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json(rows[0]);
  } catch (err) {
    logger.error('[projects] GET /:id error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/projects — submit a project (public) */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { github_url } = req.body as { github_url?: string };
    if (!github_url || typeof github_url !== 'string') {
      res.status(400).json({ error: 'github_url is required.' });
      return;
    }

    const parsed = parseGitHubUrl(github_url);
    if (!parsed) {
      res.status(400).json({ error: 'Must be a valid github.com URL (e.g. https://github.com/owner/repo).' });
      return;
    }

    const dup = await pool.query('SELECT id FROM projects WHERE github_url = $1', [github_url.trim()]);
    if (dup.rows.length > 0) {
      res.status(409).json({ error: 'This repository has already been submitted.' });
      return;
    }

    let meta: GitHubRepo;
    try {
      meta = await fetchGitHubRepo(parsed.owner, parsed.repo, req.session?.githubToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[projects] GitHub fetch failed', { url: github_url, error: msg });
      res.status(422).json({ error: 'Could not fetch repository from GitHub. Check the URL and try again.' });
      return;
    }

    const { rows } = await pool.query(`
      INSERT INTO projects
        (github_url, name, description, language, stars, owner_login, owner_avatar_url, github_synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      github_url.trim(),
      meta.name,
      meta.description ?? '',
      meta.language ?? null,
      meta.stargazers_count ?? 0,
      meta.owner?.login ?? null,
      meta.owner?.avatar_url ?? null,
    ]);

    await pool.query('INSERT INTO project_stats (project_id) VALUES ($1)', [rows[0].id]);

    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error('[projects] POST / error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/projects/:id/view — increment view counter (no auth needed) */
router.post('/:id/view', async (req: Request, res: Response): Promise<void> => {
  try {
    await pool.query(`
      UPDATE project_stats SET views = views + 1, last_viewed_at = NOW()
      WHERE project_id = $1
    `, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error('[projects] POST /:id/view error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Admin endpoints (ADMIN_PASSWORD required) ─────────────────────────────────

/** GET /api/projects/pending — list unapproved submissions */
router.get('/pending', async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(401).json({ error: 'Unauthorized.' }); return; }
  try {
    const { rows } = await pool.query(`
      SELECT * FROM projects WHERE approved = FALSE ORDER BY submitted_at DESC
    `);
    res.json(rows);
  } catch (err) {
    logger.error('[projects] GET /pending error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PATCH /api/projects/:id — approve or reject a project */
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(401).json({ error: 'Unauthorized.' }); return; }
  try {
    const { approved } = req.body as { approved?: boolean };
    if (typeof approved !== 'boolean') {
      res.status(400).json({ error: 'approved (boolean) is required.' });
      return;
    }
    const { rows } = await pool.query(
      'UPDATE projects SET approved = $1 WHERE id = $2 RETURNING *',
      [approved, req.params.id],
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json(rows[0]);
  } catch (err) {
    logger.error('[projects] PATCH /:id error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/projects/:id/refresh — re-fetch GitHub metadata */
router.post('/:id/refresh', async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(401).json({ error: 'Unauthorized.' }); return; }
  try {
    const { rows: existing } = await pool.query(
      'SELECT github_url FROM projects WHERE id = $1', [req.params.id],
    );
    if (existing.length === 0) { res.status(404).json({ error: 'Not found.' }); return; }

    const parsed = parseGitHubUrl(existing[0].github_url);
    if (!parsed) { res.status(422).json({ error: 'Stored URL is invalid.' }); return; }

    const meta = await fetchGitHubRepo(parsed.owner, parsed.repo);
    const { rows } = await pool.query(`
      UPDATE projects SET
        name = $1, description = $2, language = $3, stars = $4,
        owner_login = $5, owner_avatar_url = $6, github_synced_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [
      meta.name, meta.description ?? '', meta.language ?? null,
      meta.stargazers_count ?? 0, meta.owner?.login ?? null,
      meta.owner?.avatar_url ?? null, req.params.id,
    ]);
    res.json(rows[0]);
  } catch (err) {
    logger.error('[projects] POST /:id/refresh error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/projects/stats/summary — public platform stats */
router.get('/stats/summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [total, topViewed, topStarred] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM projects WHERE approved = TRUE'),
      pool.query(`
        SELECT p.id, p.name, p.owner_login, COALESCE(s.views, 0) AS views
        FROM projects p
        LEFT JOIN project_stats s ON p.id = s.project_id
        WHERE p.approved = TRUE
        ORDER BY s.views DESC NULLS LAST LIMIT 10
      `),
      pool.query(`
        SELECT id, name, owner_login, stars
        FROM projects WHERE approved = TRUE
        ORDER BY stars DESC LIMIT 10
      `),
    ]);
    res.json({
      totalProjects: parseInt(total.rows[0].count, 10),
      topByViews: topViewed.rows,
      topByStars: topStarred.rows,
    });
  } catch (err) {
    logger.error('[projects] GET /stats/summary error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
