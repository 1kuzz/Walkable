-- Migration 012: content tombstones (prevent seed re-creation after manual delete)
--               and persistent user quick buttons

-- Tombstones: record IDs of uploaded_content items that were explicitly deleted
-- by an admin. The seed endpoint checks this table to avoid re-seeding deleted items.
CREATE TABLE IF NOT EXISTS content_tombstones (
  id           TEXT        PRIMARY KEY,
  deleted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by   TEXT        NOT NULL DEFAULT ''
);

-- Persistent per-user quick buttons (replaces mops_hotbuttons_* localStorage keys).
-- slot_index is 0-based (0, 1, 2 for the default 3-button layout).
CREATE TABLE IF NOT EXISTS user_quick_buttons (
  user_login        TEXT        NOT NULL,
  slot_index        INTEGER     NOT NULL,
  app_id            TEXT,
  app_name          TEXT,
  app_project_path  TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_login, slot_index),
  CONSTRAINT slot_index_nonneg CHECK (slot_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_user_quick_buttons_user ON user_quick_buttons (user_login);
