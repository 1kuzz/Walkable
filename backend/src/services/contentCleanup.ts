import * as fs from 'fs';
import * as path from 'path';
import { pool } from '../db/client';
import { logger } from '../utils/logger';
import { pm2Delete, regenerateNginxAppsConf } from './appBackendManager';

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

export async function deleteExpiredContent(): Promise<void> {
  const result = await pool.query<{ id: string; backend_port: number | null }>(
    `DELETE FROM uploaded_content
     WHERE expires_at IS NOT NULL AND expires_at < NOW()
     RETURNING id, backend_port`,
  );

  if (result.rows.length === 0) return;

  logger.info(`[cleanup] deleting ${result.rows.length} expired upload(s)`);

  let nginxNeedsRegen = false;
  const resolvedUploads = path.resolve(UPLOADS_DIR);

  for (const row of result.rows) {
    const appDir = path.resolve(UPLOADS_DIR, row.id);
    if (appDir.startsWith(resolvedUploads + path.sep) && fs.existsSync(appDir)) {
      fs.rmSync(appDir, { recursive: true, force: true });
    }

    const dataDir = path.join(UPLOADS_DIR, `portal-data-${row.id}`);
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });

    const thumbPath = path.join(THUMBNAILS_DIR, `${row.id}.jpg`);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

    if (row.backend_port !== null) {
      pm2Delete(row.id);
      nginxNeedsRegen = true;
    }

    try {
      await pool.query(
        `INSERT INTO content_tombstones (id, deleted_at, deleted_by)
         VALUES ($1, NOW(), 'system:expiry')
         ON CONFLICT (id) DO NOTHING`,
        [row.id],
      );
    } catch { /* non-critical */ }

    logger.info(`[cleanup] expired: ${row.id}`);
  }

  if (nginxNeedsRegen) {
    try { await regenerateNginxAppsConf(); } catch (err) {
      logger.error('[cleanup] nginx regen failed after expiry', { error: String(err) });
    }
  }
}

export function startCleanupScheduler(): void {
  deleteExpiredContent().catch(err =>
    logger.error('[cleanup] startup check failed', { error: String(err) }),
  );

  setInterval(() => {
    deleteExpiredContent().catch(err =>
      logger.error('[cleanup] scheduled check failed', { error: String(err) }),
    );
  }, 60 * 60 * 1000);
}
