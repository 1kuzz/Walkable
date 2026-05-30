-- API tokens for programmatic deployment (CLI, Claude, etc.)
CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT PRIMARY KEY,
  user_login   TEXT NOT NULL REFERENCES github_users(login) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS api_tokens_user_idx  ON api_tokens(user_login);
CREATE INDEX IF NOT EXISTS api_tokens_hash_idx  ON api_tokens(token_hash);
