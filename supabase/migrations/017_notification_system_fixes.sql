-- ═══════════════════════════════════════════════════════════════════
-- 017 — NOTIFICATION SYSTEM FIXES + ENHANCEMENTS
--
-- 1. Fix trigger_record_status_event() to handle 'system' actor_id
--    (bug from Phase 6 migration 016 payment RPCs).
-- 2. Allow actor_id to be NULL on shipment_status_events for system events.
-- 3. Add is_system_event flag for observability.
-- 4. Add notification helper indexes for Phase 7 query patterns.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Step 1: Make actor_id nullable on shipment_status_events ───────
-- System-initiated transitions (payment webhook, expiry worker) have
-- no real user actor. Forcing NOT NULL here requires a fake system user,
-- which cannot be created without a real Supabase auth.users row.
-- Nullable is the correct modeling: NULL actor_id + is_system_event=TRUE
-- clearly communicates the intent.

ALTER TABLE shipment_status_events
  ALTER COLUMN actor_id DROP NOT NULL;

-- Drop and re-create the FK to allow NULL (constraint remains for non-NULL values)
-- (PostgreSQL allows NULL in FK columns by default — this comment is for clarity)

-- ─── Step 2: Add is_system_event flag ───────────────────────────────
ALTER TABLE shipment_status_events
  ADD COLUMN IF NOT EXISTS is_system_event BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN shipment_status_events.is_system_event IS
  'TRUE when the transition was triggered by an automated system process
   (payment webhook, expiry worker, scheduled reconciliation) rather than
   a human actor. actor_id is NULL when is_system_event is TRUE.';

-- Index for filtering system events in admin audits
CREATE INDEX IF NOT EXISTS idx_sse_system_events
  ON shipment_status_events (created_at DESC)
  WHERE is_system_event = TRUE;

-- ─── Step 3: Fix trigger_record_status_event() ──────────────────────
-- Handles 'system' actor_id sentinel gracefully.
-- Catches invalid UUID cast without failing the enclosing transaction.
CREATE OR REPLACE FUNCTION trigger_record_status_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_id_raw TEXT;
  v_actor_id     UUID;
  v_actor_role   user_role;
  v_is_system    BOOLEAN := FALSE;
BEGIN
  -- Only fire when status actually changes
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Read actor from session-local variable
  v_actor_id_raw := NULLIF(current_setting('courier.actor_id', true), '');

  -- Classify the actor
  IF v_actor_id_raw IS NULL THEN
    -- No session variable set — fall back to the authenticated user
    v_actor_id := auth.uid();
    v_is_system := (v_actor_id IS NULL);  -- System if no auth.uid() either
  ELSIF v_actor_id_raw = 'system' THEN
    -- Explicit system sentinel (set by payment RPCs, expiry worker)
    v_actor_id  := NULL;
    v_is_system := TRUE;
  ELSE
    -- Attempt UUID cast; treat any non-UUID string as a system event
    BEGIN
      v_actor_id  := v_actor_id_raw::UUID;
      v_is_system := FALSE;
    EXCEPTION WHEN invalid_text_representation THEN
      v_actor_id  := NULL;
      v_is_system := TRUE;
    END;
  END IF;

  -- Resolve actor role
  v_actor_role := NULLIF(current_setting('courier.actor_role', true), '')::user_role;

  IF v_actor_role IS NULL THEN
    IF v_actor_id IS NOT NULL THEN
      SELECT role INTO v_actor_role FROM user_profiles WHERE id = v_actor_id;
    END IF;
    -- Fall back to 'admin' for system events (automated, elevated operations)
    v_actor_role := COALESCE(v_actor_role, 'admin'::user_role);
  END IF;

  -- Write the immutable status event row
  INSERT INTO shipment_status_events (
    shipment_id,
    from_status,
    to_status,
    actor_id,
    actor_role,
    ip_address,
    notes,
    is_system_event
  ) VALUES (
    NEW.id,
    OLD.status,
    NEW.status,
    v_actor_id,
    v_actor_role,
    NULLIF(current_setting('courier.ip_address',       true), ''),
    NULLIF(current_setting('courier.transition_notes', true), ''),
    v_is_system
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_record_status_event IS
  'Auto-writes an immutable shipment_status_events row on any status change.
   Handles system-initiated transitions (actor_id = NULL, is_system_event = TRUE).
   Handles human actors (actor_id = UUID from courier.actor_id session variable).
   Gracefully catches invalid UUID cast (treats as system event).
   Updated in migration 017 to fix Phase 6 bug where system sentinel caused
   invalid_text_representation exception.';

-- ─── Step 4: Additional indexes for Phase 7 notification queries ────

-- Unread notification count (mobile badge — called frequently)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_v2
  ON app_notifications (user_id, created_at DESC)
  WHERE is_read = FALSE;

-- Pending push dispatch (picked up by reconciliation if worker missed it)
CREATE INDEX IF NOT EXISTS idx_notifications_push_queue
  ON app_notifications (created_at ASC)
  WHERE push_sent = FALSE
    AND push_failed_at IS NULL;

-- ─── Verification ────────────────────────────────────────────────────
DO $$
BEGIN
  -- Verify is_system_event column added
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shipment_status_events'
      AND column_name = 'is_system_event'
  ), 'is_system_event column not found on shipment_status_events';

  -- Verify actor_id is now nullable
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shipment_status_events'
      AND column_name = 'actor_id'
      AND is_nullable = 'YES'
  ), 'actor_id should be nullable after migration 017';

  RAISE NOTICE 'Migration 017 verification passed.';
END $$;
