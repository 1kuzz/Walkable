import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/client';
import type { AuthRequest } from '../types';

const FREE_DAILY_LIMIT = 1;

/** Enforce 1 deployment/day for free-tier users. Pro and admin are exempt. */
export async function checkUploadLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = (req as unknown as AuthRequest).authUser;
  if (user.login === 'anonymous') {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (user.isAdmin || user.tier === 'pro') {
    return next();
  }
  try {
    const result = await pool.query<{ count: number }>(
      `SELECT COALESCE(count, 0) AS count FROM daily_upload_counts WHERE uploaded_by = $1`,
      [user.login],
    );
    const count = result.rows[0]?.count ?? 0;
    if (count >= FREE_DAILY_LIMIT) {
      res.status(429).json({
        error: `Free tier: ${FREE_DAILY_LIMIT} deployment per day. Upgrade to Pro for unlimited deployments.`,
        upgradeUrl: '/settings#pro',
        tier: 'free',
      });
      return;
    }
  } catch {
    // If the view check fails, allow the upload (don't block on instrumentation errors)
  }
  next();
}
