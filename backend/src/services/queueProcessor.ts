/**
 * Queue processor: auto-deploys waiting GitHub imports when storage frees up.
 * Called by the cleanup scheduler after expired content is deleted.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import AdmZip from 'adm-zip';
import { pool } from '../db/client';
import { logger } from '../utils/logger';
import { getStorageInfo } from './storageGuard';
import { detectPortalManifest, allocatePort, handleUploadBackend, regenerateNginxAppsConf } from './appBackendManager';

const UPLOADS_DIR    = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');
const EXEC_TIMEOUT   = 5 * 60 * 1000;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN ?? '';

interface QueueRow {
  id: string;
  user_login: string;
  name: string;
  description: string;
  git_url: string;
  build: boolean;
}

async function processOne(row: QueueRow): Promise<void> {
  const { id, user_login, name, description, git_url, build } = row;
  logger.info(`[queue] Processing queued item ${id} for ${user_login}: ${git_url}`);

  const m = git_url.match(/^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(\.git)?\/?$/);
  if (!m) throw new Error(`Invalid GitHub URL: ${git_url}`);
  const repoSlug = m[1];

  // Mark as processing
  await pool.query(`UPDATE upload_queue SET status = 'processing' WHERE id = $1`, [id]);

  // Fetch zipball
  const zipUrl = `https://api.github.com/repos/${repoSlug}/zipball/HEAD`;
  const userRow = await pool.query<{ tier: string }>(
    `SELECT tier FROM github_users WHERE login = $1`, [user_login],
  );
  const tier = userRow.rows[0]?.tier ?? 'free';

  const ghRes = await fetch(zipUrl, {
    headers: {
      Authorization: GITHUB_TOKEN ? `Bearer ${GITHUB_TOKEN}` : '',
      Accept: 'application/vnd.github+json',
      'User-Agent': 'VibePort/1.0',
    },
    redirect: 'follow',
  });
  if (!ghRes.ok) throw new Error(`GitHub API ${ghRes.status}: ${ghRes.statusText}`);

  const buf = Buffer.from(await ghRes.arrayBuffer());

  const contentId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const appDir    = path.join(UPLOADS_DIR, contentId);
  fs.mkdirSync(appDir, { recursive: true });

  const zip = new AdmZip(buf);
  zip.extractAllTo(appDir, true);

  // Find index.html (shallowest)
  let indexRel = '';
  let minDepth = Infinity;
  for (const entry of zip.getEntries()) {
    const rel = entry.entryName.replace(/^[^/]+\//, '');
    if (/^index\.html?$/i.test(path.basename(rel))) {
      const depth = rel.split('/').length - 1;
      if (depth < minDepth) { minDepth = depth; indexRel = rel; }
    }
  }
  if (!indexRel) throw new Error('No index.html found in repo');

  // npm build if requested
  let buildLog: string | null = null;
  if (build) {
    const pkgPath = path.join(appDir, path.dirname(indexRel), 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const out = cp.execSync('npm install --prefer-offline --no-audit && npm run build', {
          cwd: path.dirname(pkgPath),
          timeout: EXEC_TIMEOUT,
          env: { ...process.env, NODE_ENV: 'production' },
          stdio: 'pipe',
        });
        buildLog = out.toString().slice(-200_000);
        // Re-find index after build
        const buildDirs = ['dist', 'build', 'out', 'public'];
        for (const d of buildDirs) {
          const candidate = path.join(path.dirname(pkgPath), d, 'index.html');
          if (fs.existsSync(candidate)) {
            indexRel = path.relative(appDir, candidate);
            break;
          }
        }
      } catch (e) {
        buildLog = e instanceof Error ? e.message : String(e);
      }
    }
  }

  const projectPath   = `/uploads/${contentId}/${indexRel}`;
  const appRootForMan = path.join(appDir, path.dirname(indexRel) === '.' ? '' : path.dirname(indexRel));
  const manifest      = detectPortalManifest(appRootForMan);
  let backendPort: number | null = null;
  let backendPrefix: string | null = null;
  if (manifest) {
    try {
      backendPort   = await allocatePort();
      backendPrefix = manifest.backend.prefix;
      await handleUploadBackend(contentId, appRootForMan, manifest, backendPort);
    } catch (err) {
      logger.warn('[queue] Backend start failed (non-fatal)', { error: String(err) });
      backendPort = backendPrefix = null;
    }
  }

  const isPro = tier === 'pro';
  await pool.query(
    `INSERT INTO uploaded_content
       (id, name, description, uploaded_at, uploaded_by, visibility, allowed_users,
        file_count, project_path, status, git_url, build_log,
        backend_port, backend_prefix, expires_at)
     VALUES ($1,$2,$3,NOW(),$4,'specific',$4,0,$5,'approved',$6,$7,$8,$9,
             ${isPro ? 'NULL' : "NOW() + INTERVAL '24 hours'"})`,
    [contentId, name, description, user_login, projectPath, git_url, buildLog, backendPort, backendPrefix],
  );

  if (backendPort) {
    try { await regenerateNginxAppsConf(); } catch { /* non-fatal */ }
  }

  // Fetch share token
  const st = await pool.query<{ share_token: string }>(
    `SELECT share_token FROM uploaded_content WHERE id = $1`, [contentId],
  );

  await pool.query(
    `UPDATE upload_queue SET status = 'done', result_id = $2 WHERE id = $1`,
    [id, contentId],
  );

  logger.info(`[queue] Processed ${id} → ${contentId} (shareToken: ${st.rows[0]?.share_token})`);
}

/** Process up to `limit` waiting items if storage is OK. Called after cleanup. */
export async function processQueue(limit = 3): Promise<number> {
  const { status, freeMB } = getStorageInfo();
  if (status !== 'ok') {
    logger.info(`[queue] Skipping — storage ${status} (${freeMB} MB free)`);
    return 0;
  }

  const rows = await pool.query<QueueRow>(
    `SELECT id, user_login, name, description, git_url, build
     FROM upload_queue WHERE status = 'waiting'
     ORDER BY queued_at ASC LIMIT $1`,
    [limit],
  );
  if (rows.rows.length === 0) return 0;

  let processed = 0;
  for (const row of rows.rows) {
    try {
      await processOne(row);
      processed++;
    } catch (err) {
      logger.error(`[queue] Failed to process ${row.id}`, { error: String(err) });
      await pool.query(
        `UPDATE upload_queue SET status = 'failed', error = $2 WHERE id = $1`,
        [row.id, err instanceof Error ? err.message : String(err)],
      );
    }
    // Re-check storage between items
    const { status: s2 } = getStorageInfo();
    if (s2 !== 'ok') break;
  }
  if (processed > 0) logger.info(`[queue] Processed ${processed} queued item(s)`);
  return processed;
}

/** Remove done/failed/cancelled queue items older than 7 days. */
export async function pruneQueue(): Promise<void> {
  await pool.query(
    `DELETE FROM upload_queue
     WHERE status IN ('done','failed','cancelled')
       AND queued_at < NOW() - INTERVAL '7 days'`,
  );
}
