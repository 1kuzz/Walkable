/**
 * One-time localStorage → backend migration endpoint.
 * Accepts a JSON dump of all mops_* localStorage keys and imports the data.
 * This endpoint does NOT require authentication so it can be called before
 * the user has a valid session (e.g. on first load after upgrading from
 * the pure-frontend version to the backend-enabled version).
 *
 * It is idempotent: running it multiple times is safe (ON CONFLICT DO NOTHING).
 * After a successful import, the client should remove the migrated keys from
 * localStorage to avoid double-counting.
 */

import { Router } from 'express';
import { pool } from '../db/client';

const router = Router();

interface LocalStorageDump {
  mops_usage_tracking?: unknown[];
  mops_audit_log?: unknown[];
  mops_version_history?: unknown[];
  mops_uploaded_content?: unknown[];
  mops_promoted_apps?: number[];
  mops_setup_complete?: boolean;
  mops_admin_password_hash?: string;
  mops_managed_admin_users?: string[];
  mops_registered_users?: unknown[];
}

/** POST /api/migrate — import localStorage data into the database. */
router.post('/', async (req, res) => {
  try {
    const dump = req.body as LocalStorageDump;

    // --- Usage events ---
    if (Array.isArray(dump.mops_usage_tracking)) {
      for (const evt of dump.mops_usage_tracking as Array<Record<string, unknown>>) {
        await pool.query(
          `INSERT INTO usage_events (id, type, user_login, target, timestamp, session_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [
            evt.id ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            evt.type ?? 'unknown',
            evt.userLogin ?? 'unknown',
            evt.target ?? '',
            evt.timestamp ?? new Date().toISOString(),
            evt.sessionId ?? null,
            evt.metadata ?? null,
          ],
        );
      }
    }

    // --- Audit log ---
    if (Array.isArray(dump.mops_audit_log)) {
      for (const evt of dump.mops_audit_log as Array<Record<string, unknown>>) {
        await pool.query(
          `INSERT INTO audit_log (id, timestamp, event_type, "user", detail)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [
            evt.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            evt.timestamp ?? new Date().toISOString(),
            evt.eventType ?? 'unknown',
            evt.user ?? 'unknown',
            evt.detail ?? '',
          ],
        );
      }
    }

    // --- Version history ---
    if (Array.isArray(dump.mops_version_history)) {
      for (const entry of dump.mops_version_history as Array<Record<string, unknown>>) {
        await pool.query(
          `INSERT INTO version_entries (id, type, app_id, app_name, version, changes, date, published_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            entry.id ?? `ver_${Date.now()}`,
            entry.type ?? 'portal',
            entry.appId ?? null,
            entry.appName ?? null,
            entry.version ?? '1.0.0',
            entry.changes ?? '',
            entry.date ?? new Date().toISOString().slice(0, 10),
            entry.publishedBy ?? 'admin',
          ],
        );
      }
    }

    // --- Uploaded content ---
    if (Array.isArray(dump.mops_uploaded_content)) {
      for (const item of dump.mops_uploaded_content as Array<Record<string, unknown>>) {
        await pool.query(
          `INSERT INTO uploaded_content
             (id, name, description, uploaded_at, uploaded_by, visibility, allowed_users, file_count, html_content, project_path)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            item.id ?? `upload_${Date.now()}`,
            item.name ?? 'Untitled',
            item.description ?? '',
            item.uploadedAt ?? new Date().toISOString(),
            item.uploadedBy ?? 'admin',
            item.visibility === 'specific' ? 'specific' : 'all',
            item.allowedUsers ?? '',
            item.fileCount ?? 1,
            item.htmlContent ?? '',
            item.projectPath ?? null,
          ],
        );
      }
    }

    // --- Promoted apps ---
    if (Array.isArray(dump.mops_promoted_apps)) {
      for (const id of dump.mops_promoted_apps) {
        if (typeof id === 'number') {
          await pool.query(
            'INSERT INTO promoted_apps (app_id) VALUES ($1) ON CONFLICT DO NOTHING',
            [id],
          );
        }
      }
    }

    // --- Setup config ---
    const upsert = `INSERT INTO setup_config (key, value) VALUES ($1, $2)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;

    if (dump.mops_setup_complete !== undefined) {
      await pool.query(upsert, ['setup_complete', String(dump.mops_setup_complete)]);
    }
    if (dump.mops_admin_password_hash) {
      await pool.query(upsert, ['admin_password_hash', dump.mops_admin_password_hash]);
    }
    if (Array.isArray(dump.mops_managed_admin_users)) {
      await pool.query(upsert, ['managed_admin_users', JSON.stringify(dump.mops_managed_admin_users)]);
    }

    // --- Registered users ---
    if (Array.isArray(dump.mops_registered_users)) {
      for (const u of dump.mops_registered_users as Array<Record<string, unknown>>) {
        await pool.query(
          `INSERT INTO registered_users (email, display_name, registered_at, certificate_fingerprint)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO NOTHING`,
          [
            String(u.email ?? '').toLowerCase(),
            u.displayName ?? '',
            u.registeredAt ?? new Date().toISOString(),
            u.certificateFingerprint ?? '',
          ],
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[migrate] POST / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
