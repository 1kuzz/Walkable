-- Migration 006: composite index for event_type + timestamp filtering on audit_log

CREATE INDEX IF NOT EXISTS idx_audit_log_type_ts
  ON audit_log (event_type, timestamp DESC);
