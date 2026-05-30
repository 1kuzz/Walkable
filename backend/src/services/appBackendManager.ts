/**
 * Manages app-bundled backends declared via portal.json.
 *
 * portal.json format (place alongside index.html inside the ZIP):
 *   {
 *     "backend": {
 *       "entry":  "server/server.js",          // relative to portal.json
 *       "prefix": "/uploaded-apps/my-app",     // nginx location prefix
 *       "static": ["sounds"]                   // optional: static dirs to serve
 *     }
 *   }
 *
 * The platform:
 *   - Detects portal.json after ZIP extraction
 *   - npm-installs the server's dependencies
 *   - Starts the server via PM2 on an allocated port (3100-3999)
 *   - Regenerates /etc/nginx/portal-apps.conf and reloads nginx
 *   - On delete: stops the PM2 process and regenerates conf
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { pool } from '../db/client';
import { logger } from '../utils/logger';

const NGINX_PORTAL_APPS = '/etc/nginx/portal-apps.conf';
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');
const PORT_MIN = 3100;
const PORT_MAX = 3999;
const EXEC_TIMEOUT_MS = 5 * 60 * 1000;

const RESERVED_PREFIXES = ['/api', '/auth', '/uploads', '/health', '/version', '/vip', '/apps-'];

// ── Manifest ─────────────────────────────────────────────────────────────────

export interface PortalManifest {
  backend: {
    entry: string;
    prefix: string;
    static?: string[];
  };
}

export function detectPortalManifest(appDir: string): PortalManifest | null {
  const manifestPath = path.join(appDir, 'portal.json');
  if (!fs.existsSync(manifestPath)) return null;

  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const m = JSON.parse(raw) as Record<string, unknown>;
    const b = m['backend'] as Record<string, unknown> | undefined;
    if (!b) return null;

    const entry = b['entry'];
    const prefix = b['prefix'];
    if (typeof entry !== 'string' || typeof prefix !== 'string') return null;

    // Validate entry is a safe relative path that exists
    if (path.isAbsolute(entry)) return null;
    const entryAbs = path.resolve(appDir, entry);
    if (!entryAbs.startsWith(appDir + path.sep)) return null;
    if (!fs.existsSync(entryAbs)) {
      logger.warn(`[appBackend] portal.json entry not found: ${entry}`);
      return null;
    }

    // Validate prefix
    if (!prefix.startsWith('/')) return null;
    if (!/^\/[a-zA-Z0-9/_-]+$/.test(prefix)) return null;
    if (RESERVED_PREFIXES.some(r => prefix === r || prefix.startsWith(r + '/'))) {
      logger.warn(`[appBackend] portal.json prefix conflicts with platform routes: ${prefix}`);
      return null;
    }

    // Validate static dirs
    const staticDirs: string[] = [];
    if (Array.isArray(b['static'])) {
      for (const s of b['static'] as unknown[]) {
        if (typeof s !== 'string' || path.isAbsolute(s) || s.includes('..') || s.includes('\0')) return null;
        staticDirs.push(s);
      }
    }

    return { backend: { entry, prefix, static: staticDirs.length ? staticDirs : undefined } };
  } catch {
    return null;
  }
}

// ── Port allocation ───────────────────────────────────────────────────────────

export async function allocatePort(): Promise<number> {
  const result = await pool.query<{ backend_port: number }>(
    'SELECT backend_port FROM uploaded_content WHERE backend_port IS NOT NULL',
  );
  const used = new Set(result.rows.map(r => r.backend_port));
  for (let p = PORT_MIN; p <= PORT_MAX; p++) {
    if (!used.has(p)) return p;
  }
  throw new Error('No available ports for app backend (range 3100–3999 exhausted)');
}

// ── PM2 helpers ───────────────────────────────────────────────────────────────

function exec(cmd: string, opts?: cp.ExecSyncOptions): void {
  cp.execSync(cmd, { timeout: EXEC_TIMEOUT_MS, stdio: 'pipe', ...opts });
}

export function pm2Start(contentId: string, entryAbs: string, port: number): void {
  const dataDir = path.join(UPLOADS_DIR, `portal-data-${contentId}`);
  fs.mkdirSync(dataDir, { recursive: true });

  const name = `portal-${contentId}`;
  const env = {
    ...process.env,
    PORT: String(port),
    UPLOADS_DIR: dataDir,
    NODE_ENV: 'production',
  };

  // Install deps in the server's directory first
  const serverDir = path.dirname(entryAbs);
  const pkgJson = path.join(serverDir, 'package.json');
  if (fs.existsSync(pkgJson)) {
    logger.info(`[appBackend] npm install in ${serverDir}`);
    exec('npm install --prefer-offline --no-audit --no-fund', { cwd: serverDir, env });
  }

  logger.info(`[appBackend] pm2 start ${name} on port ${port}`);
  exec(`pm2 start "${entryAbs}" --name "${name}"`, { env });
  exec('pm2 save', { timeout: 10_000 });
}

export function pm2Delete(contentId: string): void {
  try {
    exec(`pm2 delete "portal-${contentId}"`, { timeout: 10_000 });
    exec('pm2 save', { timeout: 10_000 });
    logger.info(`[appBackend] stopped portal-${contentId}`);
  } catch {
    // Process may not exist — not an error
  }
}

// ── nginx conf generation ─────────────────────────────────────────────────────

function appRootFromProjectPath(contentId: string, projectPath: string): string {
  // projectPath = /uploads/{contentId}/[subdir/]index.html
  // strip /uploads/{contentId}/ prefix, then take dirname
  const withoutUploads = projectPath.replace(/^\/uploads\/[^/]+\//, '');
  const relDir = path.dirname(withoutUploads);
  const contentDir = path.join(UPLOADS_DIR, contentId);
  return relDir === '.' ? contentDir : path.join(contentDir, relDir);
}

export async function regenerateNginxAppsConf(): Promise<void> {
  const result = await pool.query<{
    id: string;
    name: string;
    backend_port: number;
    backend_prefix: string;
    project_path: string | null;
  }>(
    `SELECT id, name, backend_port, backend_prefix, project_path
     FROM uploaded_content
     WHERE backend_port IS NOT NULL AND backend_prefix IS NOT NULL
     ORDER BY uploaded_at DESC`,
  );

  // When multiple records share the same prefix (re-uploads), keep only the latest
  const seenPrefixes = new Set<string>();
  const rows = result.rows.filter(r => {
    if (seenPrefixes.has(r.backend_prefix)) return false;
    seenPrefixes.add(r.backend_prefix);
    return true;
  });

  let conf = '# Auto-generated by Walkable Portal — do not edit manually\n';
  conf += `# Updated: ${new Date().toISOString()}\n\n`;

  for (const row of rows) {
    const prefix = row.backend_prefix.replace(/\/+$/, '');
    const port = row.backend_port;
    const safeName = row.name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();

    conf += `# ${safeName} (${row.id})\n`;
    conf += `location ^~ ${prefix}/api/ {\n`;
    conf += `    proxy_pass         http://127.0.0.1:${port}/;\n`;
    conf += `    proxy_http_version 1.1;\n`;
    conf += `    proxy_set_header   Host              $host;\n`;
    conf += `    proxy_set_header   X-Real-IP         $remote_addr;\n`;
    conf += `    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;\n`;
    conf += `    client_max_body_size 100m;\n`;
    conf += `}\n\n`;

    // Static directories declared in portal.json
    if (row.project_path) {
      const appRoot = appRootFromProjectPath(row.id, row.project_path);
      const manifest = detectPortalManifest(appRoot);
      for (const dir of manifest?.backend.static ?? []) {
        const absDir = path.join(appRoot, dir);
        if (fs.existsSync(absDir)) {
          conf += `location ^~ ${prefix}/${dir}/ {\n`;
          conf += `    alias ${absDir}/;\n`;
          conf += `    add_header Cache-Control "public, max-age=86400";\n`;
          conf += `}\n\n`;
        }
      }
    }
  }

  fs.writeFileSync(NGINX_PORTAL_APPS, conf, 'utf8');
  logger.info(`[appBackend] wrote ${NGINX_PORTAL_APPS} (${rows.length} app(s))`);

  try {
    exec('nginx -t && systemctl reload nginx', { timeout: 15_000 });
    logger.info('[appBackend] nginx reloaded');
  } catch (err) {
    logger.error('[appBackend] nginx reload failed after conf update', { error: String(err) });
    throw new Error('nginx reload failed — check portal-apps.conf syntax');
  }
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/**
 * Called after a successful upload to start a bundled backend if portal.json exists.
 * Stops any existing backend sharing the same prefix before starting the new one.
 * Never throws — backend failures are logged but don't fail the upload.
 */
export async function handleUploadBackend(
  contentId: string,
  appRoot: string,
  manifest: PortalManifest,
  port: number,
): Promise<void> {
  const { entry, prefix } = manifest.backend;
  const entryAbs = path.resolve(appRoot, entry);

  // Stop any existing backends that share this prefix (re-upload scenario)
  try {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM uploaded_content WHERE backend_prefix = $1 AND id != $2`,
      [prefix, contentId],
    );
    for (const r of existing.rows) {
      pm2Delete(r.id);
      await pool.query(
        `UPDATE uploaded_content SET backend_port = NULL, backend_prefix = NULL WHERE id = $1`,
        [r.id],
      );
      logger.info(`[appBackend] evicted old backend for ${r.id} (prefix conflict: ${prefix})`);
    }
  } catch (err) {
    logger.warn('[appBackend] failed to evict old backend', { error: String(err) });
  }

  pm2Start(contentId, entryAbs, port);
}
