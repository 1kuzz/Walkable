ALTER TABLE uploaded_content
  ADD COLUMN IF NOT EXISTS backend_port    INT,
  ADD COLUMN IF NOT EXISTS backend_prefix  TEXT;
