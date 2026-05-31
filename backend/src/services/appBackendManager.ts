/**
 * Manages app-bundled backends declared via portal.json.
 *
 * portal.json format (place alongside index.html inside the ZIP):
 *   {
 *     "backend": {
 *       "entry":   "server/server.js",          // relative to portal.json dir; .ts files are compiled first
 *       "prefix":  "/uploaded-apps/my-app",     // nginx location prefix for {prefix}/api/ proxy
 *       "static":  ["sounds"],                  // optional: static dirs served by nginx alias
 *       "apiRoutes": ["/api/foo", "/api/bar"],  // optional: root-level paths proxied to this backend
 *       "serveApp": "/app"                      // optional: backend serves frontend at this sub-path
 *     }
 *   }
 *
 * When "serveApp" is set, the VIP link redirect points to {prefix}/app/ (via nginx proxy to backend/{serveApp}).
 * When "apiRoutes" are set, those root-level paths (e.g. /api/email-campaigns) are also proxied to this backend.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { randomBytes } from 'crypto';
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
    /** Root-level API paths to proxy directly to this backend (e.g. ["/api/campaigns"]) */
    apiRoutes?: string[];
    /** Sub-path where backend serves the frontend (e.g. "/app") */
    serveApp?: string;
    /** Set to true to auto-provision a PostgreSQL database for this app */
    db?: boolean;
    /** Environment variables to inject when starting the backend */
    env?: Record<string, string>;
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

    // Validate entry path (allow traversal up via .. for backend/ sub-dirs)
    if (path.isAbsolute(entry)) return null;
    if (entry.includes('\0')) return null;
    const entryAbs = path.resolve(appDir, entry);

    // For .ts entries, look for the compiled .js equivalent
    let resolvedEntry = entry;
    if (!fs.existsSync(entryAbs)) {
      // Try: .ts → .js, src/ → dist/
      const jsVariant = entryAbs
        .replace(/\.ts$/, '.js')
        .replace(/[\\/]src[\\/]/, '/dist/');
      if (fs.existsSync(jsVariant)) {
        resolvedEntry = path.relative(appDir, jsVariant);
      } else {
        logger.warn(`[appBackend] portal.json entry not found: ${entry}`);
        return null;
      }
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

    // Validate apiRoutes (must start with /, no conflicts with core platform paths)
    const apiRoutes: string[] = [];
    if (Array.isArray(b['apiRoutes'])) {
      for (const r of b['apiRoutes'] as unknown[]) {
        if (typeof r !== 'string' || !r.startsWith('/')) continue;
        // Block conflicts with VibePort's own critical API routes
        const coreRoutes = ['/api/auth', '/api/content', '/api/share', '/api/tokens', '/api/queue', '/api/health'];
        if (coreRoutes.some(c => r === c || r.startsWith(c + '/'))) continue;
        apiRoutes.push(r.replace(/\/+$/, ''));
      }
    }

    // Validate serveApp (simple path like /app)
    const serveApp = typeof b['serveApp'] === 'string' ? b['serveApp'] : undefined;

    // DB auto-provisioning flag
    const db = b['db'] === true;

    // Extra env vars
    const env: Record<string, string> = {};
    if (b['env'] && typeof b['env'] === 'object') {
      for (const [k, v] of Object.entries(b['env'] as Record<string, unknown>)) {
        if (typeof v === 'string') env[k] = v;
      }
    }

    return {
      backend: {
        entry: resolvedEntry,
        prefix,
        static: staticDirs.length ? staticDirs : undefined,
        apiRoutes: apiRoutes.length ? apiRoutes : undefined,
        serveApp,
        db,
        env: Object.keys(env).length ? env : undefined,
      },
    };
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

function exec(cmd: string, opts?: cp.ExecSyncOptions): string {
  return cp.execSync(cmd, { timeout: EXEC_TIMEOUT_MS, stdio: 'pipe', ...opts }).toString();
}

/**
 * Auto-provision secrets and (optionally) a PostgreSQL database for a portal app.
 * Results are cached in the portal-data directory and re-used on subsequent starts.
 */
async function provisionPortalEnv(
  contentId: string,
  manifest: PortalManifest,
): Promise<Record<string, string>> {
  const dataDir = path.join(UPLOADS_DIR, `portal-data-${contentId}`);
  fs.mkdirSync(dataDir, { recursive: true });

  const envFile = path.join(dataDir, '.portal-env.json');
  if (fs.existsSync(envFile)) {
    try {
      return JSON.parse(fs.readFileSync(envFile, 'utf8')) as Record<string, string>;
    } catch { /* fall through to re-provision */ }
  }

  const env: Record<string, string> = {};

  // Always inject a strong per-app secret (apps may use it for JWTs, session signing, etc.)
  env['LOCAL_JWT_SECRET'] = randomBytes(32).toString('hex');

  // Inherit CORS_ORIGIN from the platform
  if (process.env.CORS_ORIGIN) env['CORS_ORIGIN'] = process.env.CORS_ORIGIN;

  // Auto-provision a PostgreSQL database when portal.json declares db: true
  if (manifest.backend.db && process.env.DATABASE_URL) {
    const platformUrl = process.env.DATABASE_URL;
    const m = platformUrl.match(/^(postgresql?:\/\/[^@]+@[^/]+)\//);
    if (m) {
      const baseUrl = m[1];
      const slug = contentId.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 50);
      const dbName = `portal_${slug}`;
      logger.info(`[appBackend] provisioning database ${dbName}`);
      try {
        exec(`sudo -u postgres psql -c "CREATE DATABASE \\"${dbName}\\";" 2>/dev/null || true`);
        exec(`sudo -u postgres psql -d "${dbName}" -c "GRANT ALL ON SCHEMA public TO current_user;" 2>/dev/null || true`);
        // Extract DB user from the platform URL and grant it full access
        const userMatch = platformUrl.match(/postgresql?:\/\/([^:]+):/);
        if (userMatch) {
          exec(`sudo -u postgres psql -d "${dbName}" -c "GRANT ALL PRIVILEGES ON DATABASE \\"${dbName}\\" TO \\"${userMatch[1]}\\";"`);
          exec(`sudo -u postgres psql -d "${dbName}" -c "GRANT ALL ON SCHEMA public TO \\"${userMatch[1]}\\";"`);
        }
      } catch (err) {
        logger.warn(`[appBackend] DB provisioning warning (may already exist)`, { error: String(err) });
      }
      env['DATABASE_URL'] = `${baseUrl}/${dbName}`;
    }
  }

  fs.writeFileSync(envFile, JSON.stringify(env, null, 2), { mode: 0o600 });
  return env;
}

/**
 * Compile a TypeScript project if needed.
 * Returns the resolved JS entry path.
 */
function compileIfNeeded(entryAbs: string, serverDir: string, env: NodeJS.ProcessEnv): string {
  const pkgPath = path.join(serverDir, 'package.json');
  const tsConfigPath = path.join(serverDir, 'tsconfig.json');

  // Already a JS file — no compilation needed
  if (!entryAbs.endsWith('.ts') && fs.existsSync(entryAbs)) return entryAbs;

  const hasTsConfig = fs.existsSync(tsConfigPath);
  if (!hasTsConfig) return entryAbs;

  let buildScript: string | null = null;
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts ?? {};
      if (scripts['build'] && (scripts['build'].includes('tsc') || scripts['build'].includes('build'))) {
        buildScript = 'build';
      }
    } catch { /* ignore */ }
  }

  logger.info(`[appBackend] Compiling TypeScript in ${serverDir}`);
  try {
    if (buildScript) {
      exec(`npm run ${buildScript}`, { cwd: serverDir, env });
    } else {
      // Fall back to direct tsc
      const tscBin = path.join(serverDir, 'node_modules', '.bin', 'tsc');
      const tscCmd = fs.existsSync(tscBin) ? tscBin : 'npx tsc';
      exec(tscCmd, { cwd: serverDir, env });
    }
    logger.info(`[appBackend] TypeScript compilation complete`);
  } catch (err) {
    logger.error(`[appBackend] TypeScript compilation failed`, { error: String(err) });
  }

  // Resolve compiled JS path (src/index.ts → dist/index.js)
  const jsEntry = entryAbs
    .replace(/\.ts$/, '.js')
    .replace(/[\\/]src[\\/]/, '/dist/');
  return fs.existsSync(jsEntry) ? jsEntry : entryAbs;
}

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

export function pm2Start(
  contentId: string,
  entryAbs: string,
  port: number,
  extraEnv: Record<string, string> = {},
): void {
  const dataDir = path.join(UPLOADS_DIR, `portal-data-${contentId}`);
  fs.mkdirSync(dataDir, { recursive: true });

  const name = `portal-${contentId}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    UPLOADS_DIR: dataDir,
    NODE_ENV: 'production',
    ...extraEnv,
  };

  // Walk up from entryAbs to find the actual project root (entry may be in dist/)
  const serverDir = findProjectRoot(path.dirname(entryAbs));
  const pkgJson = path.join(serverDir, 'package.json');

  // Install deps
  if (fs.existsSync(pkgJson)) {
    logger.info(`[appBackend] npm install in ${serverDir}`);
    exec('npm install --prefer-offline --no-audit --no-fund', { cwd: serverDir, env });
  }

  // Compile TypeScript if needed
  const resolvedEntry = compileIfNeeded(entryAbs, serverDir, env);

  // Write an ecosystem config so PM2 uses the correct cwd and env vars persist reliably
  const ecosystemPath = path.join(dataDir, 'ecosystem.config.cjs');
  const ecosystemEnv = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined),
  );
  const ecosystemContent = `module.exports = ${JSON.stringify({
    apps: [{ name, script: resolvedEntry, cwd: serverDir, env: ecosystemEnv }],
  }, null, 2)};\n`;
  fs.writeFileSync(ecosystemPath, ecosystemContent, { mode: 0o600 });

  logger.info(`[appBackend] pm2 start ${name} on port ${port} (entry: ${resolvedEntry}, cwd: ${serverDir})`);
  exec(`pm2 start "${ecosystemPath}"`, { env });
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
  const withoutUploads = projectPath.replace(/^\/uploads\/[^/]+\//, '');
  const relDir = path.dirname(withoutUploads);
  const contentDir = path.join(UPLOADS_DIR, contentId);
  return relDir === '.' ? contentDir : path.join(contentDir, relDir);
}

function proxyBlock(location: string, port: number, stripPrefix = ''): string {
  const proxyTarget = stripPrefix
    ? `http://127.0.0.1:${port}${stripPrefix}/`
    : `http://127.0.0.1:${port}/`;
  return [
    `location ${location} {`,
    `    proxy_pass         ${proxyTarget};`,
    `    proxy_http_version 1.1;`,
    `    proxy_set_header   Host              $host;`,
    `    proxy_set_header   X-Real-IP         $remote_addr;`,
    `    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;`,
    `    client_max_body_size 100m;`,
    `}`,
    '',
  ].join('\n');
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

  const seenPrefixes = new Set<string>();
  const rows = result.rows.filter(r => {
    if (seenPrefixes.has(r.backend_prefix)) return false;
    seenPrefixes.add(r.backend_prefix);
    return true;
  });

  let conf = '# Auto-generated by VibePort — do not edit manually\n';
  conf += `# Updated: ${new Date().toISOString()}\n\n`;

  for (const row of rows) {
    const prefix = row.backend_prefix.replace(/\/+$/, '');
    const port = row.backend_port;
    const safeName = row.name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    conf += `# ${safeName} (${row.id})\n`;

    // Standard API proxy at {prefix}/api/
    conf += proxyBlock(`^~ ${prefix}/api/`, port);

    let manifest: PortalManifest | null = null;
    if (row.project_path) {
      const appRoot = appRootFromProjectPath(row.id, row.project_path);
      manifest = detectPortalManifest(appRoot);
    }

    // Static dirs from portal.json
    for (const dir of manifest?.backend.static ?? []) {
      if (!row.project_path) continue;
      const appRoot = appRootFromProjectPath(row.id, row.project_path);
      const absDir = path.join(appRoot, dir);
      if (fs.existsSync(absDir)) {
        conf += `location ^~ ${prefix}/${dir}/ {\n`;
        conf += `    alias ${absDir}/;\n`;
        conf += `    add_header Cache-Control "public, max-age=86400";\n`;
        conf += `}\n\n`;
      }
    }

    // apiRoutes: root-level paths proxied to this backend (e.g. /api/email-campaigns)
    for (const route of manifest?.backend.apiRoutes ?? []) {
      const trailingSlash = route.endsWith('/') ? route : `${route}/`;
      conf += proxyBlock(`^~ ${trailingSlash}`, port, route);
    }

    // serveApp: proxy {prefix}/app/ → backend's /app/
    if (manifest?.backend.serveApp) {
      const appPath = manifest.backend.serveApp.replace(/\/+$/, '');
      conf += proxyBlock(`^~ ${prefix}${appPath}/`, port, appPath);
      // Also proxy exact match without trailing slash
      conf += proxyBlock(`= ${prefix}${appPath}`, port, appPath);
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

export async function handleUploadBackend(
  contentId: string,
  appRoot: string,
  manifest: PortalManifest,
  port: number,
): Promise<void> {
  const { entry, prefix, env: manifestEnv } = manifest.backend;
  const entryAbs = path.resolve(appRoot, entry);

  // Stop any existing backends sharing this prefix
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

  // Auto-provision secrets and database, then merge with any portal.json env overrides
  const autoEnv = await provisionPortalEnv(contentId, manifest);
  pm2Start(contentId, entryAbs, port, { ...autoEnv, ...manifestEnv ?? {} });
}
