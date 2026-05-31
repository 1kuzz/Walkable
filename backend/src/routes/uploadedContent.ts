import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import {
  detectPortalManifest,
  allocatePort,
  handleUploadBackend,
  pm2Start,
  pm2Delete,
  regenerateNginxAppsConf,
} from '../services/appBackendManager';
import AdmZip from 'adm-zip';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import sharp from 'sharp';
import { pool } from '../db/client';
import type { AuthenticatedUser } from '../types';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { checkUploadLimit } from '../middleware/tierLimits';
import { storageCheck } from '../services/storageGuard';
import { logger } from '../utils/logger';

const router = Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

const renderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authUser = ((req as unknown as { authUser?: AuthenticatedUser }).authUser ?? { login: 'anonymous', displayName: 'Anonymous', isAdmin: false });
    return authUser?.login ?? ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? '');
  },
  message: { error: 'Too many content requests, please try again later.' },
});

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.mimetype === 'application/octet-stream' ||
      file.originalname.toLowerCase().endsWith('.zip')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip archives are accepted for project upload.'));
    }
  },
});

const ZIP_MAX_FILES = 5_000;
const ZIP_MAX_EXTRACTED_BYTES = 500 * 1024 * 1024;

function extractZipToDir(buffer: Buffer, targetDir: string): number {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  if (entries.length > ZIP_MAX_FILES) {
    throw new Error(`Archive contains too many entries (limit: ${ZIP_MAX_FILES}).`);
  }

  let totalBytes = 0;
  const resolvedTarget = path.resolve(targetDir);

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName;

    if (!entryName || entryName.includes('\0')) {
      throw new Error(`Archive contains an entry with an invalid name.`);
    }

    const resolvedEntry = path.resolve(targetDir, entryName);
    if (!resolvedEntry.startsWith(resolvedTarget + path.sep) && resolvedEntry !== resolvedTarget) {
      throw new Error(`Archive contains a path traversal entry: "${entryName}".`);
    }

    const segments = entryName.split('/');
    if (segments.includes('.git')) continue; // skip git objects silently

    totalBytes += entry.header.size;
    if (totalBytes > ZIP_MAX_EXTRACTED_BYTES) {
      throw new Error(`Archive would exceed maximum extracted size (${ZIP_MAX_EXTRACTED_BYTES / 1024 / 1024} MB).`);
    }
  }

  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName;
    if (entryName.split('/').includes('.git')) continue; // skip git objects

    const resolvedEntry = path.resolve(targetDir, entryName);

    const entryDir = path.dirname(resolvedEntry);
    fs.mkdirSync(entryDir, { recursive: true });
    fs.writeFileSync(resolvedEntry, entry.getData());
    count++;
  }

  return count;
}

function findPortalJsonFiles(rootDir: string): string[] {
  const results: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
      else if (e.isFile() && e.name === 'portal.json') results.push(path.join(dir, e.name));
    }
  }
  walk(rootDir, 0);
  return results;
}

function findIndexHtml(rootDir: string): string | null {
  const candidates: { depth: number; hasPortal: boolean; rel: string }[] = [];

  function walk(dir: string, depth: number): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (lower === 'index.html' || lower === 'index.htm') {
          const abs = path.join(dir, entry.name);
          const rel = path.relative(rootDir, abs).split(path.sep).join('/');
          const hasPortal = fs.existsSync(path.join(dir, 'portal.json'));
          candidates.push({ depth, hasPortal, rel });
        }
      }
    }
  }

  walk(rootDir, 0);

  if (candidates.length === 0) return null;
  // Prefer directories with portal.json, then shallowest depth, then alpha
  candidates.sort((a, b) =>
    Number(b.hasPortal) - Number(a.hasPortal) || a.depth - b.depth || a.rel.localeCompare(b.rel),
  );
  return candidates[0].rel;
}

/**
 * After extracting a repo zip, scan for nested .zip files that contain index.html.
 * Repos sometimes ship a pre-built bundle as a ZIP (e.g. email-center.zip alongside
 * email-center/ where the JS was gitignored). Extract those zips in-place so the
 * built assets are available for serving.
 */
function extractNestedBuildZips(rootDir: string): void {
  function walk(dir: string, depth: number): void {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) { walk(path.join(dir, entry.name), depth + 1); continue; }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.zip')) continue;
      const zipPath = path.join(dir, entry.name);
      try {
        const buf = fs.readFileSync(zipPath);
        const zip = new AdmZip(buf);
        const entries2 = zip.getEntries();
        const hasIndex = entries2.some(e => /^(.*\/)?index\.html?$/i.test(e.entryName));
        if (!hasIndex) continue;
        // Extract relative to the zip's parent dir so paths stay consistent with index.html's location
        logger.info(`[content] Extracting nested build zip: ${path.relative(rootDir, zipPath)}`);
        zip.extractAllTo(path.dirname(zipPath), true);
      } catch (err) {
        logger.warn(`[content] Failed to extract nested zip ${zipPath}`, { error: String(err) });
      }
    }
  }
  walk(rootDir, 0);
}

const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, GIF, SVG) are allowed for thumbnails.'));
    }
  },
});

function getUser(req: Request): AuthenticatedUser {
  return (req as unknown as { authUser: AuthenticatedUser }).authUser;
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.trim().match(/^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(\.git)?\/?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

// ── Build pipeline ────────────────────────────────────────────────────────────

const BUILD_TIMEOUT_MS = 5 * 60 * 1000;
const BUILD_LOG_MAX_BYTES = 200 * 1024;

interface BuildResult {
  projectPath: string;
  buildLog: string;
  fileCount: number;
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    const child = cp.spawn(cmd, args, {
      cwd,
      env: {
        PATH: process.env['PATH'] ?? '/usr/local/bin:/usr/bin:/bin',
        HOME: process.env['HOME'] ?? '/root',
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const onData = (chunk: Buffer) => {
      if (totalBytes < BUILD_LOG_MAX_BYTES) {
        const space = BUILD_LOG_MAX_BYTES - totalBytes;
        chunks.push(chunk.slice(0, space));
        totalBytes += Math.min(chunk.length, space);
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`"${cmd} ${args.join(' ')}" timed out after ${BUILD_TIMEOUT_MS / 1000}s`));
    }, BUILD_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      const log = Buffer.concat(chunks).toString('utf8');
      if (code === 0) {
        resolve(log);
      } else {
        reject(Object.assign(new Error(`Command exited with code ${String(code)}`), { log }));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runProjectBuild(sourceDir: string, contentId: string): Promise<BuildResult> {
  let buildLog = '';

  try {
    const installLog = await runCommand('npm', ['install', '--prefer-offline', '--no-audit'], sourceDir);
    buildLog += '=== npm install ===\n' + installLog + '\n';
  } catch (err: unknown) {
    const errLog = (err instanceof Error && 'log' in err) ? String((err as unknown as Record<string, unknown>)['log']) : '';
    buildLog += '=== npm install FAILED ===\n' + errLog + '\n' + (err instanceof Error ? err.message : String(err));
    throw Object.assign(new Error('npm install failed'), { buildLog });
  }

  try {
    const buildOutput = await runCommand('npm', ['run', 'build'], sourceDir);
    buildLog += '=== npm run build ===\n' + buildOutput + '\n';
  } catch (err: unknown) {
    const errLog = (err instanceof Error && 'log' in err) ? String((err as unknown as Record<string, unknown>)['log']) : '';
    buildLog += '=== npm run build FAILED ===\n' + errLog + '\n' + (err instanceof Error ? err.message : String(err));
    throw Object.assign(new Error('npm run build failed'), { buildLog });
  }

  const outputDirs = ['dist', 'build', 'out', 'public'];
  let outputDir: string | null = null;
  for (const d of outputDirs) {
    const candidate = path.join(sourceDir, d);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      outputDir = candidate;
      break;
    }
  }

  if (!outputDir) {
    buildLog += '\nCould not find output directory (checked: dist, build, out, public).';
    throw Object.assign(new Error('Build output directory not found'), { buildLog });
  }

  const indexRel = findIndexHtml(outputDir);
  if (!indexRel) {
    buildLog += `\nNo index.html found in ${path.basename(outputDir)}/`;
    throw Object.assign(new Error('No index.html in build output'), { buildLog });
  }

  ensureUploadsDir();
  const finalDir = path.join(UPLOADS_DIR, contentId);
  if (fs.existsSync(finalDir)) {
    fs.rmSync(finalDir, { recursive: true, force: true });
  }
  fs.cpSync(outputDir, finalDir, { recursive: true });
  fs.chmodSync(finalDir, 0o755);

  let fileCount = 0;
  function countFiles(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) countFiles(path.join(dir, entry.name));
      else fileCount++;
    }
  }
  countFiles(finalDir);

  const projectPath = `/uploads/${contentId}/${indexRel}`;
  buildLog += `\nBuild succeeded. Output: ${path.basename(outputDir)}/ (${fileCount} files)`;

  return { projectPath, buildLog, fileCount };
}

// ── Watermark / theme helpers ─────────────────────────────────────────────────

function injectWatermark(html: string, login: string, contentId: string): string {
  const timestamp = new Date().toISOString();
  const safeLogin = login
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
  const watermark = `<!-- mops:${safeLogin}:${contentId}:${timestamp} -->`
    + `<div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true">`
    + `${safeLogin}</div>`;
  const bodyIdx = html.toLowerCase().lastIndexOf('</body>');
  if (bodyIdx !== -1) {
    return html.slice(0, bodyIdx) + watermark + html.slice(bodyIdx);
  }
  return html + watermark;
}

function injectTheme(html: string, theme: 'dark' | 'light'): string {
  const compatMeta = `<meta http-equiv="X-UA-Compatible" content="IE=edge">`;
  const style =
    theme === 'dark'
      ? `<style>:root{color-scheme:dark}body{background:#1D1D1B!important;color:#fff!important}</style>`
      : `<style>:root{color-scheme:light}</style>`;
  const inject = compatMeta + style;
  const lower = html.toLowerCase();
  const headIdx = lower.indexOf('</head>');
  if (headIdx !== -1) {
    return html.slice(0, headIdx) + inject + html.slice(headIdx);
  }
  if (lower.startsWith('<!doctype')) {
    const doctypeEnd = html.indexOf('>');
    if (doctypeEnd !== -1) {
      return html.slice(0, doctypeEnd + 1) + inject + html.slice(doctypeEnd + 1);
    }
  }
  return inject + html;
}

async function auditContentAccess(login: string, contentId: string, ip: string | undefined): Promise<void> {
  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO audit_log (id, timestamp, event_type, "user", detail)
       VALUES ($1, NOW(), 'content_access', $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, login, `Accessed content: ${contentId} from IP ${ip ?? 'unknown'}`],
    );
  } catch {
    // Non-critical
  }
}

function serveInlineHtml(res: Response, rawHtml: string, user: AuthenticatedUser, id: string, theme: string): void {
  let html = rawHtml.replace(/^[\uFEFF\s]+/, '');
  if (!html.toLowerCase().startsWith('<!doctype')) {
    html = '<!DOCTYPE html>\n' + html;
  }
  const watermarked = injectWatermark(html, user.login, id);
  const themed = injectTheme(watermarked, theme === 'dark' ? 'dark' : 'light');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader(
    'Content-Security-Policy',
    "sandbox allow-scripts allow-forms allow-same-origin allow-modals allow-popups allow-downloads; default-src 'self' 'unsafe-inline' data:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; frame-ancestors 'self';",
  );
  res.status(200).send(themed);
}

function sendHtmlError(res: Response, code: number, title: string, detail: string): void {
  const icon = code === 404 ? '📭' : code === 403 ? '🔒' : '⚠️';
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

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/content
 * Admin: all items.
 * User: own items (any status) + publicly approved items.
 */
router.get('/', async (req, res) => {
  try {
    const user = getUser(req);
    let query: string;
    let params: unknown[];

    const cols = `id, name, description, uploaded_at AS "uploadedAt",
                  uploaded_by AS "uploadedBy", visibility, allowed_users AS "allowedUsers",
                  file_count AS "fileCount", project_path AS "projectPath",
                  (COALESCE(html_content,'') <> '') AS "hasContent",
                  thumbnail_path AS "thumbnailPath", portal_route AS "portalRoute",
                  status, review_note AS "reviewNote", submitted_at AS "submittedAt",
                  git_url AS "gitUrl", share_token AS "shareToken",
                  expires_at AS "expiresAt",
                  backend_port AS "backendPort", backend_prefix AS "backendPrefix"`;

    if (user.isAdmin) {
      query = `SELECT ${cols} FROM uploaded_content ORDER BY uploaded_at DESC`;
      params = [];
    } else {
      query = `SELECT ${cols} FROM uploaded_content
               WHERE (uploaded_by = $1)
                  OR (status = 'approved' AND visibility = 'all')
                  OR (status = 'approved' AND visibility = 'specific'
                      AND lower($1) = ANY(
                            SELECT lower(trim(val))
                            FROM unnest(string_to_array(allowed_users, ',')) AS val
                          ))
               ORDER BY uploaded_at DESC`;
      params = [user.login];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[content] GET / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/content/pending — admin: list items awaiting review.
 * Must be registered before /:id routes.
 */
router.get('/pending', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description,
              uploaded_by AS "uploadedBy", submitted_at AS "submittedAt",
              thumbnail_path AS "thumbnailPath", status,
              review_note AS "reviewNote", git_url AS "gitUrl"
       FROM uploaded_content
       WHERE status = 'pending_review'
       ORDER BY submitted_at ASC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[content] GET /pending error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/content — upload new content (any authenticated user).
 * Creates with status='draft'. Non-admins cannot set visibility/allowedUsers.
 * Supports optional server-side build (field build=true) for source ZIP uploads.
 */
router.post(
  '/',
  requireAuth,
  checkUploadLimit,
  storageCheck('reject'),
  (req, res, next) => {
    zipUpload.single('archive')(req, res, (zipErr) => {
      if (zipErr) {
        res.status(400).json({ error: zipErr.message ?? 'Invalid archive file.' });
        return;
      }
      if ((req as { file?: unknown }).file) {
        next();
        return;
      }
      upload.array('files')(req, res, next);
    });
  },
  async (req, res) => {
    const user = getUser(req);
    const rawBody = req.body as Record<string, unknown>;

    const name = Array.isArray(rawBody['name']) ? rawBody['name'][0] : (rawBody['name'] as string | undefined);
    const description = Array.isArray(rawBody['description']) ? rawBody['description'][0] : (rawBody['description'] as string | undefined);
    const providedId = Array.isArray(rawBody['id']) ? rawBody['id'][0] : (rawBody['id'] as string | undefined);
    const portalRoute = Array.isArray(rawBody['portalRoute']) ? rawBody['portalRoute'][0] : (rawBody['portalRoute'] as string | undefined);
    const buildFlag = Array.isArray(rawBody['build']) ? rawBody['build'][0] : (rawBody['build'] as string | undefined);
    const wantsBuild = buildFlag === 'true';

    // Admins can set visibility; regular users default to draft/specific
    const rawVis = Array.isArray(rawBody['visibility']) ? rawBody['visibility'][0] : (rawBody['visibility'] as string | undefined);
    const rawAllowed = Array.isArray(rawBody['allowedUsers']) ? rawBody['allowedUsers'][0] : (rawBody['allowedUsers'] as string | undefined);
    const vis: 'all' | 'specific' = user.isAdmin
      ? (rawVis === 'specific' ? 'specific' : 'all')
      : 'specific';
    const allowedUsers = user.isAdmin
      ? (rawAllowed?.trim() ?? '')
      : user.login;

    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required.' });
      return;
    }

    const contentId = providedId?.trim() || `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!/^[a-zA-Z0-9_-]+$/.test(contentId)) {
      res.status(400).json({ error: 'Invalid content ID: only alphanumeric characters, hyphens, and underscores are allowed.' });
      return;
    }
    const safeContentId = contentId.replace(/[^a-zA-Z0-9_-]/g, '');

    const status = 'approved';

    let htmlContent = '';
    let projectPath: string | null = null;
    let portalRouteValue: string | null = null;
    let fileCount = 0;
    let buildLog: string | null = null;
    let tempDir: string | null = null;

    try {
      const archiveFile = (req as { file?: Express.Multer.File }).file;

      if (archiveFile) {
        ensureUploadsDir();
        tempDir = fs.mkdtempSync(path.join(UPLOADS_DIR, 'tmp-zip-'));

        try {
          fileCount = extractZipToDir(archiveFile.buffer, tempDir);
        } catch (extractErr) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          tempDir = null;
          const msg = extractErr instanceof Error ? extractErr.message : 'Failed to extract archive.';
          res.status(400).json({ error: msg });
          return;
        }

        if (fileCount === 0) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          tempDir = null;
          res.status(400).json({ error: 'The archive is empty or contains no extractable files.' });
          return;
        }

        const hasPkgJson = fs.existsSync(path.join(tempDir, 'package.json'));

        if (wantsBuild && hasPkgJson) {
          // Server-side build: run npm install + npm run build
          try {
            const buildResult = await runProjectBuild(tempDir, safeContentId);
            projectPath = buildResult.projectPath;
            fileCount = buildResult.fileCount;
            buildLog = buildResult.buildLog;
          } catch (buildErr: unknown) {
            const log = (buildErr instanceof Error && 'buildLog' in buildErr)
              ? String((buildErr as unknown as Record<string, unknown>)['buildLog'])
              : (buildErr instanceof Error ? buildErr.message : String(buildErr));
            fs.rmSync(tempDir, { recursive: true, force: true });
            tempDir = null;
            res.status(422).json({ error: 'Build failed.', buildLog: log });
            return;
          } finally {
            // Clean up source dir (build already copied output to uploads/{id}/)
            if (tempDir && fs.existsSync(tempDir)) {
              fs.rmSync(tempDir, { recursive: true, force: true });
              tempDir = null;
            }
          }
        } else {
          // Extract any nested build zips (repos that ship pre-built bundles inside the ZIP)
          extractNestedBuildZips(tempDir);

          const indexRel = findIndexHtml(tempDir);
          if (!indexRel) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            tempDir = null;
            res.status(400).json({ error: 'No index.html or index.htm found in the archive. Please include an entry page.' });
            return;
          }

          const appDir = path.join(UPLOADS_DIR, safeContentId);
          if (fs.existsSync(appDir)) {
            fs.rmSync(appDir, { recursive: true, force: true });
          }
          fs.renameSync(tempDir, appDir);
          fs.chmodSync(appDir, 0o755);
          tempDir = null;

          projectPath = `/uploads/${safeContentId}/${indexRel}`;

          // Detect .env.example and surface required vars to the client
          const appRootForManifest = path.join(appDir, path.dirname(indexRel) === '.' ? '' : path.dirname(indexRel));
          const envExamplePath = path.join(appRootForManifest, '.env.example');
          if (fs.existsSync(envExamplePath)) {
            try {
              const envRaw = fs.readFileSync(envExamplePath, 'utf8');
              const envVars = envRaw.split('\n')
                .map(l => l.trim())
                .filter(l => l && !l.startsWith('#') && l.includes('='))
                .map(l => l.split('=')[0].trim())
                .filter(Boolean);
              (req as unknown as Record<string, unknown>)['_envVarsRequired'] = envVars;
            } catch { /* non-fatal */ }
          }

          // Detect and start bundled backend if portal.json is present
          const portalManifest = detectPortalManifest(appRootForManifest);
          if (portalManifest) {
            try {
              const backendPort = await allocatePort();
              await handleUploadBackend(safeContentId, appRootForManifest, portalManifest, backendPort);
              // Store backend info — will be committed with the INSERT below
              (req as unknown as Record<string, unknown>)['_backendPort'] = backendPort;
              (req as unknown as Record<string, unknown>)['_backendPrefix'] = portalManifest.backend.prefix;
            } catch (err) {
              logger.error('[content] backend start failed (non-fatal)', { error: String(err) });
            }
          }
        }
      } else if (portalRoute?.trim()) {
        const trimmedRoute = portalRoute.trim();
        if (!/^\/[a-zA-Z0-9/_-]*$/.test(trimmedRoute)) {
          res.status(400).json({ error: 'Invalid portal route: must start with / and contain only letters, digits, /, _ and -.' });
          return;
        }
        portalRouteValue = trimmedRoute;
        fileCount = 0;
      } else {
        const files = (req.files ?? []) as Express.Multer.File[];
        fileCount = files.length || 1;

        if (files.length > 1) {
          ensureUploadsDir();
          const appDir = path.join(UPLOADS_DIR, safeContentId);
          fs.mkdirSync(appDir, { recursive: true });

          for (const file of files) {
            const baseName = path.basename(file.originalname);
            const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
            if (!safeName || safeName.startsWith('.') || safeName.includes('..') || safeName === '') {
              continue;
            }
            const targetPath = path.join(appDir, safeName);
            const resolvedTarget = path.resolve(targetPath);
            const resolvedAppDir = path.resolve(appDir);
            if (!resolvedTarget.startsWith(resolvedAppDir + path.sep) && resolvedTarget !== resolvedAppDir) {
              continue;
            }
            fs.writeFileSync(resolvedTarget, file.buffer);
          }
          projectPath = `/uploads/${safeContentId}/index.html`;
        } else if (files.length === 1) {
          htmlContent = files[0].buffer.toString('utf8');
        }
      }

      const backendPort = (req as unknown as Record<string, unknown>)['_backendPort'] as number | undefined;
      const backendPrefix = (req as unknown as Record<string, unknown>)['_backendPrefix'] as string | undefined;

      const isPro = user.tier === 'pro' || user.isAdmin;
      await pool.query(
        `INSERT INTO uploaded_content
           (id, name, description, uploaded_at, uploaded_by, visibility, allowed_users,
            file_count, html_content, project_path, portal_route, status, build_log,
            backend_port, backend_prefix, expires_at)
         VALUES ($1,$2,$3,NOW(),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                 ${isPro ? 'NULL' : "NOW() + INTERVAL '24 hours'"})`,
        [
          safeContentId,
          name.trim(),
          description?.trim() ?? '',
          user.login,
          vis,
          vis === 'specific' ? allowedUsers : '',
          fileCount,
          htmlContent,
          projectPath,
          portalRouteValue,
          status,
          buildLog,
          backendPort ?? null,
          backendPrefix ?? null,
        ],
      );

      // Verify the entry file actually landed on disk before declaring success
      if (projectPath) {
        const pathParts = projectPath.split('/').slice(2);
        const absolutePath = path.join(UPLOADS_DIR, ...pathParts);
        if (!fs.existsSync(absolutePath)) {
          res.status(500).json({ error: 'Project was uploaded but the entry file could not be verified. Try re-uploading.' });
          return;
        }
      }

      if (backendPort) {
        try { await regenerateNginxAppsConf(); } catch (err) {
          logger.error('[content] nginx conf regeneration failed', { error: String(err) });
        }
      }

      const envVarsRequired = (req as unknown as Record<string, unknown>)['_envVarsRequired'] as string[] | undefined;
      // Fetch share token to return in response
      const stRow = await pool.query<{ share_token: string }>(`SELECT share_token FROM uploaded_content WHERE id = $1`, [safeContentId]);
      res.status(201).json({ id: safeContentId, buildLog, envVarsRequired: envVarsRequired ?? [], shareToken: stRow.rows[0]?.share_token });
    } catch (err) {
      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* non-critical */ }
      }
      console.error('[content] POST / error:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  },
);

/**
 * POST /api/content/github — import a project from a GitHub URL.
 * Fetches the repo as a zipball (supports private repos via user session token).
 * Must be registered before /:id routes.
 */
router.post('/github', requireAuth, checkUploadLimit, storageCheck('reject'), async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getUser(req);
    const { gitUrl, name, description, build } = req.body as {
      gitUrl?: string;
      name?: string;
      description?: string;
      build?: boolean;
    };

    if (!gitUrl?.trim() || !name?.trim()) {
      res.status(400).json({ error: 'gitUrl and name are required.' });
      return;
    }

    const parsed = parseGitHubUrl(gitUrl.trim());
    if (!parsed) {
      res.status(400).json({ error: 'Invalid GitHub URL. Use: https://github.com/owner/repo' });
      return;
    }

    const { owner, repo } = parsed;
    const zipballUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball/HEAD`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Walkable-Portal/1.0',
    };
    const token = req.session?.githubToken;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let zipBuffer: Buffer;
    try {
      const fetchRes = await fetch(zipballUrl, { headers });
      if (!fetchRes.ok) {
        const status = fetchRes.status;
        if (status === 404) {
          res.status(400).json({ error: 'Repository not found or not accessible.' });
        } else if (status === 401 || status === 403) {
          res.status(400).json({ error: 'Access denied. For private repos you must be logged in.' });
        } else {
          res.status(400).json({ error: `GitHub returned status ${String(status)}.` });
        }
        return;
      }
      const ab = await fetchRes.arrayBuffer();
      zipBuffer = Buffer.from(ab);
    } catch {
      res.status(502).json({ error: 'Failed to fetch repository from GitHub.' });
      return;
    }

    const MAX_GITHUB_ZIP = 200 * 1024 * 1024;
    if (zipBuffer.length > MAX_GITHUB_ZIP) {
      res.status(400).json({ error: 'Repository archive exceeds 200 MB.' });
      return;
    }

    const contentId = `gh_${owner}_${repo}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    const safeContentId = contentId.replace(/[^a-zA-Z0-9_-]/g, '');

    ensureUploadsDir();
    let tempDir: string | null = fs.mkdtempSync(path.join(UPLOADS_DIR, 'tmp-zip-'));
    let fileCount = 0;

    try {
      fileCount = extractZipToDir(zipBuffer, tempDir);
    } catch (extractErr) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
      const msg = extractErr instanceof Error ? extractErr.message : 'Failed to extract repository archive.';
      res.status(400).json({ error: msg });
      return;
    }

    if (fileCount === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
      res.status(400).json({ error: 'Repository archive appears to be empty.' });
      return;
    }

    let projectPath: string | null = null;
    let buildLog: string | null = null;
    let ghBackendPort: number | undefined;
    let ghBackendPrefix: string | undefined;
    const hasPkgJson = fs.existsSync(path.join(tempDir, 'package.json'));

    if (build && hasPkgJson) {
      try {
        const buildResult = await runProjectBuild(tempDir, safeContentId);
        projectPath = buildResult.projectPath;
        fileCount = buildResult.fileCount;
        buildLog = buildResult.buildLog;
      } catch (buildErr: unknown) {
        const log = (buildErr instanceof Error && 'buildLog' in buildErr)
          ? String((buildErr as unknown as Record<string, unknown>)['buildLog'])
          : (buildErr instanceof Error ? buildErr.message : String(buildErr));
        if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        res.status(422).json({ error: 'Build failed.', buildLog: log });
        return;
      } finally {
        if (tempDir && fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          tempDir = null;
        }
      }
    } else {
      // GitHub zipball has a top-level prefix dir (owner-repo-sha/) — findIndexHtml handles this recursively
      // First pass: extract any nested .zip files that contain index.html (repos that ship pre-built ZIPs)
      extractNestedBuildZips(tempDir);

      const indexRel = findIndexHtml(tempDir);
      if (!indexRel) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        tempDir = null;
        // No index.html found — might be source-only repo; suggest build flag
        const hint = hasPkgJson ? ' This looks like a source project — try importing with "Build this project" enabled.' : '';
        res.status(400).json({ error: `No index.html found in the repository.${hint}` });
        return;
      }

      const appDir = path.join(UPLOADS_DIR, safeContentId);
      if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
      fs.renameSync(tempDir, appDir);
      fs.chmodSync(appDir, 0o755);
      tempDir = null;

      projectPath = `/uploads/${safeContentId}/${indexRel}`;

      const ghAppRoot = path.join(appDir, path.dirname(indexRel) === '.' ? '' : path.dirname(indexRel));
      const ghManifest = detectPortalManifest(ghAppRoot);
      if (ghManifest) {
        try {
          ghBackendPort = await allocatePort();
          await handleUploadBackend(safeContentId, ghAppRoot, ghManifest, ghBackendPort);
          ghBackendPrefix = ghManifest.backend.prefix;
        } catch (err) {
          logger.error('[content] github backend start failed (non-fatal)', { error: String(err) });
          ghBackendPort = undefined;
          ghBackendPrefix = undefined;
        }
      }
    }

    const isProUser = user.tier === 'pro' || user.isAdmin;
    await pool.query(
      `INSERT INTO uploaded_content
         (id, name, description, uploaded_at, uploaded_by, visibility, allowed_users,
          file_count, html_content, project_path, portal_route, status, git_url, build_log,
          backend_port, backend_prefix, expires_at)
       VALUES ($1,$2,$3,NOW(),$4,'specific',$4,$5,'',$6,NULL,'approved',$7,$8,$9,$10,
               ${isProUser ? 'NULL' : "NOW() + INTERVAL '24 hours'"})`,
      [
        safeContentId,
        name.trim(),
        description?.trim() ?? `Imported from ${gitUrl}`,
        user.login,
        fileCount,
        projectPath,
        gitUrl.trim(),
        buildLog,
        ghBackendPort ?? null,
        ghBackendPrefix ?? null,
      ],
    );

    if (ghBackendPort) {
      try { await regenerateNginxAppsConf(); } catch (err) {
        logger.error('[content] nginx conf regeneration failed', { error: String(err) });
      }
    }

    const ghStRow = await pool.query<{ share_token: string }>(`SELECT share_token FROM uploaded_content WHERE id = $1`, [safeContentId]);
    res.status(201).json({ id: safeContentId, buildLog, shareToken: ghStRow.rows[0]?.share_token });
  } catch (err) {
    console.error('[content] POST /github error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/content/seed — insert seed content as JSON (admin only).
 */
router.post('/seed', async (req, res) => {
  try {
    const item = req.body as {
      id: string;
      name: string;
      description?: string;
      uploadedAt?: string;
      uploadedBy?: string;
      visibility?: string;
      allowedUsers?: string;
      fileCount?: number;
      htmlContent?: string;
      projectPath?: string;
      portalRoute?: string;
    };

    if (!item.id || !item.name) {
      res.status(400).json({ error: 'id and name are required.' });
      return;
    }

    const tombstone = await pool.query<{ id: string }>(
      'SELECT id FROM content_tombstones WHERE id = $1',
      [item.id],
    );
    if ((tombstone.rowCount ?? 0) > 0) {
      res.status(201).json({ id: item.id });
      return;
    }

    const vis = item.visibility === 'specific' ? 'specific' : 'all';

    await pool.query(
      `INSERT INTO uploaded_content
         (id, name, description, uploaded_at, uploaded_by, visibility, allowed_users,
          file_count, html_content, project_path, portal_route, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'approved')
       ON CONFLICT (id) DO UPDATE
         SET project_path  = EXCLUDED.project_path,
             html_content  = EXCLUDED.html_content,
             portal_route  = EXCLUDED.portal_route
         WHERE (uploaded_content.project_path IS NULL
           AND (uploaded_content.html_content = ''
             OR EXCLUDED.project_path IS NOT NULL))
            OR (EXCLUDED.project_path IS NULL
           AND EXCLUDED.html_content <> ''
           AND uploaded_content.html_content = '')
             OR (EXCLUDED.portal_route IS NOT NULL
           AND uploaded_content.portal_route IS DISTINCT FROM EXCLUDED.portal_route)
             OR (EXCLUDED.portal_route IS NULL
           AND EXCLUDED.project_path IS NOT NULL
           AND uploaded_content.portal_route IS NOT NULL)`,
      [
        item.id,
        item.name,
        item.description ?? '',
        item.uploadedAt ?? new Date().toISOString(),
        item.uploadedBy ?? 'admin',
        vis,
        vis === 'specific' ? (item.allowedUsers ?? '') : '',
        item.fileCount ?? 1,
        item.htmlContent ?? '',
        item.projectPath ?? null,
        item.portalRoute ?? null,
      ],
    );

    res.status(201).json({ id: item.id });
  } catch (err) {
    console.error('[content] POST /seed error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/content/:id/render — serve content to authenticated user.
 * Status gate: non-owners can only view approved content.
 */
router.get('/:id/render', renderLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getUser(req);
    const { id } = req.params as { id: string };

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      sendHtmlError(res, 400, 'Invalid Request', 'The project link is malformed.');
      return;
    }

    const result = await pool.query<{
      id: string;
      visibility: string;
      allowed_users: string;
      html_content: string;
      project_path: string | null;
      portal_route: string | null;
      status: string;
      uploaded_by: string;
    }>(
      `SELECT id, visibility, allowed_users, html_content, project_path, portal_route, status, uploaded_by
       FROM uploaded_content WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      sendHtmlError(res, 404, 'Project Not Found', 'This project does not exist or may have been removed.');
      return;
    }

    const row = result.rows[0];

    // Status gate: draft/pending/rejected are only visible to owner and admin
    if (!user.isAdmin) {
      const isOwner = row.uploaded_by === user.login;
      if (!isOwner && row.status !== 'approved') {
        sendHtmlError(res, 403, 'Access Denied', 'You do not have permission to view this project.');
        return;
      }
      // For approved items with specific visibility, check allowed_users
      if (!isOwner && row.status === 'approved' && row.visibility === 'specific') {
        const allowed = (row.allowed_users ?? '').split(',').map((s: string) => s.trim().toLowerCase());
        if (!allowed.includes(user.login.toLowerCase())) {
          sendHtmlError(res, 403, 'Access Denied', 'You do not have permission to view this project.');
          return;
        }
      }
    }

    void auditContentAccess(user.login, id, req.ip);

    if (row.portal_route) {
      res.redirect(302, row.portal_route);
      return;
    }

    if (row.project_path) {
      const pathParts = row.project_path.split('/').slice(2); // strip '' and 'uploads'
      const absolutePath = path.join(UPLOADS_DIR, ...pathParts);
      if (!fs.existsSync(absolutePath)) {
        sendHtmlError(res, 404, 'Project Files Missing',
          'The project files were not found on disk. Try re-uploading the project.');
        return;
      }
      res.redirect(302, row.project_path);
      return;
    }

    if (!row.html_content) {
      sendHtmlError(res, 404, 'Project Is Empty', 'This project has no content. Try re-uploading.');
      return;
    }

    serveInlineHtml(res, row.html_content, user, id, (req.query['theme'] as string) ?? 'light');
  } catch (err) {
    console.error('[content] GET /:id/render error:', err);
    sendHtmlError(res, 500, 'Server Error', 'Something went wrong loading this project. Please try again later.');
  }
});

/**
 * GET /api/content/:id/versions — list version snapshots.
 */
router.get('/:id/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid content ID.' });
      return;
    }
    const result = await pool.query<{ id: number; version_num: number; label: string | null; created_at: string }>(
      `SELECT id, version_num, label, created_at FROM app_versions WHERE content_id = $1 ORDER BY version_num ASC`,
      [id],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[content] GET /:id/versions error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/content/:id/render/version/:versionNum — serve a historical version snapshot.
 */
router.get('/:id/render/version/:versionNum', renderLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getUser(req);
    const { id, versionNum } = req.params as { id: string; versionNum: string };
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) { sendHtmlError(res, 400, 'Invalid Request', 'The project link is malformed.'); return; }

    const vNum = parseInt(versionNum, 10);
    if (isNaN(vNum)) { sendHtmlError(res, 400, 'Invalid Request', 'The version number is invalid.'); return; }

    const parentResult = await pool.query<{
      visibility: string;
      allowed_users: string;
      status: string;
      uploaded_by: string;
    }>(
      `SELECT visibility, allowed_users, status, uploaded_by FROM uploaded_content WHERE id = $1`,
      [id],
    );
    if (parentResult.rows.length === 0) { sendHtmlError(res, 404, 'Project Not Found', 'This project does not exist or may have been removed.'); return; }

    const parent = parentResult.rows[0];
    if (!user.isAdmin) {
      const isOwner = parent.uploaded_by === user.login;
      if (!isOwner && parent.status !== 'approved') {
        sendHtmlError(res, 403, 'Access Denied', 'You do not have permission to view this project.'); return;
      }
      if (!isOwner && parent.status === 'approved' && parent.visibility === 'specific') {
        const allowed = (parent.allowed_users ?? '').split(',').map((s: string) => s.trim().toLowerCase());
        if (!allowed.includes(user.login.toLowerCase())) { sendHtmlError(res, 403, 'Access Denied', 'You do not have permission to view this project.'); return; }
      }
    }

    const vResult = await pool.query<{ html_content: string; project_path: string | null }>(
      `SELECT html_content, project_path FROM app_versions WHERE content_id = $1 AND version_num = $2`,
      [id, vNum],
    );
    if (vResult.rows.length === 0) { sendHtmlError(res, 404, 'Version Not Found', 'This version does not exist.'); return; }

    const row = vResult.rows[0];
    if (row.project_path) { res.redirect(302, row.project_path); return; }

    serveInlineHtml(res, row.html_content ?? '', user, `${id}@v${vNum}`, (req.query['theme'] as string) ?? 'light');
  } catch (err) {
    console.error('[content] GET /:id/render/version/:versionNum error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/content/:id/stop — stop PM2 backend, keep files (owner or admin).
 */
router.post('/:id/stop', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const { id } = req.params as { id: string };
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) { res.status(400).json({ error: 'Invalid ID.' }); return; }
  try {
    const check = await pool.query<{ uploaded_by: string; backend_port: number | null }>(
      `SELECT uploaded_by, backend_port FROM uploaded_content WHERE id = $1`, [id],
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    if (!user.isAdmin && check.rows[0].uploaded_by !== user.login) {
      res.status(403).json({ error: 'Not your project.' }); return;
    }
    if (!check.rows[0].backend_port) {
      res.status(400).json({ error: 'No running backend for this project.' }); return;
    }
    pm2Delete(id);
    await pool.query(`UPDATE uploaded_content SET backend_port = NULL WHERE id = $1`, [id]);
    try { await regenerateNginxAppsConf(); } catch { /* non-fatal */ }
    res.json({ ok: true });
  } catch (err) {
    console.error('[content] POST /:id/stop error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/content/:id/restart — restart stopped PM2 backend (owner or admin).
 */
router.post('/:id/restart', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const { id } = req.params as { id: string };
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) { res.status(400).json({ error: 'Invalid ID.' }); return; }
  try {
    const check = await pool.query<{
      uploaded_by: string; backend_port: number | null;
      backend_prefix: string | null; project_path: string | null;
    }>(
      `SELECT uploaded_by, backend_port, backend_prefix, project_path FROM uploaded_content WHERE id = $1`, [id],
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    const row = check.rows[0];
    if (!user.isAdmin && row.uploaded_by !== user.login) {
      res.status(403).json({ error: 'Not your project.' }); return;
    }
    if (row.backend_port) {
      res.status(400).json({ error: 'Backend is already running.' }); return;
    }
    if (!row.backend_prefix || !row.project_path) {
      res.status(400).json({ error: 'No backend configuration for this project.' }); return;
    }
    // Find portal.json from the project path
    const withoutUploads = row.project_path.replace(/^\/uploads\/[^/]+\//, '');
    const relDir = path.dirname(withoutUploads);
    const contentDir = path.join(UPLOADS_DIR, id);
    const appRoot = relDir === '.' ? contentDir : path.join(contentDir, relDir);
    const manifest = detectPortalManifest(appRoot);
    if (!manifest) {
      res.status(400).json({ error: 'portal.json not found — cannot restart backend.' }); return;
    }
    const newPort = await allocatePort();
    const entryAbs = path.resolve(appRoot, manifest.backend.entry);
    pm2Start(id, entryAbs, newPort);
    await pool.query(
      `UPDATE uploaded_content SET backend_port = $2 WHERE id = $1`,
      [id, newPort],
    );
    try { await regenerateNginxAppsConf(); } catch { /* non-fatal */ }
    res.json({ ok: true, port: newPort });
  } catch (err) {
    console.error('[content] POST /:id/restart error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/content/:id/env — write env vars to portal-data dir (owner only, portal backends only).
 */
router.post('/:id/env', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const { id } = req.params as { id: string };
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const vars = req.body as Record<string, string>;
  if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
    res.status(400).json({ error: 'Body must be a JSON object of key-value env vars.' });
    return;
  }

  try {
    const check = await pool.query<{ uploaded_by: string; backend_port: number | null }>(
      `SELECT uploaded_by, backend_port FROM uploaded_content WHERE id = $1`,
      [id],
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Not found.' }); return; }
    if (!user.isAdmin && check.rows[0].uploaded_by !== user.login) {
      res.status(403).json({ error: 'Not your project.' }); return;
    }

    const dataDir = path.join(UPLOADS_DIR, `portal-data-${id}`);
    fs.mkdirSync(dataDir, { recursive: true });

    const envContent = Object.entries(vars)
      .filter(([k]) => /^[A-Z_][A-Z0-9_]*$/i.test(k))
      .map(([k, v]) => `${k}=${String(v).replace(/\n/g, '\\n')}`)
      .join('\n');
    fs.writeFileSync(path.join(dataDir, '.env'), envContent, 'utf8');

    res.json({ ok: true, varsWritten: Object.keys(vars).length });
  } catch (err) {
    console.error('[content] POST /:id/env error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/content/:id/submit-review — owner submits draft/rejected project for review.
 */
router.post('/:id/submit-review', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getUser(req);
    const { id } = req.params as { id: string };
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) { res.status(400).json({ error: 'Invalid content ID.' }); return; }

    const result = await pool.query<{ uploaded_by: string; status: string }>(
      `SELECT uploaded_by, status FROM uploaded_content WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Content not found.' }); return; }

    const row = result.rows[0];
    if (row.uploaded_by !== user.login && !user.isAdmin) {
      res.status(403).json({ error: 'Not your project.' }); return;
    }
    if (!['draft', 'rejected'].includes(row.status)) {
      res.status(400).json({ error: `Cannot submit a project with status '${row.status}' for review.` }); return;
    }

    await pool.query(
      `UPDATE uploaded_content SET status = 'pending_review', submitted_at = NOW() WHERE id = $1`,
      [id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[content] POST /:id/submit-review error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PATCH /api/content/:id/review — admin approves or rejects a pending project.
 * On approve: sets visibility='all' so the project appears in the public gallery.
 */
router.patch('/:id/review', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { action, note } = req.body as { action?: string; note?: string };

    if (!['approve', 'reject'].includes(action ?? '')) {
      res.status(400).json({ error: "action must be 'approve' or 'reject'." }); return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) { res.status(400).json({ error: 'Invalid content ID.' }); return; }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const result = await pool.query<{ id: string; status: string }>(
      `UPDATE uploaded_content
         SET status      = $1,
             visibility  = CASE WHEN $1 = 'approved' THEN 'all' ELSE visibility END,
             allowed_users = CASE WHEN $1 = 'approved' THEN '' ELSE allowed_users END,
             review_note = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE review_note END
       WHERE id = $3 AND status = 'pending_review'
       RETURNING id, status`,
      [newStatus, note ?? null, id],
    );

    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'Item not found or not pending review.' }); return;
    }

    res.json({ success: true, id, status: newStatus });
  } catch (err) {
    console.error('[content] PATCH /:id/review error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PATCH /api/content/:id — update metadata (admin or owner of draft/rejected).
 */
router.patch('/:id', async (req, res) => {
  try {
    const user = getUser(req);
    const { id } = req.params as { id: string };
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) { res.status(400).json({ error: 'Invalid content ID.' }); return; }

    const rowResult = await pool.query<{ uploaded_by: string; status: string }>(
      `SELECT uploaded_by, status FROM uploaded_content WHERE id = $1`,
      [id],
    );
    if (rowResult.rows.length === 0) { res.status(404).json({ error: 'Content not found.' }); return; }
    const row = rowResult.rows[0];

    if (!user.isAdmin) {
      if (row.uploaded_by !== user.login) { res.status(403).json({ error: 'Not your project.' }); return; }
    }

    const { name, description, visibility, allowedUsers } = req.body as {
      name?: string;
      description?: string;
      visibility?: string;
      allowedUsers?: string;
    };

    const vis = user.isAdmin
      ? (visibility === 'specific' ? 'specific' : (visibility === 'all' ? 'all' : undefined))
      : undefined;

    await pool.query(
      `UPDATE uploaded_content SET
         name          = COALESCE($1, name),
         description   = COALESCE($2, description),
         visibility    = COALESCE($3, visibility),
         allowed_users = COALESCE($4, allowed_users)
       WHERE id = $5`,
      [
        name?.trim() ?? null,
        description?.trim() ?? null,
        vis ?? null,
        user.isAdmin ? (allowedUsers?.trim() ?? null) : null,
        id,
      ],
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[content] PATCH /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PATCH /api/content/:id/rename — change the URL slug / ID (admin only).
 */
router.patch('/:id/rename', async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const { newId } = req.body as { newId?: string };

    if (!newId?.trim()) {
      res.status(400).json({ error: 'newId is required.' });
      return;
    }

    const trimmedNewId = newId.trim();

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedNewId)) {
      res.status(400).json({ error: 'Invalid slug: only letters, digits, hyphens, and underscores are allowed.' });
      return;
    }

    if (trimmedNewId === id) {
      res.json({ success: true });
      return;
    }

    const existing = await pool.query('SELECT id FROM uploaded_content WHERE id = $1', [trimmedNewId]);
    if ((existing.rowCount ?? 0) > 0) {
      res.status(409).json({ error: 'This slug is already in use.' });
      return;
    }

    const oldAppDir = path.resolve(UPLOADS_DIR, id);
    const newAppDir = path.resolve(UPLOADS_DIR, trimmedNewId);
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
    if (
      oldAppDir.startsWith(resolvedUploadsDir + path.sep) &&
      newAppDir.startsWith(resolvedUploadsDir + path.sep) &&
      fs.existsSync(oldAppDir)
    ) {
      fs.renameSync(oldAppDir, newAppDir);
    }

    const oldThumb = path.join(THUMBNAILS_DIR, `${id}.jpg`);
    const newThumb = path.join(THUMBNAILS_DIR, `${trimmedNewId}.jpg`);
    if (fs.existsSync(oldThumb)) {
      fs.renameSync(oldThumb, newThumb);
    }

    await pool.query(
      `UPDATE uploaded_content
         SET id           = $1,
             project_path = CASE
               WHEN project_path LIKE $2 THEN replace(project_path, $3, $1)
               ELSE project_path
             END
       WHERE id = $4`,
      [trimmedNewId, `/uploads/${id}/%`, id, id],
    );

    try {
      const auditId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const user = (req as Request & { user?: AuthenticatedUser }).user;
      await pool.query(
        `INSERT INTO audit_log (id, timestamp, event_type, "user", detail)
         VALUES ($1, NOW(), 'content_rename', $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [auditId, user?.login ?? 'unknown', `Renamed app slug: ${id} → ${trimmedNewId}`],
      );
    } catch { /* non-critical */ }

    res.json({ success: true, newId: trimmedNewId });
  } catch (err) {
    console.error('[content] PATCH /:id/rename error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /api/content/:id/archive — replace the files of an existing hosted app (admin or owner).
 */
router.put(
  '/:id/archive',
  (req, res, next) => {
    zipUpload.single('archive')(req, res, (zipErr) => {
      if (zipErr) {
        res.status(400).json({ error: zipErr.message ?? 'Invalid archive file.' });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const user = getUser(req);
    const { id } = req.params as { id: string };

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid content ID.' });
      return;
    }
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');

    const archiveFile = (req as { file?: Express.Multer.File }).file;
    if (!archiveFile) {
      res.status(400).json({ error: 'No archive file provided.' });
      return;
    }

    let tempDir: string | null = null;
    let backupDir: string | null = null;

    try {
      const result = await pool.query<{ project_path: string | null; uploaded_by: string; status: string }>(
        'SELECT project_path, uploaded_by, status FROM uploaded_content WHERE id = $1',
        [safeId],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Content not found.' });
        return;
      }

      const rowData = result.rows[0];
      if (!user.isAdmin && rowData.uploaded_by !== user.login) {
        res.status(403).json({ error: 'Not your project.' }); return;
      }

      if (!rowData.project_path?.startsWith('/uploads/')) {
        res.status(400).json({
          error: 'This app\'s files cannot be replaced this way — it is a seeded app served from the public directory.',
        });
        return;
      }

      ensureUploadsDir();
      tempDir = fs.mkdtempSync(path.join(UPLOADS_DIR, 'tmp-zip-'));

      let fileCount: number;
      try {
        fileCount = extractZipToDir(archiveFile.buffer, tempDir);
      } catch (extractErr) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        tempDir = null;
        const msg = extractErr instanceof Error ? extractErr.message : 'Failed to extract archive.';
        res.status(400).json({ error: msg });
        return;
      }

      if (fileCount === 0) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        tempDir = null;
        res.status(400).json({ error: 'The archive is empty or contains no extractable files.' });
        return;
      }

      const indexRel = findIndexHtml(tempDir);
      if (!indexRel) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        tempDir = null;
        res.status(400).json({ error: 'No index.html or index.htm found in the archive.' });
        return;
      }

      const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
      const appDir = path.resolve(resolvedUploadsDir, safeId);
      const rel = path.relative(resolvedUploadsDir, appDir);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        tempDir = null;
        res.status(400).json({ error: 'Invalid content ID: path escapes uploads directory.' });
        return;
      }

      try {
        const snap = await pool.query<{ html_content: string; project_path: string | null }>(
          'SELECT html_content, project_path FROM uploaded_content WHERE id = $1',
          [safeId],
        );
        if (snap.rows.length > 0) {
          const maxVer = await pool.query<{ max: number | null }>(
            'SELECT MAX(version_num) AS max FROM app_versions WHERE content_id = $1',
            [safeId],
          );
          const nextVer = (maxVer.rows[0].max ?? 0) + 1;
          await pool.query(
            `INSERT INTO app_versions (content_id, version_num, html_content, project_path)
             VALUES ($1, $2, $3, $4)`,
            [safeId, nextVer, snap.rows[0].html_content ?? '', snap.rows[0].project_path],
          );
        }
      } catch { /* non-critical */ }

      if (fs.existsSync(appDir)) {
        backupDir = `${appDir}.bak-${Date.now()}`;
        fs.renameSync(appDir, backupDir);
      }

      fs.renameSync(tempDir, appDir);
      fs.chmodSync(appDir, 0o755);
      tempDir = null;

      if (backupDir && fs.existsSync(backupDir)) {
        fs.rmSync(backupDir, { recursive: true, force: true });
        backupDir = null;
      }

      const newProjectPath = `/uploads/${safeId}/${indexRel}`;
      await pool.query(
        'UPDATE uploaded_content SET project_path = $1, file_count = $2 WHERE id = $3',
        [newProjectPath, fileCount, safeId],
      );

      try {
        const auditId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await pool.query(
          `INSERT INTO audit_log (id, timestamp, event_type, "user", detail)
           VALUES ($1, NOW(), 'content_archive_replace', $2, $3)
           ON CONFLICT (id) DO NOTHING`,
          [auditId, user.login, `Replaced archive for app: ${safeId}`],
        );
      } catch { /* non-critical */ }

      res.json({ success: true, projectPath: newProjectPath, fileCount });
    } catch (err) {
      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* non-critical */ }
      }
      if (backupDir && fs.existsSync(backupDir)) {
        const appDir = path.resolve(UPLOADS_DIR, safeId);
        try {
          if (!fs.existsSync(appDir)) fs.renameSync(backupDir, appDir);
        } catch { /* non-critical */ }
      }
      console.error('[content] PUT /:id/archive error:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  },
);

/**
 * DELETE /api/content/:id — delete content.
 * Admin can delete anything. Owner can only delete their own draft or rejected items.
 */
router.delete('/:id', async (req, res) => {
  try {
    const user = getUser(req);
    const { id } = req.params as { id: string };

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid content ID.' });
      return;
    }

    const check = await pool.query<{ uploaded_by: string; status: string; backend_port: number | null }>(
      'SELECT uploaded_by, status, backend_port FROM uploaded_content WHERE id = $1',
      [id],
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'Content not found.' }); return; }
    const row = check.rows[0];
    if (!user.isAdmin && row.uploaded_by !== user.login) {
      res.status(403).json({ error: 'Not your project.' }); return;
    }
    const hasBackend = row.backend_port !== null;

    const appDir = path.resolve(UPLOADS_DIR, id);
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
    if (appDir.startsWith(resolvedUploadsDir + path.sep) && fs.existsSync(appDir)) {
      fs.rmSync(appDir, { recursive: true, force: true });
    }

    const dataDir = path.join(UPLOADS_DIR, `portal-data-${id}`);
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });

    const thumbPath = path.join(THUMBNAILS_DIR, `${id}.jpg`);
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }

    if (hasBackend) {
      pm2Delete(id);
    }

    await pool.query('DELETE FROM uploaded_content WHERE id = $1', [id]);

    if (hasBackend) {
      try { await regenerateNginxAppsConf(); } catch (err) {
        logger.error('[content] nginx conf regen failed after delete', { error: String(err) });
      }
    }

    const adminUser = getUser(req);
    await pool.query(
      `INSERT INTO content_tombstones (id, deleted_at, deleted_by)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (id) DO NOTHING`,
      [id, adminUser.login],
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[content] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /api/content/:id/thumbnail */
router.get('/:id/thumbnail', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid content ID.' });
      return;
    }
    const thumbPath = path.join(THUMBNAILS_DIR, `${id}.jpg`);
    if (!fs.existsSync(thumbPath)) {
      res.status(404).json({ error: 'No thumbnail.' });
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(thumbPath).pipe(res);
  } catch (err) {
    console.error('[content] GET /:id/thumbnail error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /api/content/:id/thumbnail */
router.post('/:id/thumbnail', thumbnailUpload.single('thumbnail'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid content ID.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided.' });
      return;
    }

    if (!fs.existsSync(THUMBNAILS_DIR)) {
      fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }

    const thumbPath = path.join(THUMBNAILS_DIR, `${id}.jpg`);

    await sharp(req.file.buffer)
      .resize(256, 256, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85 })
      .toFile(thumbPath);

    const relativePath = `/uploads/thumbnails/${id}.jpg`;
    await pool.query('UPDATE uploaded_content SET thumbnail_path = $1 WHERE id = $2', [relativePath, id]);

    res.json({ thumbnailPath: relativePath });
  } catch (err) {
    console.error('[content] POST /:id/thumbnail error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** DELETE /api/content/:id/thumbnail */
router.delete('/:id/thumbnail', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid content ID.' });
      return;
    }

    const thumbPath = path.join(THUMBNAILS_DIR, `${id}.jpg`);
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }

    await pool.query('UPDATE uploaded_content SET thumbnail_path = NULL WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[content] DELETE /:id/thumbnail error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
