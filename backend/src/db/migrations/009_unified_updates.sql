-- ── update_tags ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS update_tags (
  id         TEXT        PRIMARY KEY,
  label      TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT 'teal',
  created_by TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── unified updates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS updates (
  id           TEXT        PRIMARY KEY,
  title        TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  date         TEXT        NOT NULL,
  type         TEXT        NOT NULL DEFAULT 'news',  -- 'portal' | 'app' | 'news'
  app_name     TEXT,
  version      TEXT,
  tag_id       TEXT        REFERENCES update_tags(id) ON DELETE SET NULL,
  published_by TEXT        NOT NULL DEFAULT '',
  is_pinned    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS updates_date_idx ON updates (date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS updates_type_idx ON updates (type);
CREATE INDEX IF NOT EXISTS updates_tag_idx  ON updates (tag_id);

-- ── update_reads ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS update_reads (
  user_login TEXT NOT NULL,
  update_id  TEXT NOT NULL REFERENCES updates(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_login, update_id)
);

-- ── Migrate version_entries → updates ────────────────────────────────────
INSERT INTO updates (id, title, description, date, type, app_name, version, published_by, created_at)
SELECT
  ve.id,
  CASE ve.type
    WHEN 'portal' THEN 'Portal v' || ve.version || ' released'
    ELSE COALESCE(ve.app_name, 'App') || ' — v' || ve.version
  END,
  ve.changes,
  ve.date,
  ve.type,
  ve.app_name,
  ve.version,
  ve.published_by,
  NOW()
FROM version_entries ve
ON CONFLICT (id) DO NOTHING;

-- ── Migrate news_updates → updates ───────────────────────────────────────
INSERT INTO updates (id, title, description, date, type, published_by, created_at)
SELECT
  nu.id,
  nu.title,
  nu.description,
  nu.date,
  'news',
  nu.created_by,
  nu.created_at
FROM news_updates nu
ON CONFLICT (id) DO NOTHING;
