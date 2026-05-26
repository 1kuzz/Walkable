ALTER TABLE uploaded_content
  ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid();

UPDATE uploaded_content SET share_token = gen_random_uuid() WHERE share_token IS NULL;

ALTER TABLE uploaded_content ALTER COLUMN share_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uploaded_content_share_token_idx
  ON uploaded_content (share_token);
