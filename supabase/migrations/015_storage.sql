-- ═══════════════════════════════════════════════════════════════════
-- 015 — SUPABASE STORAGE BUCKETS & POLICIES
-- Two buckets: proof-of-delivery (private) and dispute-evidence (private).
-- File access gated by RLS policies on the storage.objects table.
-- Supabase Storage CLI commands documented for bucket creation.
-- ═══════════════════════════════════════════════════════════════════

-- ─── IMPORTANT: Bucket creation ────────────────────────────────────
-- Buckets cannot be created via SQL migrations.
-- Run these commands via Supabase CLI or Dashboard before this migration.
--
-- Option A — Supabase CLI:
--   supabase storage create proof-of-delivery --public=false
--   supabase storage create dispute-evidence  --public=false
--
-- Option B — Supabase Dashboard:
--   Storage → New Bucket → Name: proof-of-delivery, Private
--   Storage → New Bucket → Name: dispute-evidence,  Private
--
-- Option C — Management API (in CI/CD):
--   POST /storage/v1/bucket
--   { "id": "proof-of-delivery", "name": "proof-of-delivery", "public": false }
--
-- The SQL below sets storage object policies assuming the buckets exist.

-- ─── BUCKET SPECS ──────────────────────────────────────────────────
-- proof-of-delivery
--   Max size:    5MB per file
--   MIME types:  image/jpeg, image/png, image/webp
--   Path format: {shipment_id}/{timestamp}_{filename}
--   Access:      Owner + admin read; courier write via backend service role
--
-- dispute-evidence
--   Max size:    10MB per file
--   MIME types:  image/jpeg, image/png, image/webp, application/pdf
--   Path format: {dispute_id}/{timestamp}_{filename}
--   Access:      Owner + admin read; owner upload via backend service role

-- ─── Storage object policies ───────────────────────────────────────

-- PROOF-OF-DELIVERY: owner read
-- Users can read their own proof-of-delivery images.
-- Path convention: {shipment_id}/... where shipment_id is the folder name.
CREATE POLICY "pod: owner can read own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'proof-of-delivery'
    AND EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id::TEXT = (storage.foldername(name))[1]
        AND s.user_id = auth.uid()
    )
  );

-- PROOF-OF-DELIVERY: admin read all
CREATE POLICY "pod: admin can read all"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'proof-of-delivery'
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );

-- PROOF-OF-DELIVERY: backend uploads via service role (no client policy needed)
-- The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses all policies.
-- Only admins/couriers trigger uploads through the backend API.

-- DISPUTE-EVIDENCE: owner read
CREATE POLICY "dispute-evidence: owner can read own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'dispute-evidence'
    AND EXISTS (
      SELECT 1 FROM disputes d
      WHERE d.id::TEXT = (storage.foldername(name))[1]
        AND d.user_id = auth.uid()
    )
  );

-- DISPUTE-EVIDENCE: admin read all
CREATE POLICY "dispute-evidence: admin can read all"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'dispute-evidence'
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );

-- DISPUTE-EVIDENCE: owner can upload their own evidence
-- Backend validates file size and MIME type before generating upload URL.
CREATE POLICY "dispute-evidence: owner can insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'dispute-evidence'
    AND EXISTS (
      SELECT 1 FROM disputes d
      WHERE d.id::TEXT = (storage.foldername(name))[1]
        AND d.user_id = auth.uid()
        AND d.status IN ('open', 'under_review') -- Cannot add evidence to resolved disputes
    )
  );

-- ─── Storage helper function ────────────────────────────────────────
-- Generates a consistent object path for proof-of-delivery uploads.
CREATE OR REPLACE FUNCTION get_pod_upload_path(
  p_shipment_id UUID,
  p_filename     TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Format: {shipment_id}/{epoch_ms}_{filename}
  -- Epoch ms prevents collisions on rapid retries.
  RETURN p_shipment_id::TEXT
    || '/'
    || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT
    || '_'
    || REGEXP_REPLACE(p_filename, '[^a-zA-Z0-9._-]', '_', 'g');
END;
$$;

-- ─── Post-migration verification ───────────────────────────────────
-- Run this block after migration to verify schema integrity.
DO $$
DECLARE
  v_table_count INTEGER;
  v_enum_count  INTEGER;
  v_func_count  INTEGER;
BEGIN
  -- Verify all tables exist
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'user_profiles',
      'saved_addresses',
      'shipments',
      'shipment_status_events',
      'payments',
      'app_notifications',
      'audit_log',
      'pricing_config',
      'disputes'
    );

  ASSERT v_table_count = 9,
    'Expected 9 tables, found ' || v_table_count;

  -- Verify enums exist
  SELECT COUNT(*) INTO v_enum_count
  FROM pg_type
  WHERE typname IN (
    'user_role', 'shipment_status', 'package_size',
    'payment_method', 'payment_status', 'notification_type',
    'dispute_category', 'dispute_status', 'audit_event_type'
  ) AND typtype = 'e';

  ASSERT v_enum_count = 9,
    'Expected 9 enums, found ' || v_enum_count;

  -- Verify key RPC functions exist
  SELECT COUNT(*) INTO v_func_count
  FROM pg_proc
  WHERE proname IN (
    'get_platform_stats',
    'admin_transition_shipment',
    'confirm_delivery',
    'get_shipment_history',
    'expire_stale_payments',
    'calculate_shipment_price',
    'generate_tracking_number',
    'admin_get_user_list'
  );

  ASSERT v_func_count = 8,
    'Expected 8 RPC functions, found ' || v_func_count;

  RAISE NOTICE 'Phase 2 verification passed: % tables, % enums, % functions',
    v_table_count, v_enum_count, v_func_count;
END $$;
