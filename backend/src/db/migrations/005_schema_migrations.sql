-- Migration 005: schema migration tracking table.
-- Records which SQL migration files have been applied so that the server
-- can skip already-applied migrations on startup instead of re-running them.
--
-- NOTE: This table is also created inline by db/client.ts BEFORE running
-- other migrations, so this file is safe to include in the tracked sequence.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
