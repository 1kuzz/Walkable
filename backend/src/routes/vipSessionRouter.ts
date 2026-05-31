/**
 * /api/vs/:sessionId[/*]
 *
 * Serves a VIP app for a specific 24-hour viewer session.
 * Each visitor to /vip/:token gets their own session URL here.
 *
 * - GET /:sessionId        → serve app HTML (with history patch + optional VIP bar)
 * - GET /:sessionId/*      → serve static assets or SPA fallback
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
  rewriteAssetBundle,
} from '../services/vipServing';
import { contentEvents } from '../services/contentEvents';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Session info cache (5 min TTL) ────────────────────────────────────────────

interface SessionInfo {
  contentId: string;    // for cache invalidation when archive is replaced
  projectDir: string;
  appName: string;
  showBar: boolean;
  shareToken: string;
  expires: number;      // cache TTL (not session expiry)
}
const sessionCache = new Map<string, SessionInfo>();

// Evict all cached sessions belonging to a content item (e.g. after archive replace)
contentEvents.on('archive:replaced', (contentId: string) => {
  for (const [key, info] of sessionCache) {
    if (info.contentId === contentId) sessionCache.delete(key);
  }
});
contentEvents.on('content:deleted', (contentId: string) => {
  for (const [key, info] of sessionCache) {
    if (info.contentId === contentId) sessionCache.delete(key);
  }
});

async function getSessionInfo(sessionId: string): Promise<SessionInfo | null | 'expired' | 'deleted'> {
  const cached = sessionCache.get(sessionId);
  if (cached && cached.expires > Date.now()) return cached;

  // Check if session exists at all (without the JOIN, to distinguish deleted content)
  const sessionRow = await pool.query<{ content_id: string; expires_at: string }>(
    `SELECT content_id, expires_at FROM vip_viewer_sessions WHERE id = $1`,
    [sessionId],
  );

  if (sessionRow.rows.length === 0) return null;

  const { content_id, expires_at } = sessionRow.rows[0];
  if (new Date(expires_at) < new Date()) return 'expired';

  const result = await pool.query<{
    name: string;
    project_path: string | null;
    portal_route: string | null;
    share_token: string;
    tier: string;
  }>(
    `SELECT uc.name, uc.project_path, uc.portal_route,
            uc.share_token::text AS share_token,
            COALESCE(gu.tier, 'free') AS tier
     FROM uploaded_content uc
     LEFT JOIN github_users gu ON gu.login = uc.uploaded_by
     WHERE uc.id = $1`,
    [content_id],
  );

  if (result.rows.length === 0) return 'deleted';

  const row = result.rows[0];
  if (!row.project_path) return null;

  const info: SessionInfo = {
    contentId: content_id,
    projectDir: resolveProjectDir(row.project_path),
    appName: row.name,
    showBar: row.tier !== 'pro',
    shareToken: row.share_token,
    expires: Date.now() + 5 * 60 * 1000,
  };
  sessionCache.set(sessionId, info);
  return info;
}

// ── Main page ─────────────────────────────────────────────────────────────────

router.get('/:sessionId', async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params as { sessionId: string };
  if (!UUID_RE.test(sessionId)) {
    sendHtmlError(res, 404, 'Invalid Link', 'This link is not valid.');
    return;
  }

  const origin = `${req.protocol}://${req.hostname}`;
  const info = await getSessionInfo(sessionId).catch((err) => {
    console.error('[vs] session lookup error:', err);
    return null as null;
  });

  if (info === null) {
    sendHtmlError(res, 404, 'Link Not Found', 'This link does not exist or has been removed.');
    return;
  }
  if (info === 'expired') {
    sendHtmlError(res, 410, 'Session Expired',
      'This 24-hour preview link has expired. Ask for a fresh link.');
    return;
  }
  if (info === 'deleted') {
    sendHtmlError(res, 410, 'App Removed',
      'The owner has deleted this app. The link is no longer available.');
    return;
  }

  const indexPath = path.join(info.projectDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    sendHtmlError(res, 404, 'Project Files Missing', 'The project files were not found.');
    return;
  }

  let rawHtml: string;
  try { rawHtml = fs.readFileSync(indexPath, 'utf8'); }
  catch { sendHtmlError(res, 500, 'Server Error', 'Could not read project files.'); return; }

  // req.baseUrl is the mount prefix ('/app' or '/api/vs') — derive basePath from it
  // so this router works correctly at any mount point.
  const basePath = `${req.baseUrl}/${sessionId}`;

  serveAppHtml(res, rawHtml, {
    appName: info.appName,
    shareUrl: `${origin}/vip/${info.shareToken}`,
    basePath,
    showBar: info.showBar,
  });
});

// ── Static assets + SPA fallback ─────────────────────────────────────────────

router.get('/:sessionId/*', async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params as { sessionId: string };
  if (!UUID_RE.test(sessionId)) { res.status(404).end(); return; }

  const assetPath = (req.params as Record<string, string>)['0'];
  if (!assetPath) { res.status(404).end(); return; }

  const info = await getSessionInfo(sessionId).catch(() => null);

  if (!info || info === 'expired' || info === 'deleted') { res.status(404).end(); return; }

  const origin = `${req.protocol}://${req.hostname}`;
  const basePath = `${req.baseUrl}/${sessionId}`;

  const filePath = path.resolve(info.projectDir, assetPath);

  // Security: must stay within uploads
  if (!filePath.startsWith(UPLOADS_DIR_RESOLVED + '/') &&
      filePath !== UPLOADS_DIR_RESOLVED) {
    res.status(403).end();
    return;
  }

  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.js' || ext === '.mjs' || ext === '.css') {
      const raw = fs.readFileSync(filePath, 'utf8');
      const rewritten = rewriteAssetBundle(raw, basePath, ext as '.js' | '.css');
      const mime = ext === '.css' ? 'text/css' : 'application/javascript';
      res
        .setHeader('Content-Type', `${mime}; charset=UTF-8`)
        .setHeader('Cache-Control', 'public, max-age=86400')
        .send(rewritten);
      return;
    }

    res.sendFile(filePath);
    return;
  }

  // SPA fallback: no file extension → treat as client-side navigation path
  const hasExt = /\.[^/]+$/.test(assetPath);
  if (hasExt) { res.status(404).end(); return; }

  const indexPath = path.join(info.projectDir, 'index.html');
  if (!fs.existsSync(indexPath)) { res.status(404).end(); return; }

  let rawHtml: string;
  try { rawHtml = fs.readFileSync(indexPath, 'utf8'); }
  catch { res.status(500).end(); return; }

  serveAppHtml(res, rawHtml, {
    appName: info.appName,
    shareUrl: `${origin}/vip/${info.shareToken}`,
    basePath,
    showBar: info.showBar,
  });
});

export default router;
