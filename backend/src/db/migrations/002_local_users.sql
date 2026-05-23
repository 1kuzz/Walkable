-- Local service accounts for manual login (not tied to AD/ADFS).
-- Only users explicitly added here can use the manual login form.
CREATE TABLE IF NOT EXISTS local_users (
  login        TEXT        PRIMARY KEY,
  password_hash TEXT       NOT NULL,
  display_name TEXT        NOT NULL DEFAULT '',
  is_admin     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
