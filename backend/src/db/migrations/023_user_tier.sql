-- Add user tier (free/pro) to github_users
ALTER TABLE github_users ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free';
