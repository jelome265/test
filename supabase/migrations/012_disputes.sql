-- ═══════════════════════════════════════════════════════════════════
-- 012 — DISPUTES
-- Customer dispute tickets for delivery issues.
-- Evidence URLs reference Supabase Storage (bucket: dispute-evidence).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE disputes (
  id             UUID              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id    UUID              NOT NULL
    REFERENCES shipments(id) ON DELETE RESTRICT,
  user_id        UUID              NOT NULL
    REFERENCES user_profiles(id) ON DELETE RESTRICT,

  -- ─── Category and description ────────────────────────────────────
  category       dispute_category  NOT NULL,
  description    TEXT              NOT NULL
    CONSTRAINT disputes_description_length
      CHECK (char_length(description) BETWEEN 20 AND 2000),

  -- ─── Evidence ───────────────────────────────────────────────────
  -- Array of Supabase Storage signed URLs. Validated by backend (max 5).
  evidence_urls  TEXT[]            NOT NULL DEFAULT '{}',

  -- ─── Status and resolution ──────────────────────────────────────
  status         dispute_status    NOT NULL DEFAULT 'open',
  resolution     TEXT
    CONSTRAINT disputes_resolution_length
      CHECK (resolution IS NULL OR char_length(resolution) <= 2000),
  resolved_by    UUID
    REFERENCES user_profiles(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ,

  -- ─── Timestamps ─────────────────────────────────────────────────
  created_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- Business rule: one open dispute per shipment at a time
  CONSTRAINT disputes_one_open_per_shipment
    EXCLUDE (shipment_id WITH =)
    WHERE (status IN ('open', 'under_review'))
);

-- Indexes
CREATE INDEX idx_disputes_shipment_id ON disputes (shipment_id);
CREATE INDEX idx_disputes_user_id     ON disputes (user_id);
CREATE INDEX idx_disputes_status      ON disputes (status) WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX idx_disputes_created_at  ON disputes (created_at DESC);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Comments
COMMENT ON TABLE  disputes              IS 'Customer dispute tickets. One active dispute per shipment. Evidence in Supabase Storage.';
COMMENT ON COLUMN disputes.evidence_urls IS 'Array of Supabase Storage object paths. Signed URLs generated at read time by backend.';
COMMENT ON COLUMN disputes.resolution   IS 'Admin resolution text. Required when transitioning to resolved/closed.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

-- Customers: read and insert their own disputes
CREATE POLICY "disputes: owner can read"
  ON disputes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "disputes: owner can insert"
  ON disputes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins: full access
CREATE POLICY "disputes: admin full access"
  ON disputes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );
