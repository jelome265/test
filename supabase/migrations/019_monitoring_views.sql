-- ═══════════════════════════════════════════════════════════════════
-- 019 — MONITORING VIEWS
-- Read-only views for observability dashboards and alerting queries.
-- These views are designed to be queried by external monitoring tools
-- (Grafana, Metabase, custom admin dashboards) without exposing raw tables.
-- All views filter out PII — they return aggregates and non-identifying data.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Hourly shipment throughput (last 7 days) ──────────────────────
CREATE OR REPLACE VIEW v_shipment_throughput_hourly AS
SELECT
  DATE_TRUNC('hour', created_at)  AS hour_bucket,
  COUNT(*)                         AS total_created,
  COUNT(*) FILTER (WHERE status = 'confirmed')    AS total_confirmed,
  COUNT(*) FILTER (WHERE status = 'rejected')     AS total_rejected,
  COUNT(*) FILTER (WHERE status = 'cancelled')    AS total_cancelled,
  AVG(quoted_price_mwk)::INTEGER                  AS avg_price_tambala
FROM shipments
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour_bucket DESC;

COMMENT ON VIEW v_shipment_throughput_hourly IS
  'Hourly shipment counts for the last 7 days. Safe for monitoring dashboards — no PII.';

-- ─── Daily revenue (last 90 days) ──────────────────────────────────
CREATE OR REPLACE VIEW v_daily_revenue AS
SELECT
  DATE_TRUNC('day', p.created_at)  AS day_bucket,
  COUNT(*)                          AS payment_count,
  SUM(amount_mwk)                   AS revenue_tambala,
  AVG(amount_mwk)::INTEGER          AS avg_tambala
FROM payments p
WHERE p.status = 'paid'
  AND p.created_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', p.created_at)
ORDER BY day_bucket DESC;

COMMENT ON VIEW v_daily_revenue IS
  'Daily paid payment totals for the last 90 days. No PII.';

-- ─── Stale payment alert (feeds alerting webhook) ────────────────────
CREATE OR REPLACE VIEW v_stale_payment_alert AS
SELECT
  COUNT(*) AS stale_count,
  MIN(created_at) AS oldest_stale_at,
  MAX(amount_mwk) AS max_stale_tambala
FROM payments
WHERE status IN ('pending', 'processing')
  AND expires_at < NOW()
  AND expires_at > NOW() - INTERVAL '2 hours';  -- Don't alert on very old stale (already handled)

COMMENT ON VIEW v_stale_payment_alert IS
  'Count of payments that should have been expired but were not. Non-zero indicates expiry worker failure.';

-- ─── Pending approval queue depth ────────────────────────────────────
CREATE OR REPLACE VIEW v_approval_queue_depth AS
SELECT
  COUNT(*)             AS pending_count,
  MIN(created_at)      AS oldest_pending_at,
  MAX(created_at)      AS newest_pending_at,
  EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 3600 AS oldest_pending_hours
FROM shipments
WHERE status = 'pending_approval';

COMMENT ON VIEW v_approval_queue_depth IS
  'Admin approval queue depth. Alert if oldest_pending_hours exceeds SLA threshold.';

-- ─── Notification push failure rate (last 24h) ────────────────────────
CREATE OR REPLACE VIEW v_push_failure_rate_24h AS
SELECT
  COUNT(*)                                              AS total_attempted,
  COUNT(*) FILTER (WHERE push_sent = TRUE)              AS push_success,
  COUNT(*) FILTER (WHERE push_failed_at IS NOT NULL)    AS push_failed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE push_failed_at IS NOT NULL)
    / NULLIF(COUNT(*), 0), 2
  ) AS failure_rate_pct
FROM app_notifications
WHERE created_at >= NOW() - INTERVAL '24 hours';

COMMENT ON VIEW v_push_failure_rate_24h IS
  'Push notification success/failure rates for the last 24 hours. Alert if failure_rate_pct > 5%.';

-- ─── Row-level security on views ────────────────────────────────────
-- Views inherit RLS from underlying tables when accessed via anon key.
-- Service role bypasses; admin queries use service role.
-- Explicitly grant SELECT to authenticated role for admin dashboards:
GRANT SELECT ON v_shipment_throughput_hourly TO authenticated;
GRANT SELECT ON v_daily_revenue              TO authenticated;
GRANT SELECT ON v_approval_queue_depth       TO authenticated;
GRANT SELECT ON v_push_failure_rate_24h      TO authenticated;
-- v_stale_payment_alert is service-role only (alerting webhook)
