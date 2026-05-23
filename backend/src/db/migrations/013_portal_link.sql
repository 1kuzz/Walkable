-- Migration 013: add portal_route column to uploaded_content
-- Allows a gallery entry to link directly to an internal portal page
-- (e.g. /email-center) rather than serving an uploaded HTML file or ZIP project.

ALTER TABLE uploaded_content ADD COLUMN IF NOT EXISTS portal_route TEXT;
