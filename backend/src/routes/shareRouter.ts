/**
 * /api/share/:token[/*]
 *
 * - GET  /:token/meta   → minimal metadata (public)
 * - POST /:token/session → create a 24h viewer session, return { sessionId }
 * - GET  /:token        → serve app HTML directly (legacy / direct-link fallback)
 * - GET  /:token/*      → serve static assets + SPA fallback
 */
import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import type { Request, Response } from 'express';
import { pool } from '../db/client';
import {
  UPLOADS_DIR,
  UPLOADS_DIR_RESOLVED,
  resolveProjectDir,
  serveAppHtml,
  sendHtmlError,
} from '../services/vipServing';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── App dir cache (5 min TTL) ─────────────────────────────────────────────────

interface AppEntry {
  projectDir: string;
  appName: string;
  showBar: boolean;
  expires: number;
}
const appCache = new Map<string, AppEntry>();

async function getAppEntry(token: string): Promise<AppEntry | null> {
  const cached = appCache.get(token);
  if (cached && cached.expires > Date.now()) return cached;

  const result = await pool.query<{
    name: string;
    project_path: string | null;
    tier: string;
  }>(
    `SELECT uc.name, uc.project_path, COALESCE(gu.tier, 'free') AS tier
     FROM uploaded_content uc
     LEFT JOIN github_users gu ON gu.login = uc.uploaded_by
     WHERE uc.share_token = $1`,
    [token],
  );

  if (result.rows.length === 0 || !result.rows[0].project_path) return null;

  const row = result.rows[0];
  const entry: AppEntry = {
    projectDir: resolveProjectDir(row.project_path as string),
    appName: row.name,
    showBar: row.tier !== 'pro',
    expires: Date.now() + 5 * 60 * 1000,
  };
  appCache.set(token, entry);
  return entry;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/share/:token/meta
 * Minimal metadata for the VipPage loading screen — no auth required.
 */
router.get('/:token/meta', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  if (!UUID_RE.test(token)) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  try {
    const result = await pool.query<{ name: string; uploaded_by: string }>(
      `SELECT name, uploaded_by FROM uploaded_content WHERE share_token = $1`,
      [token],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    res.json({ name: result.rows[0].name, uploadedBy: result.rows[0].uploaded_by });
  } catch (err) {
    console.error('[share] GET /:token/meta error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/share/:token/session
 * Create a 24-hour viewer session for this VIP app.
 * Returns { sessionId } which the frontend uses to redirect to /api/vs/:sessionId.
 */
router.post('/:token/session', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  if (!UUID_RE.test(token)) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  try {
    // Validate the token exists
    const check = await pool.query<{ id: string }>(
      `SELECT id FROM uploaded_content WHERE share_token = $1`,
      [token],
    );
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }

    const contentId = check.rows[0].id;
    const viewerIp = req.ip ?? req.socket.remoteAddress ?? null;

    const session = await pool.query<{ id: string }>(
      `INSERT INTO vip_viewer_sessions (content_id, viewer_ip)
       VALUES ($1, $2)
       RETURNING id::text`,
      [contentId, viewerIp],
    );

    res.json({ sessionId: session.rows[0].id });
  } catch (err) {
    console.error('[share] POST /:token/session error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/share/:token
 * Serve the app HTML directly (legacy / direct-link fallback).
 * Includes history patching + SPA routing fix.
 */
router.get('/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  if (!UUID_RE.test(token)) {
    sendHtmlError(res, 404, 'Invalid Link', 'This VIP link is not valid.');
    return;
  }

  try {
    const result = await pool.query<{
      id: string;
      name: string;
      html_content: string;
      project_path: string | null;
      portal_route: string | null;
      uploaded_by: string;
      tier: string;
    }>(
      `SELECT uc.id, uc.name, uc.html_content, uc.project_path,
              uc.portal_route, uc.uploaded_by, COALESCE(gu.tier, 'free') AS tier
       FROM uploaded_content uc
       LEFT JOIN github_users gu ON gu.login = uc.uploaded_by
       WHERE uc.share_token = $1`,
      [token],
    );

    if (result.rows.length === 0) {
      sendHtmlError(res, 404, 'Link Not Found', 'This VIP link does not exist or may have been removed.');
      return;
    }

    const row = result.rows[0];

    if (row.portal_route) {
      res.redirect(302, row.portal_route);
      return;
    }

    const shareUrl = `${req.protocol}://${req.hostname}/vip/${token}`;
    const basePath = `/api/share/${token}`;
    const showBar = row.tier !== 'pro';

    if (row.project_path) {
      const projectDir = resolveProjectDir(row.project_path);

      // Warm cache for the wildcard asset route
      appCache.set(token, {
        projectDir,
        appName: row.name,
        showBar,
        expires: Date.now() + 5 * 60 * 1000,
      });

      const indexPath = path.join(projectDir, 'index.html');
      if (!fs.existsSync(indexPath)) {
        sendHtmlError(res, 404, 'Project Files Missing',
          'The project files were not found on disk. Try re-uploading the project.');
        return;
      }

      let rawHtml: string;
      try { rawHtml = fs.readFileSync(indexPath, 'utf8'); }
      catch { sendHtmlError(res, 500, 'Server Error', 'Could not read project files.'); return; }

      serveAppHtml(res, rawHtml, { appName: row.name, shareUrl, basePath, showBar });
      return;
    }

    const rawHtml = row.html_content ?? '';
    if (!rawHtml) {
      sendHtmlError(res, 404, 'Project Is Empty', 'This project has no content.');
      return;
    }

    // html_content apps have no file assets — no basePath rewriting
    serveAppHtml(res, rawHtml, { appName: row.name, shareUrl, basePath: '', showBar });
  } catch (err) {
    console.error('[share] GET /:token error:', err);
    sendHtmlError(res, 500, 'Server Error', 'Something went wrong. Please try again later.');
  }
});

/**
 * GET /api/share/:token/*
 * Serve static assets (JS, CSS, images) from the app's project directory.
 * Falls back to index.html for extension-less paths (SPA client-side routing).
 */
router.get('/:token/*', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  if (!UUID_RE.test(token)) { res.status(404).end(); return; }

  const assetPath = (req.params as Record<string, string>)['0'];
  if (!assetPath) { res.status(404).end(); return; }

  try {
    const entry = await getAppEntry(token);
    if (!entry) { res.status(404).end(); return; }

    const filePath = path.resolve(entry.projectDir, assetPath);

    // Security: must stay within uploads
    if (!filePath.startsWith(UPLOADS_DIR_RESOLVED + '/') &&
        filePath !== UPLOADS_DIR_RESOLVED) {
      res.status(403).end();
      return;
    }

    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
      res.sendFile(filePath);
      return;
    }

    // SPA fallback: extension-less path → serve index.html for client-side routing
    const hasExt = /\.[^/]+$/.test(assetPath);
    if (hasExt) { res.status(404).end(); return; }

    const indexPath = path.join(entry.projectDir, 'index.html');
    if (!fs.existsSync(indexPath)) { res.status(404).end(); return; }

    let rawHtml: string;
    try { rawHtml = fs.readFileSync(indexPath, 'utf8'); }
    catch { res.status(500).end(); return; }

    const shareUrl = `${req.protocol}://${req.hostname}/vip/${token}`;
    serveAppHtml(res, rawHtml, {
      appName: entry.appName,
      shareUrl,
      basePath: `/api/share/${token}`,
      showBar: entry.showBar,
    });
  } catch (err) {
    console.error('[share] GET /:token/* error:', err);
    res.status(500).end();
  }
});

export default router;
