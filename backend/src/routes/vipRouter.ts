/**
 * /vip/:token[/*]
 *
 * Clean public URL for VIP apps — served directly at /vip/<share_token>
 * without redirecting to /api/share/.
 *
 * - GET /:token   → serve app HTML (basePath = /vip/:token)
 * - GET /:token/* → serve static assets + SPA fallback
 */
import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import type { Request, Response } from 'express';
import { pool } from '../db/client';
import {
  UPLOADS_DIR_RESOLVED,
  resolveProjectDir,
  serveAppHtml,
  sendHtmlError,
  rewriteAssetBundle,
  resolveAssetPath,
  loadBackendSecret,
  signBackendJwt,
} from '../services/vipServing';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Slugs: lowercase alphanumeric + hyphens, 1-80 chars, not UUID format
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

// ── App dir cache (5 min TTL) ─────────────────────────────────────────────────

interface AppEntry {
  shareToken: string;
  projectDir: string;
  appName: string;
  showBar: boolean;
  expires: number;
  contentId: string;
  uploadedBy: string;
}
const appCache = new Map<string, AppEntry>(); // keyed by share_token UUID or "slug:<slug>"

async function lookupAppEntry(
  column: 'share_token' | 'slug',
  value: string,
  cacheKey: string,
): Promise<AppEntry | null> {
  const cached = appCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached;

  const sql = `SELECT uc.id, uc.name, uc.project_path, uc.share_token::text AS share_token,
          uc.uploaded_by, COALESCE(gu.tier, 'free') AS tier
   FROM uploaded_content uc
   LEFT JOIN github_users gu ON gu.login = uc.uploaded_by
   WHERE uc.${column} = $1
     AND (uc.expires_at IS NULL OR uc.expires_at > NOW())`;

  const result = await pool.query<{
    id: string;
    name: string;
    project_path: string | null;
    share_token: string;
    tier: string;
    uploaded_by: string;
  }>(sql, [value]);

  if (result.rows.length === 0 || !result.rows[0].project_path) return null;

  const row = result.rows[0];
  const entry: AppEntry = {
    shareToken: row.share_token,
    projectDir: resolveProjectDir(row.project_path as string),
    appName: row.name,
    showBar: row.tier !== 'pro',
    expires: Date.now() + 5 * 60 * 1000,
    contentId: row.id,
    uploadedBy: row.uploaded_by,
  };
  appCache.set(cacheKey, entry);
  return entry;
}

async function getAppEntry(token: string): Promise<AppEntry | null> {
  if (UUID_RE.test(token)) {
    return lookupAppEntry('share_token', token, token);
  }
  if (SLUG_RE.test(token)) {
    return lookupAppEntry('slug', token, `slug:${token}`);
  }
  return null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

router.get('/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const isUuid = UUID_RE.test(token);
  const isSlug = !isUuid && SLUG_RE.test(token);

  if (!isUuid && !isSlug) {
    sendHtmlError(res, 404, 'Invalid Link', 'This VIP link is not valid.');
    return;
  }

  const whereClause = isUuid ? 'uc.share_token = $1' : 'uc.slug = $1';
  const lookupVal   = token;

  try {
    const result = await pool.query<{
      id: string;
      name: string;
      html_content: string;
      project_path: string | null;
      portal_route: string | null;
      uploaded_by: string;
      tier: string;
      share_token: string;
    }>(
      `SELECT uc.id, uc.name, uc.html_content, uc.project_path,
              uc.portal_route, uc.uploaded_by, uc.share_token::text AS share_token,
              COALESCE(gu.tier, 'free') AS tier
       FROM uploaded_content uc
       LEFT JOIN github_users gu ON gu.login = uc.uploaded_by
       WHERE ${whereClause}
         AND (uc.expires_at IS NULL OR uc.expires_at > NOW())`,
      [lookupVal],
    );

    if (result.rows.length === 0) {
      if (isUuid) {
        const expired = await pool.query<{ id: string }>(
          `SELECT id FROM uploaded_content WHERE share_token = $1 AND expires_at <= NOW()`,
          [token],
        );
        if (expired.rows.length > 0) {
          sendHtmlError(res, 410, 'App Expired',
            'This 24-hour link has expired. Ask the owner for a new share link.');
          return;
        }
      }
      sendHtmlError(res, 404, 'Link Not Found', 'This VIP link does not exist or may have been removed.');
      return;
    }

    const row = result.rows[0];

    if (row.portal_route) {
      res.redirect(302, row.portal_route);
      return;
    }

    const shareUrl = `${req.protocol}://${req.hostname}/vip/${token}`;
    const basePath = `/vip/${token}`;
    const showBar = row.tier !== 'pro';

    if (row.project_path) {
      const projectDir = resolveProjectDir(row.project_path);

      appCache.set(token, {
        shareToken: row.share_token,
        projectDir,
        appName: row.name,
        showBar,
        expires: Date.now() + 5 * 60 * 1000,
        contentId: row.id,
        uploadedBy: row.uploaded_by,
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

      const backendSecret = loadBackendSecret(row.id);
      const backendAuthToken = backendSecret
        ? signBackendJwt(backendSecret, row.uploaded_by, true)
        : undefined;

      serveAppHtml(res, rawHtml, { appName: row.name, shareUrl, basePath, showBar, backendAuthToken });
      return;
    }

    const rawHtml = row.html_content ?? '';
    if (!rawHtml) {
      sendHtmlError(res, 404, 'Project Is Empty', 'This project has no content.');
      return;
    }

    serveAppHtml(res, rawHtml, { appName: row.name, shareUrl, basePath: '', showBar });
  } catch (err) {
    console.error('[vip] GET /:token error:', err);
    sendHtmlError(res, 500, 'Server Error', 'Something went wrong. Please try again later.');
  }
});

// ── Static assets + SPA fallback ─────────────────────────────────────────────

router.get('/:token/*', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const validToken = UUID_RE.test(token) || SLUG_RE.test(token);
  if (!validToken) { res.status(404).end(); return; }

  const assetPath = (req.params as Record<string, string>)['0'];
  if (!assetPath) { res.status(404).end(); return; }

  try {
    const entry = await getAppEntry(token);
    if (!entry) { res.status(404).end(); return; }

    const filePath = resolveAssetPath(entry.projectDir, assetPath);

    if (filePath) {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.js' || ext === '.mjs' || ext === '.css') {
        const raw = fs.readFileSync(filePath, 'utf8');
        const rewritten = rewriteAssetBundle(raw, `/vip/${token}`, ext as '.js' | '.css');
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

    // Extension-less path → SPA fallback
    const hasExt = /\.[^/]+$/.test(assetPath);
    if (hasExt) { res.status(404).end(); return; }

    const indexPath = path.join(entry.projectDir, 'index.html');
    if (!fs.existsSync(indexPath)) { res.status(404).end(); return; }

    let rawHtml: string;
    try { rawHtml = fs.readFileSync(indexPath, 'utf8'); }
    catch { res.status(500).end(); return; }

    const shareUrl = `${req.protocol}://${req.hostname}/vip/${entry.shareToken}`;
    const spaBackendSecret = loadBackendSecret(entry.contentId);
    const spaAuthToken = spaBackendSecret
      ? signBackendJwt(spaBackendSecret, entry.uploadedBy, true)
      : undefined;
    serveAppHtml(res, rawHtml, {
      appName: entry.appName,
      shareUrl,
      basePath: `/vip/${token}`,
      showBar: entry.showBar,
      backendAuthToken: spaAuthToken,
    });
  } catch (err) {
    console.error('[vip] GET /:token/* error:', err);
    res.status(500).end();
  }
});

export default router;
