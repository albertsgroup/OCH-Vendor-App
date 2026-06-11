-- ============================================================
-- Migration 003: AI parsing + matching fields
-- ============================================================

-- Add AI-related columns to vendor_upload_rows
ALTER TABLE vendor_upload_rows
  ADD COLUMN IF NOT EXISTS ai_confidence       float,        -- 0.0–1.0
  ADD COLUMN IF NOT EXISTS ai_suggested_item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS needs_admin_review  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_match_reason     text,         -- human-readable explanation
  ADD COLUMN IF NOT EXISTS review_resolved     boolean NOT NULL DEFAULT false; -- admin confirmed/dismissed

-- Index to quickly find unresolved review items
CREATE INDEX IF NOT EXISTS idx_upload_rows_needs_review
  ON vendor_upload_rows (needs_admin_review, review_resolved)
  WHERE needs_admin_review = true AND review_resolved = false;

-- Ensure items.item_number can hold OCH-format numbers
-- (already text, no schema change needed — just a convention note)
