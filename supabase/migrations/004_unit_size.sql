-- ============================================================
-- Migration 004: Add unit_size to vendor_upload_rows
-- ============================================================

ALTER TABLE vendor_upload_rows
  ADD COLUMN IF NOT EXISTS unit_size text;  -- e.g. "1lb", "12/case", "500mL"
