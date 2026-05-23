-- User groups for access control management
-- Groups are UI-only templates: selecting a group expands its members into allowed_users.
-- The backend access-check layer is unchanged and always works against individual logins.

CREATE TABLE IF NOT EXISTS user_groups (
  id         SERIAL      PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  members    TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
