-- Migration 014: public project showcase tables

CREATE TABLE IF NOT EXISTS projects (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  github_url       TEXT        NOT NULL UNIQUE,
  name             TEXT        NOT NULL,
  description      TEXT        NOT NULL DEFAULT '',
  language         TEXT,
  stars            INTEGER     NOT NULL DEFAULT 0,
  owner_login      TEXT,
  owner_avatar_url TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved         BOOLEAN     NOT NULL DEFAULT FALSE,
  github_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_projects_approved    ON projects (approved);
CREATE INDEX IF NOT EXISTS idx_projects_submitted   ON projects (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_stars       ON projects (stars DESC);

CREATE TABLE IF NOT EXISTS project_stats (
  project_id     TEXT        PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  views          INTEGER     NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
);
