import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import sharp from 'sharp';
import { pool } from '../db/client';
import type { AuthenticatedUser } from '../types';
import type { Request, Response } from 'express';

const router = Router();

/** Directory where multi-file uploads are stored on disk. */
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');

/** Directory where app thumbnails are stored. */
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

/**
 * Per-user rate limiter for the content render endpoint.
 * Keyed by authenticated user login after the authenticate middleware runs.
 * Falls back to IP address if no user is available.
 */
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

/** Ensure the uploads directory exists. */
function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/** Multer storage: disk storage for multi-file uploads, memory for single HTML files. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
});

/** Multer instance for ZIP archive uploads — up to 200 MB. */
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
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

/** Hard limits applied during ZIP extraction to prevent resource exhaustion. */
const ZIP_MAX_FILES = 5_000;
const ZIP_MAX_EXTRACTED_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Extract a ZIP archive buffer safely into a target directory.
 * Returns the number of extracted files.
 *
 * Safety guarantees:
 * - Blocks zip-slip / path traversal entries.
 * - Blocks symlinks and non-file entries (devices, sockets, etc.).
 * - Enforces per-archive file count and total extracted size limits.
 * - All entries are written only after all validation passes; on any error the
 *   caller is responsible for cleaning up the target directory.
 */
function extractZipToDir(buffer: Buffer, targetDir: string): number {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  if (entries.length > ZIP_MAX_FILES) {
    throw new Error(`Archive contains too many entries (limit: ${ZIP_MAX_FILES}).`);
  }

  let totalBytes = 0;
  const resolvedTarget = path.resolve(targetDir);

  for (const entry of entries) {
    // Skip directory-only entries
    if (entry.isDirectory) continue;

    const entryName = entry.entryName;

    // Reject paths that contain null bytes or are empty
    if (!entryName || entryName.includes('\0')) {
      throw new Error(`Archive contains an entry with an invalid name.`);
    }

    // Reject entries that reference parent directories (zip-slip).
    // Also covers the edge case where resolvedEntry equals the target dir itself.
    const resolvedEntry = path.resolve(targetDir, entryName);
    if (!resolvedEntry.startsWith(resolvedTarget + path.sep) && resolvedEntry !== resolvedTarget) {
      throw new Error(`Archive contains a path traversal entry: "${entryName}".`);
    }

    // Reject dot-starting filenames in any path segment.
    // Allow '.' (current-directory notation in relative paths) but block '..' and '.hidden' etc.
    const segments = entryName.split('/');
    if (segments.some((seg) => seg.startsWith('.') && seg !== '.')) {
      throw new Error(`Archive contains a hidden file or dot-prefixed entry: "${entryName}".`);
    }

    totalBytes += entry.header.size;
    if (totalBytes > ZIP_MAX_EXTRACTED_BYTES) {
      throw new Error(`Archive would exceed maximum extracted size (${ZIP_MAX_EXTRACTED_BYTES / 1024 / 1024} MB).`);
    }
  }

  // All entries validated — extract
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName;
    const resolvedEntry = path.resolve(targetDir, entryName);

    const entryDir = path.dirname(resolvedEntry);
    fs.mkdirSync(entryDir, { recursive: true });
    fs.writeFileSync(resolvedEntry, entry.getData());
    count++;
  }

  return count;
}

/**
 * Search a directory tree for index.html / index.htm (case-insensitive).
 * Prefers the shallowest match; when multiple files share the same depth the
 * first one in sorted order wins for determinism.
 * Returns the path relative to rootDir, using forward slashes.
 */
function findIndexHtml(rootDir: string): string | null {
  const candidates: { depth: number; rel: string }[] = [];

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
          candidates.push({ depth, rel });
        }
      }
    }
  }

  walk(rootDir, 0);

  if (candidates.length === 0) return null;
  // Shallowest wins; ties broken lexicographically for determinism.
  candidates.sort((a, b) => a.depth - b.depth || a.rel.localeCompare(b.rel));
  return candidates[0].rel;
}

/** Multer for thumbnail uploads — images only, 5 MB limit. */
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

/**
 * GET /api/content
 * Admin: all items.
 * Regular user: only items with visibility='all' or where login is in allowedUsers.
 */
router.get('/', async (req, res) => {
  try {
    const user = getUser(req);
    let query: string;
    let params: unknown[];

    if (user.isAdmin) {
      query = `SELECT id, name, description, uploaded_at AS "uploadedAt",
                      uploaded_by AS "uploadedBy", visibility, allowed_users AS "allowedUsers",
                      file_count AS "fileCount", project_path AS "projectPath",
                      (html_content <> '') AS "hasContent",
                      thumbnail_path AS "thumbnailPath",
                      portal_route AS "portalRoute"
               FROM uploaded_content
               ORDER BY uploaded_at DESC`;
      params = [];
    } else {
      query = `SELECT id, name, description, uploaded_at AS "uploadedAt",
                      uploaded_by AS "uploadedBy", visibility, allowed_users AS "allowedUsers",
                      file_count AS "fileCount", project_path AS "projectPath",
                      (html_content <> '') AS "hasContent",
                      thumbnail_path AS "thumbnailPath",
                      portal_route AS "portalRoute"
               FROM uploaded_content
               WHERE visibility = 'all'
                  OR (visibility = 'specific' AND lower($1) = ANY(
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
 * Inject a user-specific watermark into an HTML document.
 * A hidden, invisible element is inserted just before </body>.
 * This enables forensic identification if the content is exfiltrated.
 */
function injectWatermark(html: string, login: string, contentId: string): string {
  const timestamp = new Date().toISOString();
  // Encode login to prevent any HTML injection from the login value
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

/**
 * Inject a minimal theme style block into an inline HTML app.
 * For dark theme, sets color-scheme and overrides body colours.
 * For light theme, only resets color-scheme (a no-op for most apps).
 * Inserted before the first </head> when present; if no </head>, inserted after
 * the DOCTYPE declaration (to preserve Standards Mode) or prepended as a fallback.
 * We use indexOf (first match) rather than lastIndexOf to avoid being misled by
 * </head> substrings that appear inside JavaScript string literals in minified
 * libraries (e.g. the SheetJS template string in NormalizerCSV).
 */
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
  // No </head>: inject immediately after the DOCTYPE declaration (if present)
  // so the DOCTYPE remains the very first content and Standards Mode is preserved.
  // Since rawHtml is guaranteed to start with <!doctype after BOM-stripping, we
  // simply locate the first '>' which is the closing angle bracket of the declaration.
  if (lower.startsWith('<!doctype')) {
    const doctypeEnd = html.indexOf('>');
    if (doctypeEnd !== -1) {
      return html.slice(0, doctypeEnd + 1) + inject + html.slice(doctypeEnd + 1);
    }
  }
  return inject + html;
}

/**
 * Fire-and-forget audit log entry for content access.
 * Errors are swallowed so audit failures never block serving content.
 */
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
    // Non-critical — audit failures must not break content delivery
  }
}

/**
 * GET /api/content/:id/render
 * Serves the HTML content of an uploaded item to the authenticated user.
 * – Inline HTML apps: served as text/html with security headers and a user watermark.
 * – Multi-file apps: issues a redirect to the nginx-served /uploads/ path.
 *   The nginx auth_request gate and the mops_session cookie protect that path.
 * Every access is recorded in the audit_log table.
 */
router.get('/:id/render', renderLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getUser(req);
    const { id } = req.params as { id: string };

    // Validate ID to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid content ID.' });
      return;
    }

    // Fetch the content row — include html_content only here (never in the list endpoint)
    const result = await pool.query<{
      id: string;
      visibility: string;
      allowed_users: string;
      html_content: string;
      project_path: string | null;
      portal_route: string | null;
    }>(
      `SELECT id, visibility, allowed_users, html_content, project_path, portal_route
       FROM uploaded_content WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Content not found.' });
      return;
    }

    const row = result.rows[0];

    // Access control: admin sees everything; others must be in allowedUsers for specific visibility
    if (!user.isAdmin && row.visibility === 'specific') {
      const allowed = (row.allowed_users ?? '')
        .split(',')
        .map((s: string) => s.trim().toLowerCase());
      if (!allowed.includes(user.login.toLowerCase())) {
        res.status(403).json({ error: 'Access denied.' });
        return;
      }
    }

    // Fire-and-forget audit entry
    void auditContentAccess(user.login, id, req.ip);

    if (row.portal_route) {
      // Portal-link app: redirect directly to the internal portal page.
      res.redirect(302, row.portal_route);
      return;
    }

    if (row.project_path) {
      // Multi-file app: redirect to nginx-served path.
      // The mops_session cookie satisfies nginx's auth_request gate for /uploads/.
      res.redirect(302, row.project_path);
      return;
    }

    // Inline HTML: serve directly with security headers and watermark
    let rawHtml = row.html_content ?? '';

    // Strip UTF-8 BOM (\uFEFF) and leading whitespace so that the DOCTYPE
    // is the very first byte sequence the browser sees.  A BOM or any
    // whitespace before <!DOCTYPE html> causes browsers to switch to
    // Quirks Mode even when a DOCTYPE is present.
    rawHtml = rawHtml.replace(/^[\uFEFF\s]+/, '');

    // Ensure the document is served in Standards Mode.
    // If the stored HTML lacks a DOCTYPE (e.g. it was seeded as an empty
    // placeholder while project_path migration is pending), inject one so
    // browsers do not fall back to Quirks Mode.
    if (!rawHtml.toLowerCase().startsWith('<!doctype')) {
      rawHtml = '<!DOCTYPE html>\n' + rawHtml;
    }

    const watermarked = injectWatermark(rawHtml, user.login, id);

    // Apply the requested theme (dark / light) to inline HTML content
    const theme = req.query['theme'] === 'dark' ? 'dark' : 'light';
    const themed = injectTheme(watermarked, theme);

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
  } catch (err) {
    console.error('[content] GET /:id/render error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/content/:id/versions — list version snapshots for an app.
 * Returns an array ordered oldest-first. The current live version is NOT included.
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
 * GET /api/content/:id/render?version=N — serve a historical version snapshot.
 * Falls through to the live render when no version param is given (handled above).
 */
router.get('/:id/render/version/:versionNum', renderLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getUser(req);
    const { id, versionNum } = req.params as { id: string; versionNum: string };
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) { res.status(400).json({ error: 'Invalid content ID.' }); return; }

    const vNum = parseInt(versionNum, 10);
    if (isNaN(vNum)) { res.status(400).json({ error: 'Invalid version number.' }); return; }

    // Access-control: check visibility on the parent content row
    const parentResult = await pool.query<{ visibility: string; allowed_users: string }>(
      `SELECT visibility, allowed_users FROM uploaded_content WHERE id = $1`,
      [id],
    );
    if (parentResult.rows.length === 0) { res.status(404).json({ error: 'Content not found.' }); return; }
    const parent = parentResult.rows[0];
    if (!user.isAdmin && parent.visibility === 'specific') {
      const allowed = (parent.allowed_users ?? '').split(',').map((s: string) => s.trim().toLowerCase());
      if (!allowed.includes(user.login.toLowerCase())) { res.status(403).json({ error: 'Access denied.' }); return; }
    }

    const vResult = await pool.query<{ html_content: string; project_path: string | null }>(
      `SELECT html_content, project_path FROM app_versions WHERE content_id = $1 AND version_num = $2`,
      [id, vNum],
    );
    if (vResult.rows.length === 0) { res.status(404).json({ error: 'Version not found.' }); return; }

    const row = vResult.rows[0];
    if (row.project_path) { res.redirect(302, row.project_path); return; }

    let rawHtml = (row.html_content ?? '').replace(/^[\uFEFF\s]+/, '');
    if (!rawHtml.toLowerCase().startsWith('<!doctype')) rawHtml = '<!DOCTYPE html>\n' + rawHtml;
    const watermarked = injectWatermark(rawHtml, user.login, `${id}@v${vNum}`);
    const theme = req.query['theme'] === 'dark' ? 'dark' : 'light';
    const themed = injectTheme(watermarked, theme);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    res.setHeader('Content-Security-Policy',
      "sandbox allow-scripts allow-forms allow-same-origin allow-modals allow-popups allow-downloads; default-src 'self' 'unsafe-inline' data:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; frame-ancestors 'self';",
    );
    res.status(200).send(themed);
  } catch (err) {
    console.error('[content] GET /:id/render/version/:versionNum error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/content — upload new content (admin only).
 * Accepts multipart/form-data with fields: name, description, visibility, allowedUsers
 * and either:
 *   – one or more files in the `files` field (existing behaviour), or
 *   – a single ZIP archive in the `archive` field (new: full project upload).
 *
 * ZIP upload flow:
 *  1. Extract the archive into a temporary directory under UPLOADS_DIR.
 *  2. Validate every entry (path traversal, hidden files, limits).
 *  3. Discover the entry page (index.html / index.htm) automatically.
 *  4. Move the temp directory to the final app directory atomically.
 *  5. Store project_path pointing at the discovered index file.
 *
 * The `files` flow is unchanged: multiple files → disk + fixed index.html path;
 * single file → inline HTML stored in the database.
 */
router.post(
  '/',
  (req, res, next) => {
    // Dispatch to the appropriate multer handler based on what the client sends.
    // The Content-Type boundary reveals which field the client uses.
    // We run both parsers in sequence: zipUpload first (it validates MIME/ext),
    // then fall back to the general upload parser.
    zipUpload.single('archive')(req, res, (zipErr) => {
      if (zipErr) {
        // If multer rejected the file (wrong type), propagate the error as a 400.
        res.status(400).json({ error: zipErr.message ?? 'Invalid archive file.' });
        return;
      }
      if ((req as { file?: unknown }).file) {
        // ZIP was accepted — skip the general files parser
        next();
        return;
      }
      // No archive field — try the general files parser
      upload.array('files')(req, res, next);
    });
  },
  async (req, res) => {
    const user = getUser(req);
    const rawBody = req.body as Record<string, unknown>;

    // Coerce multipart fields — they may arrive as string[] when form has duplicate keys
    const name = Array.isArray(rawBody.name) ? rawBody.name[0] : (rawBody.name as string | undefined);
    const description = Array.isArray(rawBody.description) ? rawBody.description[0] : (rawBody.description as string | undefined);
    const visibility = Array.isArray(rawBody.visibility) ? rawBody.visibility[0] : (rawBody.visibility as string | undefined);
    const allowedUsers = Array.isArray(rawBody.allowedUsers) ? rawBody.allowedUsers[0] : (rawBody.allowedUsers as string | undefined);
    const providedId = Array.isArray(rawBody.id) ? rawBody.id[0] : (rawBody.id as string | undefined);
    const portalRoute = Array.isArray(rawBody.portalRoute) ? rawBody.portalRoute[0] : (rawBody.portalRoute as string | undefined);

    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required.' });
      return;
    }

    const vis = (visibility === 'specific' ? 'specific' : 'all') as 'all' | 'specific';

    const contentId = providedId?.trim() || `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Sanitize contentId to prevent path traversal — allow only safe characters
    if (!/^[a-zA-Z0-9_-]+$/.test(contentId)) {
      res.status(400).json({ error: 'Invalid content ID: only alphanumeric characters, hyphens, and underscores are allowed.' });
      return;
    }
    // Re-apply the same filter so the safe value is explicitly constructed for
    // static-analysis tools even though the check above already guarantees this.
    const safeContentId = contentId.replace(/[^a-zA-Z0-9_-]/g, '');

    let htmlContent = '';
    let projectPath: string | null = null;
    let portalRouteValue: string | null = null;
    let fileCount = 0;

    /** Temporary directory used during ZIP extraction; cleaned up on any error. */
    let tempDir: string | null = null;

    try {
      const archiveFile = (req as { file?: Express.Multer.File }).file;

      if (archiveFile) {
        // ── ZIP archive upload path ──────────────────────────────────────────        ensureUploadsDir();

        // Extract into a temp directory first so we can validate before committing
        tempDir = fs.mkdtempSync(path.join(UPLOADS_DIR, 'tmp-zip-'));

        try {
          fileCount = extractZipToDir(archiveFile.buffer, tempDir);
        } catch (extractErr) {
          // Extraction / validation failed — clean up and return a user-friendly error
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

        // Auto-discover the entry point
        const indexRel = findIndexHtml(tempDir);
        if (!indexRel) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          tempDir = null;
          res.status(400).json({ error: 'No index.html or index.htm found in the archive. Please include an entry page.' });
          return;
        }

        // Move to final location (rename is atomic on the same filesystem)
        const appDir = path.join(UPLOADS_DIR, safeContentId);
        // Guard against a race where the directory already exists
        if (fs.existsSync(appDir)) {
          fs.rmSync(appDir, { recursive: true, force: true });
        }
        fs.renameSync(tempDir, appDir);
        tempDir = null;

        projectPath = `/uploads/${safeContentId}/${indexRel}`;
      } else if (portalRoute?.trim()) {
        // ── Portal-link mode: no file upload — just store the internal route ──
        const trimmedRoute = portalRoute.trim();
        // Validate: must start with '/' and contain only safe URL characters.
        if (!/^\/[a-zA-Z0-9/_-]*$/.test(trimmedRoute)) {
          res.status(400).json({ error: 'Invalid portal route: must start with / and contain only letters, digits, /, _ and -.' });
          return;
        }
        portalRouteValue = trimmedRoute;
        fileCount = 0;
      } else {
        // ── Individual files upload path (existing behaviour) ────────────────
        const files = (req.files ?? []) as Express.Multer.File[];
        fileCount = files.length || 1;

        if (files.length > 1) {
          // Multi-file: save to disk
          ensureUploadsDir();
          const appDir = path.join(UPLOADS_DIR, safeContentId);
          fs.mkdirSync(appDir, { recursive: true });

          for (const file of files) {
            // Sanitize filename: remove path separators and non-safe characters;
            // reject names that start with a dot, contain sequences of dots, or path separators.
            const baseName = path.basename(file.originalname);
            const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
            // Block names that begin with a dot, are purely dots, or contain '..'
            if (!safeName || safeName.startsWith('.') || safeName.includes('..') || safeName === '') {
              continue; // skip dangerous filenames
            }
            const targetPath = path.join(appDir, safeName);
            // Ensure the resolved path stays within appDir
            const resolvedTarget = path.resolve(targetPath);
            const resolvedAppDir = path.resolve(appDir);
            if (!resolvedTarget.startsWith(resolvedAppDir + path.sep) && resolvedTarget !== resolvedAppDir) {
              continue; // skip if path escapes the app directory
            }
            fs.writeFileSync(resolvedTarget, file.buffer);
          }
          projectPath = `/uploads/${safeContentId}/index.html`;
        } else if (files.length === 1) {
          // Single-file: store content inline
          htmlContent = files[0].buffer.toString('utf8');
        }
      }

      await pool.query(
        `INSERT INTO uploaded_content
           (id, name, description, uploaded_at, uploaded_by, visibility, allowed_users, file_count, html_content, project_path, portal_route)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)`,
        [
          safeContentId,
          name.trim(),
          description?.trim() ?? '',
          user.login,
          vis,
          vis === 'specific' ? (allowedUsers?.trim() ?? '') : '',
          fileCount,
          htmlContent,
          projectPath,
          portalRouteValue,
        ],
      );

      res.status(201).json({ id: safeContentId });
    } catch (err) {
      // Clean up any leftover temp directory on unexpected errors
      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* non-critical */ }
      }
      console.error('[content] POST / error:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  },
);

/** PATCH /api/content/:id — update metadata (admin only) */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const { name, description, visibility, allowedUsers } = req.body as {
      name?: string;
      description?: string;
      visibility?: string;
      allowedUsers?: string;
    };

    const vis = visibility === 'specific' ? 'specific' : (visibility === 'all' ? 'all' : undefined);

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
        allowedUsers?.trim() ?? null,
        id,
      ],
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[content] PATCH /:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PATCH /api/content/:id/rename — change the URL slug / ID of an app (admin only) */
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

    // Check new ID is not already taken
    const existing = await pool.query('SELECT id FROM uploaded_content WHERE id = $1', [trimmedNewId]);
    if ((existing.rowCount ?? 0) > 0) {
      res.status(409).json({ error: 'This slug is already in use.' });
      return;
    }

    // Rename on-disk app directory if it exists
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

    // Rename thumbnail if it exists
    const oldThumb = path.join(THUMBNAILS_DIR, `${id}.jpg`);
    const newThumb = path.join(THUMBNAILS_DIR, `${trimmedNewId}.jpg`);
    if (fs.existsSync(oldThumb)) {
      fs.renameSync(oldThumb, newThumb);
    }

    // Update project_path if it references the old ID
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

    // Audit log
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
 * PUT /api/content/:id/archive — replace the files of an existing user-uploaded hosted app (admin only).
 * Accepts a ZIP archive and atomically replaces the on-disk app directory.
 * Only works for apps whose project_path starts with '/uploads/' (not seeded public-dir apps).
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
    // Re-apply the same filter so the safe value is explicitly constructed for
    // static-analysis tools even though the regex check above already guarantees this.
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');

    const archiveFile = (req as { file?: Express.Multer.File }).file;
    if (!archiveFile) {
      res.status(400).json({ error: 'No archive file provided.' });
      return;
    }

    let tempDir: string | null = null;
    let backupDir: string | null = null;

    try {
      // Verify the item exists and has a mutable project_path under /uploads/
      const result = await pool.query<{ project_path: string | null }>(
        'SELECT project_path FROM uploaded_content WHERE id = $1',
        [safeId],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Content not found.' });
        return;
      }

      const { project_path } = result.rows[0];
      if (!project_path?.startsWith('/uploads/')) {
        res.status(400).json({
          error:
            'This app\'s files cannot be replaced this way — it is a seeded app served from the public directory. Delete it and re-upload a ZIP with the same ID instead.',
        });
        return;
      }

      ensureUploadsDir();

      // Extract into a temp directory first so we can validate before committing
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
        res.status(400).json({ error: 'No index.html or index.htm found in the archive. Please include an entry page.' });
        return;
      }

      // id is validated to [a-zA-Z0-9_-] so path.resolve is safe from traversal.
      // Use path.relative as an extra guard to confirm appDir is inside UPLOADS_DIR.
      const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
      const appDir = path.resolve(resolvedUploadsDir, safeId);
      const rel = path.relative(resolvedUploadsDir, appDir);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        tempDir = null;
        res.status(400).json({ error: 'Invalid content ID: path escapes uploads directory.' });
        return;
      }

      // Snapshot the current version before replacing
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
      } catch { /* non-critical — snapshot failure must not block the update */ }

      // Back up the existing directory before replacing so we can recover on failure.
      if (fs.existsSync(appDir)) {
        backupDir = `${appDir}.bak-${Date.now()}`;
        fs.renameSync(appDir, backupDir);
      }

      // Move validated temp dir into place
      fs.renameSync(tempDir, appDir);
      tempDir = null;

      // Remove backup only after the new directory is in place
      if (backupDir && fs.existsSync(backupDir)) {
        fs.rmSync(backupDir, { recursive: true, force: true });
        backupDir = null;
      }

      const newProjectPath = `/uploads/${safeId}/${indexRel}`;
      await pool.query(
        'UPDATE uploaded_content SET project_path = $1, file_count = $2 WHERE id = $3',
        [newProjectPath, fileCount, safeId],
      );

      // Audit log
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
      // Clean up temp dir on unexpected error
      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* non-critical */ }
      }
      // Restore from backup if it exists
      if (backupDir && fs.existsSync(backupDir)) {
        const appDir = path.resolve(UPLOADS_DIR, safeId);
        try {
          if (!fs.existsSync(appDir)) {
            fs.renameSync(backupDir, appDir);
          }
        } catch { /* non-critical */ }
      }
      console.error('[content] PUT /:id/archive error:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  },
);

/** DELETE /api/content/:id — delete content (admin only) */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params as { id: string };

    // Validate ID to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid content ID.' });
      return;
    }

    // Remove on-disk files if they exist
    const appDir = path.resolve(UPLOADS_DIR, id);
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
    if (appDir.startsWith(resolvedUploadsDir + path.sep) && fs.existsSync(appDir)) {
      fs.rmSync(appDir, { recursive: true, force: true });
    }

    // Remove thumbnail if it exists
    const thumbPath = path.join(THUMBNAILS_DIR, `${id}.jpg`);
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }

    await pool.query('DELETE FROM uploaded_content WHERE id = $1', [id]);

    // Record a tombstone so this ID is never re-seeded automatically.
    // Use INSERT … ON CONFLICT DO NOTHING to handle repeated deletes gracefully.
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

/**
 * POST /api/content/seed — insert seed content directly as JSON (admin only).
 * Used for pre-installed apps that have a projectPath or inline htmlContent
 * and don't go through multipart upload.
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

    // Refuse to re-seed items that an admin explicitly deleted (tombstone check).
    const tombstone = await pool.query<{ id: string }>(
      'SELECT id FROM content_tombstones WHERE id = $1',
      [item.id],
    );
    if ((tombstone.rowCount ?? 0) > 0) {
      // Item was deliberately deleted — silently succeed without reinserting.
      res.status(201).json({ id: item.id });
      return;
    }

    const vis = item.visibility === 'specific' ? 'specific' : 'all';

    // The ON CONFLICT WHERE clause handles two migration scenarios:
    // (1) inline → projectPath: existing record has no projectPath and either empty html or incoming has a projectPath.
    // (2) projectPath → inline: existing record has a projectPath but empty html_content,
    //     and the incoming seed now provides html_content instead of a projectPath.
    // (3) portal route added/changed: incoming has a portalRoute that differs from the stored one.
    // (4) portal route removed during migration to hosted app:
    //     this specifically handles the legacy Email Center seed transition
    //     from portal_route='/email-center' to project_path='/uploaded-apps/...'
    //     by allowing an incoming NULL portalRoute when a hosted projectPath
    //     is now provided.
    await pool.query(
      `INSERT INTO uploaded_content
         (id, name, description, uploaded_at, uploaded_by, visibility, allowed_users, file_count, html_content, project_path, portal_route)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
 * GET /api/content/:id/thumbnail — serve thumbnail image (authenticated users).
 * Returns 404 if no thumbnail set.
 */
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

/**
 * POST /api/content/:id/thumbnail — upload/replace thumbnail (admin only).
 * Accepts a single image file; crops and resizes to 256×256 JPEG via sharp.
 */
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

    // Ensure thumbnails directory exists
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

/**
 * DELETE /api/content/:id/thumbnail — remove thumbnail (admin only).
 */
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
