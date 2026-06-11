-- ============================================================
-- OCH Vendor App — Full Schema Setup (safe to re-run)
-- Paste this entire script into Supabase SQL Editor and run it.
-- ============================================================

-- ── 001: Core schema ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('admin', 'vendor')),
  vendor_name text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_select_own') THEN
    CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated USING (id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_number text        NOT NULL UNIQUE,
  item_name   text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'items' AND policyname = 'items_select_all') THEN
    CREATE POLICY "items_select_all" ON items FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ── 002: Upload tables ────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('order-guides', 'order-guides', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS vendor_uploads (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start  date        NOT NULL,
  file_name   text        NOT NULL,
  file_path   text        NOT NULL,
  row_count   integer     NOT NULL DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, week_start)
);

ALTER TABLE vendor_uploads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendor_uploads' AND policyname = 'vendor_uploads_select_own') THEN
    CREATE POLICY "vendor_uploads_select_own" ON vendor_uploads FOR SELECT TO authenticated USING (vendor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendor_uploads' AND policyname = 'vendor_uploads_insert_own') THEN
    CREATE POLICY "vendor_uploads_insert_own" ON vendor_uploads FOR INSERT TO authenticated WITH CHECK (vendor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendor_uploads' AND policyname = 'vendor_uploads_update_own') THEN
    CREATE POLICY "vendor_uploads_update_own" ON vendor_uploads FOR UPDATE TO authenticated USING (vendor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendor_uploads' AND policyname = 'vendor_uploads_delete_own') THEN
    CREATE POLICY "vendor_uploads_delete_own" ON vendor_uploads FOR DELETE TO authenticated USING (vendor_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_upload_rows (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id            uuid          NOT NULL REFERENCES vendor_uploads(id) ON DELETE CASCADE,
  vendor_item_number   text,
  item_name            text,
  unit_size            text,
  price                numeric(10,2) NOT NULL,
  internal_item_id     uuid          REFERENCES items(id) ON DELETE SET NULL,
  ai_suggested_item_id uuid          REFERENCES items(id) ON DELETE SET NULL,
  ai_confidence        float,
  needs_admin_review   boolean       NOT NULL DEFAULT false,
  ai_match_reason      text,
  review_resolved      boolean       NOT NULL DEFAULT false,
  sort_order           integer       NOT NULL DEFAULT 0
);

ALTER TABLE vendor_upload_rows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendor_upload_rows' AND policyname = 'vendor_upload_rows_select_own') THEN
    CREATE POLICY "vendor_upload_rows_select_own" ON vendor_upload_rows
      FOR SELECT TO authenticated
      USING (upload_id IN (SELECT id FROM vendor_uploads WHERE vendor_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_upload_rows_needs_review
  ON vendor_upload_rows (needs_admin_review, review_resolved)
  WHERE needs_admin_review = true AND review_resolved = false;

CREATE TABLE IF NOT EXISTS vendor_item_mappings (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id          uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_item_number text        NOT NULL,
  internal_item_id   uuid        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, vendor_item_number)
);

ALTER TABLE vendor_item_mappings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendor_item_mappings' AND policyname = 'vendor_item_mappings_select_all') THEN
    CREATE POLICY "vendor_item_mappings_select_all" ON vendor_item_mappings FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Storage policies (safe to skip if they already exist)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'order_guides_insert') THEN
    CREATE POLICY "order_guides_insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'order-guides' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'order_guides_select_own') THEN
    CREATE POLICY "order_guides_select_own" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'order-guides' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- ── 003 & 004: Add missing columns to existing tables ─────────

ALTER TABLE vendor_upload_rows
  ADD COLUMN IF NOT EXISTS unit_size            text,
  ADD COLUMN IF NOT EXISTS ai_confidence        float,
  ADD COLUMN IF NOT EXISTS ai_suggested_item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS needs_admin_review   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_match_reason      text,
  ADD COLUMN IF NOT EXISTS review_resolved      boolean NOT NULL DEFAULT false;

-- Done!
SELECT 'OCH schema ready ✓' AS status;
