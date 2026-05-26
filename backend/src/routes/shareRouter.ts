import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import type { Request, Response } from 'express';
import { pool } from '../db/client';

const router = Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 */
router.get('/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  if (!UUID_RE.test(token)) {
    sendHtmlError(res, 404, 'Invalid Link', 'This VIP link is not valid.');
    return;
  }

  try {
    const result = await pool.query<{
      name: string;
      html_content: string | null;
      project_path: string | null;
      portal_route: string | null;
      uploaded_by: string;
    }>(
      `SELECT name, html_content, project_path, portal_route, uploaded_by
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

    if (row.project_path) {
      const pathParts = row.project_path.split('/').slice(2);
      const absolutePath = path.join(UPLOADS_DIR, ...pathParts);
      if (!fs.existsSync(absolutePath)) {
        sendHtmlError(res, 404, 'Project Files Missing',
          'The project files were not found on disk. Try re-uploading the project.');
        return;
      }
      res.redirect(302, row.project_path);
      return;
    }

    const rawHtml = row.html_content ?? '';
    if (!rawHtml) {
      sendHtmlError(res, 404, 'Project Is Empty', 'This project has no content.');
      return;
    }

    let html = rawHtml.replace(/^[﻿\s]+/, '');
    if (!html.toLowerCase().startsWith('<!doctype')) {
      html = '<!DOCTYPE html>\n' + html;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(200).send(html);
  } catch (err) {
    console.error('[share] GET /:token error:', err);
    sendHtmlError(res, 500, 'Server Error', 'Something went wrong. Please try again later.');
  }
});

export default router;
