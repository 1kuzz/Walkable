import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import type { Request, Response } from 'express';
import { pool } from '../db/client';

const router = Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');
const UPLOADS_DIR_RESOLVED = path.resolve(UPLOADS_DIR);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── App directory cache (5 min TTL) ──────────────────────────────────────────

interface AppDirEntry { projectDir: string; expires: number }
const appDirCache = new Map<string, AppDirEntry>();

/**
 * Resolve project_path → actual directory of the best index.html to serve.
 * If the stored path is a Vite source file (loads /src/main.tsx), auto-detect
 * the built dist/index.html in the same directory.
 */
function resolveProjectDir(storedPath: string): string {
  const pathParts = storedPath.split('/').slice(2); // strip '' and 'uploads'
  let htmlPath = path.join(UPLOADS_DIR, ...pathParts);

  if (fs.existsSync(htmlPath)) {
    try {
      const html = fs.readFileSync(htmlPath, 'utf8');
      // Source HTML: Vite dev entry loads from /src/
      if (/src=["']\/src\//i.test(html)) {
        const dir = path.dirname(htmlPath);
        for (const sub of ['dist', 'build', 'out', 'public']) {
          const candidate = path.join(dir, sub, 'index.html');
          if (fs.existsSync(candidate)) {
            try {
              const ch = fs.readFileSync(candidate, 'utf8');
              // Confirm it's a built file (has hashed assets or modulepreload)
              if (/src=["']\/assets\//i.test(ch) || /rel=["']modulepreload/i.test(ch)) {
                htmlPath = candidate;
                break;
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  }

  return path.dirname(htmlPath);
}

async function getAppDir(token: string): Promise<string | null> {
  const cached = appDirCache.get(token);
  if (cached && cached.expires > Date.now()) return cached.projectDir;

  const result = await pool.query<{ project_path: string | null }>(
    `SELECT project_path FROM uploaded_content WHERE share_token = $1`, [token],
  );
  if (result.rows.length === 0 || !result.rows[0].project_path) return null;

  const projectDir = resolveProjectDir(result.rows[0].project_path);
  appDirCache.set(token, { projectDir, expires: Date.now() + 5 * 60 * 1000 });
  return projectDir;
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

const VIP_BAR_STYLE = `
<style id="__vpbar_s">
#__vpbar{position:fixed;top:0;left:0;right:0;height:42px;background:#111827;display:flex;align-items:center;padding:0 16px;gap:12px;font:13px/1 system-ui,sans-serif;z-index:2147483647;box-shadow:0 1px 0 rgba(255,255,255,.07)}
#__vpbar a{color:#9ca3af;text-decoration:none;font-weight:700;letter-spacing:-.3px;flex-shrink:0}
#__vpbar a:hover{color:#fff}
#__vpbar_n{flex:1;color:#d1d5db;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
#__vpbar_c{border:1px solid #374151;background:none;color:#9ca3af;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;flex-shrink:0}
#__vpbar_c:hover{background:#1f2937;color:#fff}
</style>`;

function injectVipBar(html: string, appName: string, shareUrl: string): string {
  const safeName = appName
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const safeUrl = shareUrl.replace(/'/g, "\\'");

  const bar = `${VIP_BAR_STYLE}
<div id="__vpbar">
  <a href="/">VibePort</a>
  <span id="__vpbar_n">${safeName}</span>
  <button id="__vpbar_c">🔗 Copy link</button>
</div>
<script>
(function(){
  document.getElementById('__vpbar_c').addEventListener('click',function(){
    var u='${safeUrl}';
    navigator.clipboard.writeText(u).then(function(){
      var b=document.getElementById('__vpbar_c');
      b.textContent='✓ Copied!';
      setTimeout(function(){b.textContent='🔗 Copy link';},2000);
    }).catch(function(){window.prompt('Copy this link:',u);});
  });
  var s=document.documentElement.style;
  s.setProperty('padding-top','42px','important');
})();
</script>`;

  const closeBody = html.toLowerCase().lastIndexOf('</body>');
  if (closeBody !== -1) return html.slice(0, closeBody) + bar + html.slice(closeBody);
  return html + bar;
}

/**
 * Rewrite absolute asset paths in HTML so they route through /api/share/:token/*.
 * This fixes Vite's default output which uses absolute /assets/... paths that
 * can't be resolved via <base> tag when served from a non-root URL.
 * Only rewrites src="/" (always assets) and href="/" for known asset extensions.
 * Navigation links (href="/about") are left untouched.
 */
function rewriteAbsolutePaths(html: string, tokenBase: string): string {
  const base = tokenBase.replace(/\/$/, ''); // e.g. '/api/share/UUID'

  // src="/..." — always static assets (scripts, images, audio, video)
  let result = html.replace(/\b(src)="(\/(?!\/)[^"]*)"/g, `$1="${base}$2"`);
  result = result.replace(/\b(src)='(\/(?!\/)[^']*)'/g, `$1='${base}$2'`);

  // href="/..." — only rewrite asset file extensions, leave navigation links alone
  const ASSET_EXT = /\.(js|css|ico|png|svg|jpg|jpeg|gif|webp|avif|woff2?|ttf|eot|otf|json|map)(\?[^"']*)?$/i;
  result = result.replace(/\b(href)="(\/(?!\/)[^"]*)"/g, (m, attr, p) =>
    ASSET_EXT.test(p) ? `${attr}="${base}${p}"` : m);
  result = result.replace(/\b(href)='(\/(?!\/)[^']*)'/g, (m, attr, p) =>
    ASSET_EXT.test(p) ? `${attr}='${base}${p}'` : m);

  // CSS url('/...') in inline styles / <style> blocks
  result = result.replace(/\burl\(['"]?(\/(?!\/)[^'")]*)\)/g, `url(${base}$1)`);

  return result;
}

function serveAppHtml(res: Response, rawHtml: string, appName: string, shareUrl: string, basePath: string | null): void {
  let html = rawHtml.replace(/^[﻿\s]+/, '');
  if (!html.toLowerCase().startsWith('<!doctype')) html = '<!DOCTYPE html>\n' + html;

  if (basePath) {
    // Fix absolute asset paths first (Vite default: /assets/...)
    html = rewriteAbsolutePaths(html, basePath);
    // <base> handles remaining relative paths (./assets/...) — only inject if absent
    if (!/<base[\s>]/i.test(html)) {
      const baseHref = basePath.endsWith('/') ? basePath : basePath + '/';
      html = html.replace(/<head([^>]*)>/i, `<head$1>\n<base href="${baseHref}">`);
    }
  }

  html = injectVipBar(html, appName, shareUrl);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.status(200).send(html);
}

function sendHtmlError(res: Response, code: number, title: string, detail: string): void {
  const icon = code === 404 ? '📭' : '⚠️';
  res.status(code);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
       min-height:100vh;margin:0;background:#0a0a0a;color:#d1d5db}
  .box{text-align:center;padding:40px 24px;max-width:400px}
  .icon{font-size:48px;margin-bottom:16px}
  h1{font-size:18px;font-weight:700;margin:0 0 8px;color:#f9fafb}
  p{font-size:14px;margin:0;color:#9ca3af}
</style></head>
<body><div class="box">
<div class="icon">${icon}</div>
<h1>${title}</h1><p>${detail}</p>
</div></body></html>`);
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/share/:token/meta
 * Minimal metadata for VIP page title — no auth required.
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
    const row = result.rows[0];
    res.json({ name: row.name, uploadedBy: row.uploaded_by });
  } catch (err) {
    console.error('[share] GET /:token/meta error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/share/:token
 * Serve project HTML directly with injected VIP bar and fixed asset paths.
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
      html_content: string | null;
      project_path: string | null;
      portal_route: string | null;
      uploaded_by: string;
    }>(
      `SELECT id, name, html_content, project_path, portal_route, uploaded_by
       FROM uploaded_content WHERE share_token = $1`,
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
    const tokenBase = `/api/share/${token}`;

    if (row.project_path) {
      const pathParts = row.project_path.split('/').slice(2); // strip '' and 'uploads'
      let absolutePath = path.join(UPLOADS_DIR, ...pathParts);

      if (!fs.existsSync(absolutePath)) {
        sendHtmlError(res, 404, 'Project Files Missing',
          'The project files were not found on disk. Try re-uploading the project.');
        return;
      }

      let rawHtml: string;
      try {
        rawHtml = fs.readFileSync(absolutePath, 'utf8');
      } catch {
        sendHtmlError(res, 500, 'Server Error', 'Could not read project files.');
        return;
      }

      // Auto-detect built output when stored path is a Vite source file
      if (/src=["']\/src\//i.test(rawHtml)) {
        const dir = path.dirname(absolutePath);
        for (const sub of ['dist', 'build', 'out', 'public']) {
          const candidate = path.join(dir, sub, 'index.html');
          if (fs.existsSync(candidate)) {
            try {
              const ch = fs.readFileSync(candidate, 'utf8');
              if (/src=["']\/assets\//i.test(ch) || /rel=["']modulepreload/i.test(ch)) {
                absolutePath = candidate;
                rawHtml = ch;
                break;
              }
            } catch { /* skip */ }
          }
        }
      }

      // Warm the cache with the resolved directory so asset requests are fast
      const projectDir = path.dirname(absolutePath);
      appDirCache.set(token, { projectDir, expires: Date.now() + 5 * 60 * 1000 });

      serveAppHtml(res, rawHtml, row.name, shareUrl, tokenBase);
      return;
    }

    const rawHtml = row.html_content ?? '';
    if (!rawHtml) {
      sendHtmlError(res, 404, 'Project Is Empty', 'This project has no content.');
      return;
    }

    // html_content apps have no associated file assets — no path rewriting needed
    serveAppHtml(res, rawHtml, row.name, shareUrl, null);
  } catch (err) {
    console.error('[share] GET /:token error:', err);
    sendHtmlError(res, 500, 'Server Error', 'Something went wrong. Please try again later.');
  }
});

/**
 * GET /api/share/:token/*
 * Serve static assets (JS, CSS, images, fonts) for a VIP app.
 * After rewriteAbsolutePaths(), the app's HTML references /api/share/:token/assets/...
 * instead of /assets/..., so all assets are routed here with correct MIME types.
 */
router.get('/:token/*', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  if (!UUID_RE.test(token)) {
    res.status(404).end();
    return;
  }

  const assetPath = (req.params as Record<string, string>)['0'];
  if (!assetPath) {
    res.status(404).end();
    return;
  }

  try {
    const projectDir = await getAppDir(token);
    if (!projectDir) {
      res.status(404).end();
      return;
    }

    const filePath = path.resolve(projectDir, assetPath);

    // Security: must stay within uploads directory
    if (!filePath.startsWith(UPLOADS_DIR_RESOLVED + '/') &&
        filePath !== UPLOADS_DIR_RESOLVED) {
      res.status(403).end();
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.status(404).end();
      return;
    }

    // sendFile sets Content-Type automatically from extension (mime-types)
    res.sendFile(filePath);
  } catch (err) {
    console.error('[share] GET /:token/* error:', err);
    res.status(500).end();
  }
});

export default router;
