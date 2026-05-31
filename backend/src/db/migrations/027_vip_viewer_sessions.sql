-- Per-viewer 24h sessions for VIP app links.
-- Each visit to /vip/:token generates a unique session URL.
CREATE TABLE IF NOT EXISTS vip_viewer_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id TEXT        NOT NULL,
  viewer_ip  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_vvs_content ON vip_viewer_sessions(content_id);
-- For efficient cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_vvs_expires ON vip_viewer_sessions(expires_at);
