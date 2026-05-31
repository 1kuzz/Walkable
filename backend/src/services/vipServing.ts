/**
 * Shared utilities for serving VIP apps (used by shareRouter and vipSessionRouter).
 */
import * as path from 'path';
import * as fs from 'fs';
import type { Response } from 'express';

export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');
export const UPLOADS_DIR_RESOLVED = path.resolve(UPLOADS_DIR);

// ── Project directory resolution ─────────────────────────────────────────────

/**
 * Given the stored project_path (e.g. /uploads/upload_xxx/dist/index.html),
 * return the directory that should be the app root for asset serving.
 * Auto-detects built output when the stored path is a Vite source file.
 */
export function resolveProjectDir(storedPath: string): string {
  const pathParts = storedPath.split('/').slice(2); // strip '' and 'uploads'
  let htmlPath = path.join(UPLOADS_DIR, ...pathParts);

  if (fs.existsSync(htmlPath)) {
    try {
      const html = fs.readFileSync(htmlPath, 'utf8');
      if (/src=["']\/src\//i.test(html)) {
        const dir = path.dirname(htmlPath);
        for (const sub of ['dist', 'build', 'out', 'public']) {
          const candidate = path.join(dir, sub, 'index.html');
          if (fs.existsSync(candidate)) {
            try {
              const ch = fs.readFileSync(candidate, 'utf8');
              if (/src=["']\/assets\//i.test(ch) || /rel=["']modulepreload/i.test(ch)) {
                return path.dirname(candidate);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  }

  return path.dirname(htmlPath);
}

// ── HTML transformation ───────────────────────────────────────────────────────

const VIP_BAR_STYLE = `
<style id="__vpbar_s">
#__vpbar{position:fixed;top:0;left:0;right:0;height:42px;background:#111827;display:flex;align-items:center;padding:0 16px;gap:12px;font:13px/1 system-ui,sans-serif;z-index:2147483647;box-shadow:0 1px 0 rgba(255,255,255,.07)}
#__vpbar a{color:#9ca3af;text-decoration:none;font-weight:700;letter-spacing:-.3px;flex-shrink:0}
#__vpbar a:hover{color:#fff}
#__vpbar_n{flex:1;color:#d1d5db;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
#__vpbar_c{border:1px solid #374151;background:none;color:#9ca3af;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;flex-shrink:0}
#__vpbar_c:hover{background:#1f2937;color:#fff}
</style>`;

export function injectVipBar(html: string, appName: string, shareUrl: string): string {
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
 * Inject a script at the very beginning of <head> that patches the History API
 * so the app behaves as if it's served at root ('/') even though it's at basePath.
 *
 * Fixes React Router and other SPA frameworks that use window.location.pathname
 * and history.pushState with absolute paths.
 */
export function injectHistoryPatch(html: string, basePath: string): string {
  const safeBase = JSON.stringify(basePath); // e.g. "/api/vs/abc123"
  const script = `<script id="__vp_router_fix">
(function(){
var B=${safeBase};
var oP=history.pushState.bind(history);
var oR=history.replaceState.bind(history);
// Strip the session base prefix from a pathname so the SPA sees clean paths.
function strip(p){
  if(!p)return'/';
  if(p===B||p===B+'/')return'/';
  return p.startsWith(B+'/')?p.slice(B.length):p;
}
// 1. Immediately change the URL to the stripped path before React boots.
//    React Router then reads window.location.pathname = '/' (the real value, no override needed).
oR(history.state,'',strip(window.location.pathname));
// 2. Patch pushState/replaceState so all in-app navigation also uses stripped paths.
//    React Router calls pushState('/book') → we pass '/book' through as-is.
//    The URL bar shows '/book', '/contacts', etc. — clean and readable.
function wrap(orig){
  return function(s,t,url){
    orig.call(history,s,t,
      typeof url==='string'&&url.startsWith('/')&&!url.startsWith('//')
        ?strip(url):url);
  };
}
history.pushState=wrap(oP);
history.replaceState=wrap(oR);
})();
</script>`;
  // Must be the FIRST script — runs before any framework code
  return html.replace(/<head([^>]*)>/i, `<head$1>\n${script}`);
}

/**
 * Rewrite absolute asset paths and navigation hrefs in HTML so they route
 * through our serving endpoint (basePath + originalPath).
 *
 * - src="/..." → src="{basePath}/..."          (scripts, images — always assets)
 * - href="/..." → href="{basePath}/..."        (assets + navigation links)
 *   EXCEPT: href="//...", href="/api/...", href="/uploads/..."
 * - CSS url('/...') → url({basePath}/...)
 */
export function rewriteAbsolutePaths(html: string, basePath: string): string {
  const base = basePath.replace(/\/$/, ''); // strip trailing slash

  // src="/..." — always static assets
  let result = html
    .replace(/\b(src)="(\/(?!\/)[^"]*)"/g, `$1="${base}$2"`)
    .replace(/\b(src)='(\/(?!\/)[^']*)'/g, `$1='${base}$2'`);

  // href="/..." — rewrite all absolute same-origin paths (assets + navigation)
  // but skip protocol-relative, our API, and uploads paths
  result = result
    .replace(/\b(href)="(\/(?!\/|api\/|uploads\/)[^"]*)"/g, `$1="${base}$2"`)
    .replace(/\b(href)='(\/(?!\/|api\/|uploads\/)[^']*)'/g, `$1='${base}$2'`);

  // CSS url('/...') in inline styles / <style> blocks
  result = result.replace(
    /\burl\(['"]?(\/(?!\/)[^'")]*)\)/g,
    `url(${base}$1)`,
  );

  return result;
}

// ── Full HTML render ──────────────────────────────────────────────────────────

export interface ServeOptions {
  appName: string;
  shareUrl: string;   // canonical VIP link for the copy button
  basePath: string;   // URL prefix where this app is being served, e.g. /api/vs/UUID
  showBar: boolean;   // false for pro-tier apps
}

export function serveAppHtml(
  res: Response,
  rawHtml: string,
  opts: ServeOptions,
): void {
  let html = rawHtml.replace(/^[﻿\s]+/, '');
  if (!html.toLowerCase().startsWith('<!doctype')) html = '<!DOCTYPE html>\n' + html;

  const baseHref = opts.basePath.endsWith('/') ? opts.basePath : opts.basePath + '/';

  // 1. Rewrite absolute asset + navigation paths
  html = rewriteAbsolutePaths(html, opts.basePath);

  // 2. Inject history API patch for SPA routing (before any app script)
  html = injectHistoryPatch(html, opts.basePath);

  // 3. <base> tag for relative paths (only if absent)
  if (!/<base[\s>]/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n<base href="${baseHref}">`);
  }

  // 4. Optional VIP bar
  if (opts.showBar) {
    html = injectVipBar(html, opts.appName, opts.shareUrl);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.status(200).send(html);
}

// ── Asset bundle rewriting ────────────────────────────────────────────────────

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite absolute static-asset paths inside a JS or CSS bundle so they route
 * through the session's serving endpoint instead of the portal root.
 *
 * Vite bundles embed image/font paths as absolute strings: "/assets/logo.png".
 * The browser resolves these against the origin root (portal), not the session
 * path, so they 404. Rewriting them to "/api/vs/UUID/assets/logo.png" fixes it.
 *
 * Handles Vite (/assets/), CRA (/static/), and Next.js (/_next/) output dirs.
 */
export function rewriteAssetBundle(
  content: string,
  basePath: string,
  ext: '.js' | '.mjs' | '.css',
): string {
  const base = basePath.replace(/\/$/, '');
  const prefixes = ['/assets/', '/static/', '/_next/'];

  let result = content;
  for (const prefix of prefixes) {
    const escaped = escRe(prefix);
    if (ext === '.css') {
      // url(/assets/...) | url('/assets/...') | url("/assets/...")
      result = result.replace(
        new RegExp(`url\\((['"]?)(${escaped})`, 'g'),
        (_, q) => `url(${q}${base}${prefix}`,
      );
    } else {
      // "/assets/..." and '/assets/...' string literals in JS
      result = result.replace(
        new RegExp(`(['"])(${escaped})`, 'g'),
        (_, q) => `${q}${base}${prefix}`,
      );
    }
  }
  return result;
}

export function sendHtmlError(res: Response, code: number, title: string, detail: string): void {
  const icon = code === 404 ? '📭' : '⚠️';
  res.status(code)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .setHeader('X-Frame-Options', 'SAMEORIGIN')
    .setHeader('Cache-Control', 'no-store')
    .send(`<!DOCTYPE html>
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
