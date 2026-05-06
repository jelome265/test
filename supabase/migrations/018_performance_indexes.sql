-- ═══════════════════════════════════════════════════════════════════
-- 018 — PERFORMANCE INDEXES
-- Indexes identified from slow query analysis in Phase 9 load testing.
-- All are CONCURRENTLY created to avoid table-level locks in production.
-- ═══════════════════════════════════════════════════════════════════

-- Payments: webhook handler looks up by provider_reference frequently.
-- Already indexed in 008, but add a composite for the common join
-- pattern: provider_reference + status.
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_payments_provider_ref_status
  ON payments (provider_reference, status)
  WHERE provider_reference IS NOT NULL;

-- Shipments: admin dashboard filters by status + created_at DESC.
-- Composite index avoids full scan on status + sort.
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_shipments_status_created
  ON shipments (status, created_at DESC)
  WHERE status NOT IN ('confirmed', 'rejected', 'cancelled');

-- Notifications: background worker fetches push_sent=false.
-- Partial index on unsent push jobs (most rows will be sent).
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_notifications_unsent
  ON app_notifications (created_at ASC)
  WHERE push_sent = FALSE;

-- Audit log: support queries filter by target_id frequently.
-- Composite covers the common (target_type, target_id, created_at) pattern.
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_audit_log_target_time
  ON audit_log (target_type, target_id, created_at DESC)
  WHERE target_id IS NOT NULL;

-- Payments: expiry worker scans by expires_at + status.
-- Existing partial index covers status; add expires_at for range scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_payments_expiry_scan
  ON payments (expires_at ASC, status)
  WHERE status IN ('pending', 'processing');

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Migration 018: performance indexes created.';
END $$;
