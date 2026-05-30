-- View: per-user upload count in the last 24 hours (used for free-tier limit)
CREATE OR REPLACE VIEW daily_upload_counts AS
SELECT uploaded_by, COUNT(*)::int AS count
FROM uploaded_content
WHERE uploaded_at > NOW() - INTERVAL '24 hours'
GROUP BY uploaded_by;
