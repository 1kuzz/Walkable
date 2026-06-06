-- Auto-deploy support: slug-based clean URLs + GitHub webhook secrets

ALTER TABLE uploaded_content
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS deploy_hook_secret TEXT,
  ADD COLUMN IF NOT EXISTS build BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_uc_slug
  ON uploaded_content(slug) WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_uc_deploy_hook_secret
  ON uploaded_content(deploy_hook_secret) WHERE deploy_hook_secret IS NOT NULL;
