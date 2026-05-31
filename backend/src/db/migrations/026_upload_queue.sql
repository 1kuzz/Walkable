-- Upload queue: stores pending GitHub imports for free-tier users when storage is tight.
-- ZIP uploads are rejected immediately; only GitHub URL imports can be queued.
CREATE TABLE IF NOT EXISTS upload_queue (
  id          TEXT PRIMARY KEY,
  user_login  TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  git_url     TEXT NOT NULL,
  build       BOOLEAN NOT NULL DEFAULT FALSE,
  queued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL DEFAULT 'waiting',
  -- waiting | processing | done | failed | cancelled
  result_id   TEXT,   -- uploaded_content.id once processed
  error       TEXT
);

CREATE INDEX IF NOT EXISTS upload_queue_user_idx     ON upload_queue(user_login);
CREATE INDEX IF NOT EXISTS upload_queue_status_idx   ON upload_queue(status, queued_at);
