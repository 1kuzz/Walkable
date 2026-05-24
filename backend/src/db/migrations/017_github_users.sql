CREATE TABLE IF NOT EXISTS github_users (
  login        TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url   TEXT,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
