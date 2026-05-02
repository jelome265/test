-- ═══════════════════════════════════════════════════════════════════
-- 010 — AUDIT LOG
-- Generic immutable log of sensitive platform events.
-- Separate from shipment_status_events (which is shipment-specific).
-- Written by backend services directly via service role.
-- Retention: 2 years minimum. Never deleted via application code.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE audit_log (
  id            UUID              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type    audit_event_type  NOT NULL,

  -- ─── Actor ──────────────────────────────────────────────────────
  -- actor_id: NULL for unauthenticated events (e.g. failed login)
  actor_id      UUID
    REFERENCES user_profiles(id) ON DELETE SET NULL,
  actor_role    user_role,
  actor_ip      INET,
  actor_ua      TEXT,             -- User-Agent string for forensics

  -- ─── Target ─────────────────────────────────────────────────────
  -- target_type + target_id: polymorphic reference to affected resource.
  -- Examples: target_type='shipment', target_id='uuid'
  --           target_type='user', target_id='uuid'
  --           target_type='payment', target_id='uuid'
  target_type   TEXT
    CONSTRAINT audit_log_target_type_length CHECK (target_type IS NULL OR char_length(target_type) <= 50),
  target_id     UUID,

  -- ─── Event payload ──────────────────────────────────────────────
  -- Stores a before/after diff or event-specific metadata.
  -- PII MUST be redacted before writing here.
  -- Never log: passwords, tokens, card numbers, raw webhook payloads.
  payload       JSONB             NOT NULL DEFAULT '{}',

  -- ─── Outcome ────────────────────────────────────────────────────
  success       BOOLEAN           NOT NULL DEFAULT TRUE,
  error_message TEXT
    CONSTRAINT audit_log_error_length CHECK (error_message IS NULL OR char_length(error_message) <= 1000),

  -- ─── Timestamp ──────────────────────────────────────────────────
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW()
  -- No updated_at — immutable
);

-- Partition by month for performance at scale (optional, add in Phase 3+)
-- For Phase 1 volume, a plain index is sufficient.

-- Indexes
CREATE INDEX idx_audit_log_actor_id    ON audit_log (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_log_event_type  ON audit_log (event_type, created_at DESC);
CREATE INDEX idx_audit_log_target      ON audit_log (target_type, target_id) WHERE target_id IS NOT NULL;
CREATE INDEX idx_audit_log_created_at  ON audit_log (created_at DESC);
CREATE INDEX idx_audit_log_actor_ip    ON audit_log (actor_ip) WHERE actor_ip IS NOT NULL;
-- JSONB full-text on payload
CREATE INDEX idx_audit_log_payload     ON audit_log USING gin (payload);

-- Comments
COMMENT ON TABLE  audit_log              IS 'Immutable event log. 2-year retention. PII redacted. Written by backend services only.';
COMMENT ON COLUMN audit_log.payload      IS 'Event-specific JSON. Never include passwords, tokens, or card data.';
COMMENT ON COLUMN audit_log.actor_ua     IS 'User-Agent for forensic analysis. Truncated to 500 chars by backend.';
COMMENT ON COLUMN audit_log.target_type  IS 'Resource type affected: shipment | user | payment | dispute.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only super_admin reads audit logs via this policy.
-- Admins use the backend API which queries via service role.
CREATE POLICY "audit_log: super_admin read only"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'super_admin'
    )
  );

-- INSERT only via service role (backend). No direct user writes ever.
CREATE POLICY "audit_log: service role insert"
  ON audit_log FOR INSERT
  WITH CHECK (TRUE);
