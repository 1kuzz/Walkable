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

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Session info cache (5 min TTL) ────────────────────────────────────────────

interface SessionInfo {
  projectDir: string;
  appName: string;
  showBar: boolean;
  shareToken: string;   // original content share_token for the VIP copy-link URL
  expires: number;      // cache TTL (not session expiry)
}
const sessionCache = new Map<string, SessionInfo>();

async function getSessionInfo(sessionId: string, origin: string): Promise<SessionInfo | null | 'expired'> {
  const cached = sessionCache.get(sessionId);
  if (cached && cached.expires > Date.now()) return cached;

  const result = await pool.query<{
    content_id: string;
    expires_at: string;
    name: string;
    project_path: string | null;
    portal_route: string | null;
    share_token: string;
    tier: string;
  }>(
    `SELECT
       s.content_id, s.expires_at,
       uc.name, uc.project_path, uc.portal_route,
       uc.share_token::text AS share_token,
       COALESCE(gu.tier, 'free') AS tier
     FROM vip_viewer_sessions s
     JOIN uploaded_content uc ON uc.id = s.content_id
     LEFT JOIN github_users gu ON gu.login = uc.uploaded_by
     WHERE s.id = $1`,
    [sessionId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  if (new Date(row.expires_at) < new Date()) return 'expired';
  if (!row.project_path) return null;

  const projectDir = resolveProjectDir(row.project_path);
  const showBar = row.tier !== 'pro';

  const info: SessionInfo = {
    projectDir,
    appName: row.name,
    showBar,
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
  const info = await getSessionInfo(sessionId, origin).catch((err) => {
    console.error('[vs] session lookup error:', err);
    return null as null;
  });

  if (info === null) {
    sendHtmlError(res, 404, 'Link Not Found', 'This link does not exist or has been removed.');
    return;
  }
  if (info === 'expired') {
    sendHtmlError(
      res, 410, 'Session Expired',
      'This 24-hour preview link has expired. Ask for a fresh link.',
    );
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

  serveAppHtml(res, rawHtml, {
    appName: info.appName,
    shareUrl: `${origin}/vip/${info.shareToken}`,
    basePath: `/api/vs/${sessionId}`,
    showBar: info.showBar,
  });
});

// ── Static assets + SPA fallback ─────────────────────────────────────────────

router.get('/:sessionId/*', async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params as { sessionId: string };
  if (!UUID_RE.test(sessionId)) { res.status(404).end(); return; }

  const assetPath = (req.params as Record<string, string>)['0'];
  if (!assetPath) { res.status(404).end(); return; }

  const origin = `${req.protocol}://${req.hostname}`;
  const info = await getSessionInfo(sessionId, origin).catch(() => null);

  if (!info || info === 'expired') { res.status(404).end(); return; }

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
      // Rewrite absolute /assets/ (and /static/, /_next/) paths so images and
      // fonts referenced inside the bundle resolve to the session URL, not root.
      const raw = fs.readFileSync(filePath, 'utf8');
      const rewritten = rewriteAssetBundle(raw, `/api/vs/${sessionId}`, ext as '.js' | '.css');
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
    basePath: `/api/vs/${sessionId}`,
    showBar: info.showBar,
  });
});

export default router;
