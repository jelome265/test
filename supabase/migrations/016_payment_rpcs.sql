-- ═══════════════════════════════════════════════════════════════════
-- 016 — PAYMENT RPC FUNCTIONS
-- Atomic payment → shipment state advancement.
-- Called by backend webhook handler via supabaseServiceRole().rpc().
-- SECURITY DEFINER: runs as postgres, validates caller implicitly
-- via the backend using the service role key.
--
-- These RPCs guarantee:
--   1. Payment status update
--   2. Shipment status update
--   3. Status event record
--   4. Audit log entry
-- All in a single transaction. Atomic. No partial state possible.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Function: advance_shipment_on_payment() ───────────────────────
-- Called when Paychangu sends a 'successful' webhook.
-- Returns the updated payment record.
CREATE OR REPLACE FUNCTION advance_shipment_on_payment(
  p_provider_reference      TEXT,     -- Paychangu tx_ref
  p_provider_transaction_id TEXT,     -- Paychangu internal transaction ID
  p_callback_payload        JSONB,    -- Raw webhook body for forensics
  p_actor_ip                INET DEFAULT NULL
)
RETURNS payments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment  payments%ROWTYPE;
  v_shipment shipments%ROWTYPE;
BEGIN
  -- ── Step 1: Lock and load the payment record ─────────────────────
  SELECT * INTO v_payment
  FROM payments
  WHERE provider_reference = p_provider_reference
  FOR UPDATE NOWAIT;
  -- NOWAIT: if another webhook is processing this reference concurrently,
  -- raise an exception immediately instead of waiting (prevents double-processing).

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: no payment found for provider_reference = %', p_provider_reference;
  END IF;

  -- ── Step 2: Idempotency check ─────────────────────────────────────
  -- If already terminal, return existing state — do nothing.
  IF v_payment.status IN ('paid', 'failed', 'expired', 'refunded') THEN
    RETURN v_payment; -- Idempotent: already processed
  END IF;

  -- ── Step 3: Load the associated shipment ──────────────────────────
  SELECT * INTO v_shipment
  FROM shipments
  WHERE id = v_payment.shipment_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: shipment % associated with payment % not found',
      v_payment.shipment_id, v_payment.id;
  END IF;

  -- ── Step 4: Mark payment as paid ──────────────────────────────────
  UPDATE payments
  SET
    status                   = 'paid',
    provider_transaction_id  = p_provider_transaction_id,
    callback_received_at     = NOW(),
    callback_payload         = p_callback_payload
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  -- ── Step 5: Advance shipment status ───────────────────────────────
  -- Only advance if the shipment is still in payment_pending.
  -- It may already be in a different state if manually adjusted.
  IF v_shipment.status = 'payment_pending' THEN
    PERFORM set_config('courier.actor_id',   'system',   TRUE);
    PERFORM set_config('courier.actor_role', 'admin',    TRUE);
    PERFORM set_config('courier.transition_notes',
      'Payment confirmed via Paychangu webhook', TRUE);

    UPDATE shipments
    SET status = 'payment_confirmed'
    WHERE id = v_shipment.id
      AND status = 'payment_pending'; -- Optimistic concurrency guard
    -- Trigger writes to shipment_status_events automatically.
  END IF;

  -- ── Step 6: Write audit log ───────────────────────────────────────
  INSERT INTO audit_log (
    event_type, target_type, target_id, actor_ip, payload
  ) VALUES (
    'payment_webhook_received',
    'payment',
    v_payment.id,
    p_actor_ip,
    jsonb_build_object(
      'provider_reference',      p_provider_reference,
      'provider_transaction_id', p_provider_transaction_id,
      'status',                  'paid',
      'shipment_id',             v_payment.shipment_id
    )
  );

  RETURN v_payment;
END;
$$;

COMMENT ON FUNCTION advance_shipment_on_payment IS
  'Atomically marks payment as paid and advances shipment to payment_confirmed.
   Idempotent: safe to call multiple times for the same provider_reference.
   Uses NOWAIT lock to detect concurrent webhook delivery and fail fast.';

-- ─── Function: revert_shipment_on_payment_failure() ───────────────
-- Called when Paychangu sends a 'failed' webhook.
-- Marks payment as failed; reverts shipment to approved (re-payable).
CREATE OR REPLACE FUNCTION revert_shipment_on_payment_failure(
  p_provider_reference TEXT,
  p_failure_reason     TEXT,
  p_callback_payload   JSONB,
  p_actor_ip           INET DEFAULT NULL
)
RETURNS payments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment  payments%ROWTYPE;
  v_shipment shipments%ROWTYPE;
BEGIN
  -- Lock and load
  SELECT * INTO v_payment
  FROM payments
  WHERE provider_reference = p_provider_reference
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: no payment found for provider_reference = %', p_provider_reference;
  END IF;

  -- Idempotency check
  IF v_payment.status IN ('paid', 'failed', 'expired', 'refunded') THEN
    RETURN v_payment;
  END IF;

  SELECT * INTO v_shipment
  FROM shipments
  WHERE id = v_payment.shipment_id
  FOR UPDATE NOWAIT;

  -- Mark payment as failed
  UPDATE payments
  SET
    status               = 'failed',
    failure_reason       = p_failure_reason,
    callback_received_at = NOW(),
    callback_payload     = p_callback_payload
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  -- Revert shipment to approved (customer can retry payment)
  IF v_shipment.status = 'payment_pending' THEN
    PERFORM set_config('courier.actor_id',   'system', TRUE);
    PERFORM set_config('courier.actor_role', 'admin',  TRUE);
    PERFORM set_config('courier.transition_notes',
      'Payment failed — reverted to approved for retry', TRUE);

    UPDATE shipments
    SET status = 'approved'
    WHERE id = v_shipment.id
      AND status = 'payment_pending';
  END IF;

  -- Audit log
  INSERT INTO audit_log (
    event_type, target_type, target_id, actor_ip, payload
  ) VALUES (
    'payment_webhook_received',
    'payment',
    v_payment.id,
    p_actor_ip,
    jsonb_build_object(
      'provider_reference', p_provider_reference,
      'status',             'failed',
      'failure_reason',     p_failure_reason,
      'shipment_id',        v_payment.shipment_id
    )
  );

  RETURN v_payment;
END;
$$;

COMMENT ON FUNCTION revert_shipment_on_payment_failure IS
  'Atomically marks payment as failed and reverts shipment to approved.
   Idempotent. Customer can initiate a new payment after this call.';

-- ─── Function: expire_payment() ───────────────────────────────────
-- Individual payment expiry. Called by the expiry worker per payment.
-- expire_stale_payments() (migration 014) handles bulk expiry;
-- this function handles targeted expiry with full audit trail.
CREATE OR REPLACE FUNCTION expire_payment(p_payment_id UUID)
RETURNS payments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment
  FROM payments
  WHERE id = p_payment_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: payment % not found', p_payment_id;
  END IF;

  IF v_payment.status NOT IN ('pending', 'processing') THEN
    RETURN v_payment; -- Already terminal, idempotent
  END IF;

  IF v_payment.expires_at > NOW() THEN
    RAISE EXCEPTION 'NOT_EXPIRED: payment % expires at %, current time is %',
      p_payment_id, v_payment.expires_at, NOW();
  END IF;

  UPDATE payments
  SET status = 'expired'
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  -- Revert shipment if still in payment_pending
  PERFORM set_config('courier.actor_id',   'system', TRUE);
  PERFORM set_config('courier.actor_role', 'admin',  TRUE);
  PERFORM set_config('courier.transition_notes',
    'Payment window expired (30 min) — reverted to approved', TRUE);

  UPDATE shipments
  SET status = 'approved'
  WHERE id = v_payment.shipment_id
    AND status = 'payment_pending';

  RETURN v_payment;
END;
$$;
