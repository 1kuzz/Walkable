import { Pool } from 'pg';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';

/** PostgreSQL connection pool — shared across all routes. */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error('[DB] Unexpected pool error', { message: err.message });
});

/**
 * Run all SQL migrations in order, skipping those already recorded in the
 * `schema_migrations` tracking table.  Each migration is executed inside its
 * own transaction so a failure leaves the database in a clean state.
 *
 * Safe to call on every startup — idempotent by design.
 */
export async function runMigrations(): Promise<void> {
  // Bootstrap the tracking table before reading it.  This DDL is itself
  // idempotent (IF NOT EXISTS) so it is safe to run unconditionally.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  // Fetch already-applied migrations in a single query.
  const { rows } = await pool.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations',
  );
  const applied = new Set(rows.map((r) => r.filename));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      logger.debug('[DB] Skipping already-applied migration', { file });
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    logger.info('[DB] Applying migration', { file });

    // Wrap each migration in a transaction for atomicity.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [file],
      );
      await client.query('COMMIT');
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('[DB] Migration failed — rolled back', {
        file,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      client.release();
    }
  }

  if (ran === 0) {
    logger.info('[DB] All migrations already applied — nothing to do.');
  } else {
    logger.info('[DB] Migrations complete.', { applied: ran });
  }
}
