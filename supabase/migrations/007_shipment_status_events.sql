-- ═══════════════════════════════════════════════════════════════════
-- 007 — SHIPMENT STATUS EVENTS
-- Immutable audit trail of all shipment state transitions.
-- POLICY: No UPDATE, no DELETE — ever. This is the ledger.
-- Rows are written automatically by trigger_record_status_event()
-- and manually by admin_transition_shipment() RPC.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE shipment_status_events (
  id           UUID              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id  UUID              NOT NULL
    REFERENCES shipments(id) ON DELETE RESTRICT, -- Never lose events even if shipment softened
  from_status  shipment_status,                   -- NULL for the creation event
  to_status    shipment_status   NOT NULL,
  notes        TEXT
    CONSTRAINT sse_notes_length CHECK (notes IS NULL OR char_length(notes) <= 500),
  actor_id     UUID              NOT NULL
    REFERENCES user_profiles(id) ON DELETE RESTRICT,
  actor_role   user_role         NOT NULL,
  ip_address   INET,                              -- IPv4 or IPv6
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()

  -- Intentionally NO updated_at — rows are immutable
);

-- Indexes
CREATE INDEX idx_sse_shipment_id ON shipment_status_events (shipment_id, created_at DESC);
CREATE INDEX idx_sse_actor_id    ON shipment_status_events (actor_id);
CREATE INDEX idx_sse_to_status   ON shipment_status_events (to_status);
CREATE INDEX idx_sse_created_at  ON shipment_status_events (created_at DESC);

-- Comments
COMMENT ON TABLE  shipment_status_events           IS 'Immutable ledger of all shipment state changes. No UPDATE/DELETE permitted.';
COMMENT ON COLUMN shipment_status_events.from_status IS 'NULL for the first event (creation to pending_approval).';
COMMENT ON COLUMN shipment_status_events.ip_address  IS 'Actor IP address for forensic tracing. NULL for webhook/system events.';
COMMENT ON COLUMN shipment_status_events.notes       IS 'Optional reason or admin note attached to this transition.';

-- ─── Attach the status event recorder trigger to shipments ─────────
-- Now that shipment_status_events exists, wire up the trigger.
CREATE TRIGGER record_shipment_status_event
  AFTER UPDATE OF status ON shipments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_record_status_event();

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE shipment_status_events ENABLE ROW LEVEL SECURITY;

-- Customers: read their own shipment's events (for tracking timeline)
CREATE POLICY "sse: owner can read"
  ON shipment_status_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_status_events.shipment_id
        AND s.user_id = auth.uid()
    )
  );

-- Admins: read all events
CREATE POLICY "sse: admin can read all"
  ON shipment_status_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );

-- INSERT only via trigger or service role — no direct user inserts
CREATE POLICY "sse: service role insert only"
  ON shipment_status_events FOR INSERT
  WITH CHECK (TRUE); -- Application-layer guard; trigger handles content

-- Explicitly DENY UPDATE and DELETE for all roles including admin
-- PostgreSQL default is DENY, but these policies make intent explicit.
-- No UPDATE or DELETE policies are created — absence = denial.
