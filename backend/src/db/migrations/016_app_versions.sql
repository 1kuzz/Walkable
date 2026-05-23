-- Track version snapshots for uploaded_content items.
-- Each time an app's archive is replaced, the old content is snapshotted here
-- so users can compare versions side-by-side.
CREATE TABLE IF NOT EXISTS app_versions (
  id          SERIAL PRIMARY KEY,
  content_id  TEXT NOT NULL,
  version_num INTEGER NOT NULL,
  label       TEXT,
  html_content TEXT NOT NULL DEFAULT '',
  project_path TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_versions_content_version_idx
  ON app_versions(content_id, version_num);
