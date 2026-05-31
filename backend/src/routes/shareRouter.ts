import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import type { Request, Response } from 'express';
import { pool } from '../db/client';

const router = Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function serveAppHtml(res: Response, rawHtml: string, appName: string, shareUrl: string, basePath: string | null): void {
  let html = rawHtml.replace(/^[﻿\s]+/, '');
  if (!html.toLowerCase().startsWith('<!doctype')) html = '<!DOCTYPE html>\n' + html;

  // Inject <base> tag for relative asset resolution (only if none present)
  if (basePath && !/<base[\s>]/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n<base href="${basePath}">`);
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

/**
 * GET /api/share/:token/meta
 * Returns minimal metadata (name) for the VIP page title — no auth required.
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
 * Serve project content by share token — no authentication required.
 * The token itself acts as the credential (unguessable UUID).
 * Serves the app HTML directly (no iframe) with an injected top bar and base tag.
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

    if (row.project_path) {
      const pathParts = row.project_path.split('/').slice(2); // strip '' and 'uploads'
      const absolutePath = path.join(UPLOADS_DIR, ...pathParts);
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

      // Build a <base> href so relative asset paths (./assets/...) resolve correctly
      // even though the HTML is now served from /api/share/:token
      const contentId = pathParts[0];
      const relDir = pathParts.slice(1, -1).join('/');
      const basePath = relDir
        ? `/uploads/${contentId}/${relDir}/`
        : `/uploads/${contentId}/`;

      serveAppHtml(res, rawHtml, row.name, shareUrl, basePath);
      return;
    }

    const rawHtml = row.html_content ?? '';
    if (!rawHtml) {
      sendHtmlError(res, 404, 'Project Is Empty', 'This project has no content.');
      return;
    }

    serveAppHtml(res, rawHtml, row.name, shareUrl, null);
  } catch (err) {
    console.error('[share] GET /:token error:', err);
    sendHtmlError(res, 500, 'Server Error', 'Something went wrong. Please try again later.');
  }
});

export default router;
