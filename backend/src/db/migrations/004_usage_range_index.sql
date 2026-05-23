-- Migration 004: composite index for date-range queries on usage_events

CREATE INDEX IF NOT EXISTS idx_usage_events_ts_type
  ON usage_events (timestamp DESC, type);
