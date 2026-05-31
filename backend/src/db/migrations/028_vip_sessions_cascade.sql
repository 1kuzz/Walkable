-- Remove any orphaned viewer sessions that reference already-deleted content.
DELETE FROM vip_viewer_sessions
WHERE content_id NOT IN (SELECT id FROM uploaded_content);

-- Add FK so future content deletions cascade automatically.
ALTER TABLE vip_viewer_sessions
  ADD CONSTRAINT fk_vvs_content
  FOREIGN KEY (content_id) REFERENCES uploaded_content(id) ON DELETE CASCADE;
