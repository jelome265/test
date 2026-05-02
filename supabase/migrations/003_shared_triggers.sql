-- ═══════════════════════════════════════════════════════════════════
-- 003 — SHARED TRIGGER FUNCTIONS
-- Reusable trigger functions attached to multiple tables.
-- ═══════════════════════════════════════════════════════════════════

-- ─── updated_at auto-maintenance ───────────────────────────────────
-- Attached to every table that has an updated_at column.
-- This is the canonical pattern — never manually set updated_at.
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_set_updated_at IS
  'Auto-sets updated_at on any row update. Attach to all mutable tables.';

-- ─── Tracking number generator ──────────────────────────────────────
-- Generates CRR-YYYYMMDD-XXXXXX format tracking numbers.
-- Called during shipment INSERT via trigger below.
CREATE OR REPLACE FUNCTION generate_tracking_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  date_part   TEXT;
  random_part TEXT;
BEGIN
  -- Date: YYYYMMDD in UTC
  date_part   := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYYMMDD');
  -- 6 uppercase hex chars from random bytes
  random_part := UPPER(ENCODE(gen_random_bytes(3), 'hex'));
  RETURN 'CRR-' || date_part || '-' || random_part;
END;
$$;

COMMENT ON FUNCTION generate_tracking_number IS
  'Generates a human-readable tracking number: CRR-20240101-A3F9C2.
   Format: CRR-{YYYYMMDD}-{6 hex chars}. ~16M unique values per day.
   Collision risk negligible at Phase 1 scale; add uniqueness check if
   volume exceeds 100k shipments/day.';

-- ─── Shipment tracking number assignment trigger ────────────────────
-- Fires BEFORE INSERT on shipments.
-- Prevents any code path from forgetting to set tracking_number.
CREATE OR REPLACE FUNCTION trigger_assign_tracking_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tracking_number IS NULL OR NEW.tracking_number = '' THEN
    NEW.tracking_number := generate_tracking_number();
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Status event recorder ──────────────────────────────────────────
-- Fires AFTER UPDATE on shipments when status changes.
-- Writes an immutable row to shipment_status_events automatically.
-- The actor_id/actor_role must be supplied via a session variable
-- set by the backend before any status-change query:
--   SET LOCAL courier.actor_id = '...uuid...';
--   SET LOCAL courier.actor_role = 'admin';
CREATE OR REPLACE FUNCTION trigger_record_status_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_id   UUID;
  v_actor_role user_role;
BEGIN
  -- Only fire when status actually changes
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Read actor from session-local variable (set by backend before UPDATE)
  -- Falls back to the authenticated user if not set
  v_actor_id := NULLIF(current_setting('courier.actor_id', true), '')::UUID;
  IF v_actor_id IS NULL THEN
    v_actor_id := auth.uid();
  END IF;

  v_actor_role := NULLIF(current_setting('courier.actor_role', true), '')::user_role;
  IF v_actor_role IS NULL THEN
    -- Derive role from user_profiles; 'customer' is the safe default
    SELECT role INTO v_actor_role FROM user_profiles WHERE id = v_actor_id;
    v_actor_role := COALESCE(v_actor_role, 'customer'::user_role);
  END IF;

  INSERT INTO shipment_status_events (
    shipment_id,
    from_status,
    to_status,
    actor_id,
    actor_role,
    ip_address,
    notes
  ) VALUES (
    NEW.id,
    OLD.status,
    NEW.status,
    v_actor_id,
    v_actor_role,
    NULLIF(current_setting('courier.ip_address', true), ''),
    NULLIF(current_setting('courier.transition_notes', true), '')
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_record_status_event IS
  'Auto-writes an immutable shipment_status_events row on any status change.
   Backend MUST set courier.actor_id and courier.actor_role session variables
   before any UPDATE that changes shipment.status.
   Example: SET LOCAL courier.actor_id = $1; SET LOCAL courier.actor_role = $2;';
