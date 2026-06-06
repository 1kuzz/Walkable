/**
 * POST /api/deploy-hook/:secret
 *
 * GitHub webhook endpoint for push-triggered auto-deploy.
 * Each GitHub-imported app has a unique deploy_hook_secret.
 * Users copy the full URL into their GitHub repo's Webhooks settings
 * (Content type: application/json, no additional secret needed — the
 * 64-char hex secret in the URL provides sufficient entropy).
 *
 * Responds immediately with 200 then redeploys in background so
 * GitHub's 10s timeout is never exceeded.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db/client';
import { logger } from '../utils/logger';
import { redeployContentById } from './uploadedContent';

const router = Router();

const SECRET_RE = /^[a-f0-9]{64}$/;

router.post('/:secret', async (req: Request, res: Response): Promise<void> => {
  const { secret } = req.params as { secret: string };

  if (!SECRET_RE.test(secret)) {
    res.status(404).end();
    return;
  }

  // Only act on push events (ignore ping, create, etc.)
  const event = req.headers['x-github-event'];
  if (event && event !== 'push') {
    res.json({ ok: true, skipped: `event=${String(event)}` });
    return;
  }

  try {
    const result = await pool.query<{ id: string; git_url: string }>(
      `SELECT id, git_url FROM uploaded_content WHERE deploy_hook_secret = $1`,
      [secret],
    );

    if (!result.rows.length) {
      // Return 200 anyway to avoid leaking whether the secret is valid
      res.json({ ok: true });
      return;
    }

    const { id, git_url } = result.rows[0];
    logger.info(`[deploy-hook] triggered redeploy for ${id} (${git_url})`);

    // ACK immediately — GitHub expects a response within 10 seconds
    res.json({ ok: true, queued: true });

    // Redeploy in background (no user GitHub token — uses public or GITHUB_TOKEN env var)
    redeployContentById(id, process.env.GITHUB_TOKEN).catch((err: unknown) => {
      logger.error('[deploy-hook] redeploy failed', { id, error: String(err) });
    });
  } catch (err) {
    logger.error('[deploy-hook] error', { error: String(err) });
    res.json({ ok: true }); // still 200 — don't reveal internal errors to GitHub
  }
});

export default router;
