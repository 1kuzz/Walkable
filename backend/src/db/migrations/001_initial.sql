-- PrivatePortal backend: initial schema migration
-- Run once against a fresh PostgreSQL database.

-- Usage events (replaces mops_usage_tracking in localStorage)
CREATE TABLE IF NOT EXISTS usage_events (
  id          TEXT        PRIMARY KEY,
  type        TEXT        NOT NULL,
  user_login  TEXT        NOT NULL,
  target      TEXT        NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id  TEXT,
  metadata    TEXT
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user  ON usage_events (user_login);
CREATE INDEX IF NOT EXISTS idx_usage_events_type  ON usage_events (type);
CREATE INDEX IF NOT EXISTS idx_usage_events_ts    ON usage_events (timestamp DESC);

-- Audit log (replaces mops_audit_log)
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT        PRIMARY KEY,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type  TEXT        NOT NULL,
  "user"      TEXT        NOT NULL,
  detail      TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_ts   ON audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log ("user");

-- Version history (replaces mops_version_history)
CREATE TABLE IF NOT EXISTS version_entries (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL CHECK (type IN ('portal', 'app')),
  app_id       TEXT,
  app_name     TEXT,
  version      TEXT NOT NULL,
  changes      TEXT NOT NULL,
  date         TEXT NOT NULL,
  published_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_version_entries_date ON version_entries (date DESC);

-- Key/value configuration store (replaces several mops_* keys)
-- Keys: setup_complete, admin_password_hash, managed_admin_users,
--       last_known_portal_version_<login>
CREATE TABLE IF NOT EXISTS setup_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Uploaded content (replaces mops_uploaded_content)
CREATE TABLE IF NOT EXISTS uploaded_content (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by  TEXT        NOT NULL,
  visibility   TEXT        NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'specific')),
  allowed_users TEXT       NOT NULL DEFAULT '',
  file_count   INTEGER     NOT NULL DEFAULT 1,
  html_content TEXT        NOT NULL DEFAULT '',
  project_path TEXT
);

-- Promoted app IDs (replaces mops_promoted_apps)
CREATE TABLE IF NOT EXISTS promoted_apps (
  app_id INTEGER PRIMARY KEY
);

-- Registered users (replaces mops_registered_users)
CREATE TABLE IF NOT EXISTS registered_users (
  email                   TEXT PRIMARY KEY,
  display_name            TEXT NOT NULL DEFAULT '',
  registered_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  certificate_fingerprint TEXT NOT NULL DEFAULT ''
);
