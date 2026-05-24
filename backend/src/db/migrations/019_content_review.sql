-- Add review workflow columns to uploaded_content.
-- Existing rows are backfilled to 'approved' (they were already live).
-- New user uploads start as 'draft'.

ALTER TABLE uploaded_content
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS review_note  TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS git_url      TEXT,
  ADD COLUMN IF NOT EXISTS build_log    TEXT;

UPDATE uploaded_content
  SET status = 'approved'
  WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_uc_status      ON uploaded_content (status);
CREATE INDEX IF NOT EXISTS idx_uc_uploaded_by ON uploaded_content (uploaded_by);
