-- ============================================================
-- OCH Vendor Pricing App — Database Schema
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor)
-- ============================================================

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'vendor')),
  vendor_name TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Items table (managed by admin only)
CREATE TABLE IF NOT EXISTS public.items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_number TEXT NOT NULL UNIQUE,
  item_name   TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Price submissions table
CREATE TABLE IF NOT EXISTS public.price_submissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  price      NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  week_start DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, item_id, week_start)
);

-- ============================================================
-- Auto-create profile row when a user signs up
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, vendor_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_app_meta_data->>'role', 'vendor'),
    NEW.raw_app_meta_data->>'vendor_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Helper: check if current user is admin (SECURITY DEFINER
-- bypasses RLS so there's no recursive policy loop)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_submissions ENABLE ROW LEVEL SECURITY;

-- ---- profiles ----
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- ---- items ----
CREATE POLICY "items_select_authenticated"
  ON public.items FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_admin());

CREATE POLICY "items_insert_admin"
  ON public.items FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "items_update_admin"
  ON public.items FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "items_delete_admin"
  ON public.items FOR DELETE
  USING (public.is_admin());

-- ---- price_submissions ----
CREATE POLICY "submissions_select_own"
  ON public.price_submissions FOR SELECT
  USING (vendor_id = auth.uid());

CREATE POLICY "submissions_insert_own"
  ON public.price_submissions FOR INSERT
  WITH CHECK (
    vendor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'vendor' AND is_active = true
    )
  );

CREATE POLICY "submissions_update_own"
  ON public.price_submissions FOR UPDATE
  USING (
    vendor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'vendor' AND is_active = true
    )
  );

CREATE POLICY "submissions_select_admin"
  ON public.price_submissions FOR SELECT
  USING (public.is_admin());

-- ============================================================
-- SETUP INSTRUCTIONS
-- ============================================================
-- After running this SQL:
--
-- 1. Create your admin account:
--    Go to Supabase Dashboard -> Authentication -> Users -> Add User
--    Enter admin email/password, then run:
--
--    UPDATE auth.users
--    SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin","vendor_name":null}'
--    WHERE email = 'your-admin@email.com';
--
--    Then refresh the profile:
--    INSERT INTO public.profiles (id, role, vendor_name)
--    SELECT id, 'admin', null FROM auth.users WHERE email = 'your-admin@email.com'
--    ON CONFLICT (id) DO UPDATE SET role = 'admin';
--
-- 2. Vendor accounts are created through the app's admin interface.
-- ============================================================
