-- ============================================================
-- Migration 002: Vendor Order Guide Uploads
-- ============================================================

-- Storage bucket for order guide files
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-guides', 'order-guides', false)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------
-- vendor_uploads
-- One row per vendor per week (upserted on re-upload)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_uploads (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start  date        NOT NULL,
  file_name   text        NOT NULL,
  file_path   text        NOT NULL,   -- path in Supabase Storage
  row_count   integer     NOT NULL DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, week_start)
);

-- -------------------------------------------------------
-- vendor_upload_rows
-- Parsed line items from each uploaded file
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_upload_rows (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id          uuid         NOT NULL REFERENCES vendor_uploads(id) ON DELETE CASCADE,
  vendor_item_number text,
  item_name          text,
  price              numeric(10,2) NOT NULL,
  internal_item_id   uuid         REFERENCES items(id) ON DELETE SET NULL,
  sort_order         integer      NOT NULL DEFAULT 0
);

-- -------------------------------------------------------
-- vendor_item_mappings
-- Persistent map: (vendor, their item #) → internal item
-- Persists across weeks so vendor items auto-match on future uploads
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_item_mappings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_item_number text      NOT NULL,
  internal_item_id uuid        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, vendor_item_number)
);

-- -------------------------------------------------------
-- RLS: vendor_uploads
-- Vendors see/write only their own; admin uses service role (bypasses RLS)
-- -------------------------------------------------------
ALTER TABLE vendor_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_uploads_select_own" ON vendor_uploads
  FOR SELECT TO authenticated
  USING (vendor_id = auth.uid());

CREATE POLICY "vendor_uploads_insert_own" ON vendor_uploads
  FOR INSERT TO authenticated
  WITH CHECK (vendor_id = auth.uid());

CREATE POLICY "vendor_uploads_update_own" ON vendor_uploads
  FOR UPDATE TO authenticated
  USING (vendor_id = auth.uid());

CREATE POLICY "vendor_uploads_delete_own" ON vendor_uploads
  FOR DELETE TO authenticated
  USING (vendor_id = auth.uid());

-- -------------------------------------------------------
-- RLS: vendor_upload_rows
-- -------------------------------------------------------
ALTER TABLE vendor_upload_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_upload_rows_select_own" ON vendor_upload_rows
  FOR SELECT TO authenticated
  USING (
    upload_id IN (
      SELECT id FROM vendor_uploads WHERE vendor_id = auth.uid()
    )
  );

-- -------------------------------------------------------
-- RLS: vendor_item_mappings
-- All authenticated users can read; writes via service role only
-- -------------------------------------------------------
ALTER TABLE vendor_item_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_item_mappings_select_all" ON vendor_item_mappings
  FOR SELECT TO authenticated USING (true);

-- -------------------------------------------------------
-- Storage RLS: order-guides bucket
-- -------------------------------------------------------
CREATE POLICY "order_guides_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'order-guides'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "order_guides_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'order-guides'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
