import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db/client';
import { requireAuth } from '../middleware/requireAuth';
import { getStorageInfo, canUploadNow } from '../services/storageGuard';
import type { AuthRequest } from '../types';

const router = Router();

function getUser(req: Request) { return (req as unknown as AuthRequest).authUser; }

function makeId() { return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

/**
 * GET /api/queue — list caller's queue items and current storage info.
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  try {
    const [queueResult, storageInfo, posResult] = await Promise.all([
      pool.query(
        `SELECT id, name, description, git_url, build, queued_at, status, result_id, error
         FROM upload_queue WHERE user_login = $1 AND status NOT IN ('cancelled')
         ORDER BY queued_at DESC LIMIT 20`,
        [user.login],
      ),
      Promise.resolve(getStorageInfo()),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM upload_queue WHERE status = 'waiting'`,
      ),
    ]);

    const totalWaiting = parseInt(posResult.rows[0].count, 10);

    // Add queue position to each waiting item
    const items = await Promise.all(queueResult.rows.map(async (item) => {
      if (item.status !== 'waiting') return item;
      const posRow = await pool.query<{ pos: string }>(
        `SELECT COUNT(*) AS pos FROM upload_queue
         WHERE status = 'waiting' AND queued_at <= $1`,
        [item.queued_at],
      );
      return { ...item, position: parseInt(posRow.rows[0].pos, 10) };
    }));

    res.json({ items, storageInfo, totalWaiting });
  } catch (err) {
    console.error('[queue] GET / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/queue — enqueue a GitHub URL import for later processing.
 * Only available when storage is low and user is free-tier.
 * Pro users and admins should deploy immediately via /api/content/github.
 */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const { gitUrl, name, description, build } = req.body as {
    gitUrl?: string; name?: string; description?: string; build?: boolean;
  };

  if (!gitUrl?.trim() || !name?.trim()) {
    res.status(400).json({ error: 'gitUrl and name are required.' });
    return;
  }

  const urlMatch = gitUrl.trim().match(
    /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(\.git)?\/?$/,
  );
  if (!urlMatch) {
    res.status(400).json({ error: 'Invalid GitHub URL.' });
    return;
  }

  // Don't let pro/admin users queue — they should deploy immediately
  if (canUploadNow(user.tier, user.isAdmin)) {
    res.status(400).json({
      error: 'Storage is available — deploy directly via GitHub import instead of queuing.',
    });
    return;
  }

  const { status: storageStatus } = getStorageInfo();
  if (storageStatus === 'critical') {
    res.status(507).json({ error: 'Storage is critically full. Cannot accept new queue items.' });
    return;
  }

  try {
    // Limit queue per user (max 3 waiting)
    const existing = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM upload_queue WHERE user_login = $1 AND status = 'waiting'`,
      [user.login],
    );
    if (parseInt(existing.rows[0].count, 10) >= 3) {
      res.status(429).json({ error: 'You already have 3 items in the queue. Wait for them to process or cancel one.' });
      return;
    }

    const id = makeId();
    await pool.query(
      `INSERT INTO upload_queue (id, user_login, name, description, git_url, build)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, user.login, name.trim(), (description ?? '').trim(), gitUrl.trim(), !!build],
    );

    // Get position
    const posRow = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM upload_queue WHERE status = 'waiting'`,
    );
    const position = parseInt(posRow.rows[0].count, 10);

    res.status(201).json({
      id,
      position,
      message: `You're #${position} in queue. Your deployment will run automatically when storage frees up. Upgrade to Pro for instant deployment.`,
    });
  } catch (err) {
    console.error('[queue] POST / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * DELETE /api/queue/:id — cancel a queued item.
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const { id } = req.params as { id: string };
  try {
    const result = await pool.query(
      `UPDATE upload_queue SET status = 'cancelled'
       WHERE id = $1 AND user_login = $2 AND status = 'waiting'
       RETURNING id`,
      [id, user.login],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Queue item not found or already processing.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[queue] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/queue/storage — public storage status endpoint.
 */
router.get('/storage', (_req: Request, res: Response): void => {
  res.json(getStorageInfo());
});

export default router;
