-- ═══════════════════════════════════════════════════════════════════
-- 014 — ADMIN RPC FUNCTIONS
-- Server-side functions callable via supabase.rpc().
-- All sensitive business logic runs here, not in client code.
-- SECURITY DEFINER: functions run as the defining user (service role).
-- All functions validate the caller's role before executing.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Helper: assert caller is admin ────────────────────────────────
CREATE OR REPLACE FUNCTION assert_admin_role(p_minimum_role user_role DEFAULT 'admin')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM user_profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNAUTHORIZED: caller profile not found';
  END IF;

  IF p_minimum_role = 'super_admin' AND v_role != 'super_admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: super_admin role required';
  END IF;

  IF p_minimum_role = 'admin' AND v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;
END;
$$;

-- ─── Function: get_platform_stats() ────────────────────────────────
-- Returns shipment counts by status, revenue metrics, and user counts.
-- Used by: admin dashboard home screen.
CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM assert_admin_role('admin');

  SELECT jsonb_build_object(
    'shipments_by_status', (
      SELECT jsonb_object_agg(status, cnt)
      FROM (
        SELECT status::TEXT, COUNT(*) AS cnt
        FROM shipments
        GROUP BY status
      ) s
    ),
    'total_shipments', (SELECT COUNT(*) FROM shipments),
    'active_shipments', (
      SELECT COUNT(*) FROM shipments
      WHERE status NOT IN ('confirmed', 'rejected', 'cancelled', 'failed')
    ),
    'pending_approval_count', (
      SELECT COUNT(*) FROM shipments WHERE status = 'pending_approval'
    ),
    'total_revenue_mwk', (
      SELECT COALESCE(SUM(amount_mwk), 0)
      FROM payments
      WHERE status = 'paid'
    ),
    'payments_today_count', (
      SELECT COUNT(*) FROM payments
      WHERE status = 'paid'
        AND created_at >= CURRENT_DATE
    ),
    'total_users', (SELECT COUNT(*) FROM user_profiles WHERE role = 'customer'),
    'active_users_30d', (
      SELECT COUNT(DISTINCT user_id) FROM shipments
      WHERE created_at >= NOW() - INTERVAL '30 days'
    ),
    'open_disputes', (
      SELECT COUNT(*) FROM disputes WHERE status IN ('open', 'under_review')
    ),
    'generated_at', NOW()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_platform_stats IS
  'Admin dashboard aggregate stats. Caller must have admin role.
   Returns: shipments by status, total revenue, user counts, open disputes.';

-- ─── Function: admin_transition_shipment() ─────────────────────────
-- Concurrency-safe shipment status transition with full validation.
-- Enforces the state machine transition rules server-side.
-- Records a status event automatically via the trigger.
-- Returns the updated shipment row.
CREATE OR REPLACE FUNCTION admin_transition_shipment(
  p_shipment_id  UUID,
  p_to_status    shipment_status,
  p_notes        TEXT    DEFAULT NULL,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS shipments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shipment     shipments%ROWTYPE;
  v_actor_id     UUID;
  v_actor_role   user_role;
  v_allowed      shipment_status[];
BEGIN
  -- Validate caller
  PERFORM assert_admin_role('admin');

  v_actor_id := auth.uid();
  SELECT role INTO v_actor_role FROM user_profiles WHERE id = v_actor_id;

  -- Lock the row for update (prevents concurrent transitions)
  SELECT * INTO v_shipment
  FROM shipments
  WHERE id = p_shipment_id
  FOR UPDATE NOWAIT; -- Raises exception if locked by concurrent transaction

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: shipment % does not exist', p_shipment_id;
  END IF;

  -- Validate target transition
  v_allowed := CASE v_shipment.status
    WHEN 'pending_approval'  THEN ARRAY['approved', 'rejected']::shipment_status[]
    WHEN 'approved'          THEN ARRAY['payment_pending', 'cancelled']::shipment_status[]
    WHEN 'payment_pending'   THEN ARRAY['payment_confirmed', 'approved', 'failed']::shipment_status[]
    WHEN 'payment_confirmed' THEN ARRAY['picked_up', 'cancelled']::shipment_status[]
    WHEN 'picked_up'         THEN ARRAY['in_transit']::shipment_status[]
    WHEN 'in_transit'        THEN ARRAY['delivered', 'failed']::shipment_status[]
    WHEN 'delivered'         THEN ARRAY['confirmed']::shipment_status[]
    ELSE ARRAY[]::shipment_status[] -- Terminal states
  END;

  IF p_to_status != ALL(v_allowed) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: cannot move from % to %. Allowed: %',
      v_shipment.status, p_to_status, v_allowed;
  END IF;

  -- Validate rejection reason is present when rejecting
  IF p_to_status = 'rejected' AND (p_rejection_reason IS NULL OR p_rejection_reason = '') THEN
    RAISE EXCEPTION 'VALIDATION: rejection_reason is required when rejecting a shipment';
  END IF;

  -- Set session variables for the trigger to pick up
  PERFORM set_config('courier.actor_id',         v_actor_id::TEXT,             TRUE);
  PERFORM set_config('courier.actor_role',        v_actor_role::TEXT,           TRUE);
  PERFORM set_config('courier.transition_notes',  COALESCE(p_notes, ''),        TRUE);

  -- Execute the update (trigger writes to shipment_status_events automatically)
  UPDATE shipments
  SET
    status           = p_to_status,
    rejection_reason = CASE WHEN p_to_status = 'rejected'
                         THEN p_rejection_reason
                         ELSE rejection_reason END,
    reviewed_by      = CASE WHEN p_to_status IN ('approved', 'rejected')
                         THEN v_actor_id
                         ELSE reviewed_by END,
    reviewed_at      = CASE WHEN p_to_status IN ('approved', 'rejected')
                         THEN NOW()
                         ELSE reviewed_at END,
    picked_up_at     = CASE WHEN p_to_status = 'picked_up'
                         THEN NOW()
                         ELSE picked_up_at END,
    delivered_at     = CASE WHEN p_to_status = 'delivered'
                         THEN NOW()
                         ELSE delivered_at END,
    confirmed_at     = CASE WHEN p_to_status = 'confirmed'
                         THEN NOW()
                         ELSE confirmed_at END
  WHERE id = p_shipment_id
    AND status = v_shipment.status  -- Optimistic concurrency guard (ADR-005)
  RETURNING * INTO v_shipment;

  -- If 0 rows updated, another transaction beat us to it
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: shipment status was modified concurrently. Reload and retry.';
  END IF;

  -- Write audit log
  INSERT INTO audit_log (event_type, actor_id, actor_role, target_type, target_id, payload)
  VALUES (
    'shipment_status_changed',
    v_actor_id,
    v_actor_role,
    'shipment',
    p_shipment_id,
    jsonb_build_object(
      'from_status', v_shipment.status,
      'to_status',   p_to_status,
      'notes',       p_notes
    )
  );

  RETURN v_shipment;
END;
$$;

COMMENT ON FUNCTION admin_transition_shipment IS
  'Concurrency-safe shipment state transition for admin use.
   Enforces state machine rules. Raises exceptions on invalid transitions.
   Writes audit log entry. Trigger writes status event automatically.
   ADR-005: optimistic concurrency via WHERE status = current_status.';

-- ─── Function: confirm_delivery() ──────────────────────────────────
-- Customer confirms their own delivery. Does not require admin role.
CREATE OR REPLACE FUNCTION confirm_delivery(p_shipment_id UUID)
RETURNS shipments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shipment   shipments%ROWTYPE;
  v_user_id    UUID := auth.uid();
BEGIN
  SELECT * INTO v_shipment
  FROM shipments
  WHERE id = p_shipment_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: shipment not found';
  END IF;

  -- Only owner can confirm
  IF v_shipment.user_id != v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN: only the shipment owner can confirm delivery';
  END IF;

  -- Must be in 'delivered' state
  IF v_shipment.status != 'delivered' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: cannot confirm a shipment in % state', v_shipment.status;
  END IF;

  PERFORM set_config('courier.actor_id',   v_user_id::TEXT, TRUE);
  PERFORM set_config('courier.actor_role', 'customer',       TRUE);

  UPDATE shipments
  SET status = 'confirmed', confirmed_at = NOW()
  WHERE id = p_shipment_id AND status = 'delivered'
  RETURNING * INTO v_shipment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: shipment status changed concurrently. Reload and retry.';
  END IF;

  RETURN v_shipment;
END;
$$;

-- ─── Function: get_shipment_history() ──────────────────────────────
-- Returns a shipment with its full status event timeline.
-- Callable by owner or admin.
CREATE OR REPLACE FUNCTION get_shipment_history(p_shipment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_role     user_role;
  v_shipment shipments%ROWTYPE;
  v_events   JSONB;
BEGIN
  SELECT role INTO v_role FROM user_profiles WHERE id = v_user_id;

  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: shipment not found';
  END IF;

  -- Access control: owner or admin only
  IF v_shipment.user_id != v_user_id AND v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: access denied';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',          sse.id,
      'from_status', sse.from_status,
      'to_status',   sse.to_status,
      'notes',       sse.notes,
      'actor_role',  sse.actor_role,
      'created_at',  sse.created_at
    ) ORDER BY sse.created_at ASC
  ) INTO v_events
  FROM shipment_status_events sse
  WHERE sse.shipment_id = p_shipment_id;

  RETURN jsonb_build_object(
    'shipment', row_to_json(v_shipment),
    'events',   COALESCE(v_events, '[]'::JSONB)
  );
END;
$$;

-- ─── Function: expire_stale_payments() ─────────────────────────────
-- Called by BullMQ reconciliation worker on a schedule.
-- Marks payments older than 30 minutes that are still in pending/processing.
CREATE OR REPLACE FUNCTION expire_stale_payments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE payments
    SET status = 'expired'
    WHERE status IN ('pending', 'processing')
      AND expires_at < NOW()
    RETURNING shipment_id
  ),
  -- Revert shipment status to 'approved' if payment_pending due to expiry
  reverted AS (
    UPDATE shipments s
    SET status = 'approved'
    FROM expired e
    WHERE s.id = e.shipment_id
      AND s.status = 'payment_pending'
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired;

  RETURN v_expired_count;
END;
$$;

COMMENT ON FUNCTION expire_stale_payments IS
  'Marks payments past their 30-minute expiry as expired.
   Reverts shipment to approved state if it was payment_pending.
   Called by reconciliation worker on a schedule (e.g. every 5 minutes).';

-- ─── Function: admin_get_user_list() ───────────────────────────────
-- Paginated user list for admin user management screen.
CREATE OR REPLACE FUNCTION admin_get_user_list(
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_role   user_role DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_users JSONB;
  v_total BIGINT;
BEGIN
  PERFORM assert_admin_role('admin');

  SELECT
    jsonb_agg(u ORDER BY u->>'created_at' DESC),
    COUNT(*) OVER()
  INTO v_users, v_total
  FROM (
    SELECT jsonb_build_object(
      'id',           up.id,
      'email',        up.email,
      'full_name',    up.full_name,
      'phone_number', up.phone_number,
      'role',         up.role,
      'is_active',    up.is_active,
      'created_at',   up.created_at,
      'shipment_count', (
        SELECT COUNT(*) FROM shipments s WHERE s.user_id = up.id
      )
    ) u
    FROM user_profiles up
    WHERE (p_role IS NULL OR up.role = p_role)
      AND (
        p_search IS NULL
        OR up.email ILIKE '%' || p_search || '%'
        OR up.full_name ILIKE '%' || p_search || '%'
        OR up.phone_number ILIKE '%' || p_search || '%'
      )
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'users', COALESCE(v_users, '[]'::JSONB),
    'total', COALESCE(v_total, 0),
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;
