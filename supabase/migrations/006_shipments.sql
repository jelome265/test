-- ═══════════════════════════════════════════════════════════════════
-- 006 — SHIPMENTS
-- Core business entity. Denormalized sender/receiver snapshot (ADR-003).
-- All monetary values in tambala (MWK × 100) — INTEGER, never NUMERIC.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE shipments (
  -- ─── Identity ──────────────────────────────────────────────────
  id               UUID              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracking_number  TEXT              NOT NULL UNIQUE,
  user_id          UUID              NOT NULL
    REFERENCES user_profiles(id) ON DELETE RESTRICT,

  -- ─── Sender snapshot (immutable after INSERT) ──────────────────
  -- ADR-003: Flat columns, not FK. Reflects state at time of creation.
  -- Any later change to user_profiles does NOT cascade here.
  sender_name      TEXT              NOT NULL
    CONSTRAINT shipments_sender_name_length CHECK (char_length(sender_name) BETWEEN 2 AND 100),
  sender_phone     TEXT              NOT NULL
    CONSTRAINT shipments_sender_phone_format CHECK (sender_phone ~ '^\+?[0-9]{9,15}$'),
  sender_email     TEXT
    CONSTRAINT shipments_sender_email_format CHECK (sender_email IS NULL OR sender_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  sender_address   TEXT              NOT NULL
    CONSTRAINT shipments_sender_address_length CHECK (char_length(sender_address) BETWEEN 5 AND 500),
  sender_city      TEXT              NOT NULL
    CONSTRAINT shipments_sender_city_valid CHECK (sender_city IN ('Lilongwe', 'Blantyre', 'Mzuzu')),
  sender_lat       DOUBLE PRECISION
    CONSTRAINT shipments_sender_lat_range CHECK (sender_lat BETWEEN -90 AND 90),
  sender_lng       DOUBLE PRECISION
    CONSTRAINT shipments_sender_lng_range CHECK (sender_lng BETWEEN -180 AND 180),

  -- ─── Receiver snapshot (immutable after INSERT) ────────────────
  receiver_name    TEXT              NOT NULL
    CONSTRAINT shipments_receiver_name_length CHECK (char_length(receiver_name) BETWEEN 2 AND 100),
  receiver_phone   TEXT              NOT NULL
    CONSTRAINT shipments_receiver_phone_format CHECK (receiver_phone ~ '^\+?[0-9]{9,15}$'),
  receiver_email   TEXT
    CONSTRAINT shipments_receiver_email_format CHECK (receiver_email IS NULL OR receiver_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  receiver_address TEXT              NOT NULL
    CONSTRAINT shipments_receiver_address_length CHECK (char_length(receiver_address) BETWEEN 5 AND 500),
  receiver_city    TEXT              NOT NULL
    CONSTRAINT shipments_receiver_city_valid CHECK (receiver_city IN ('Lilongwe', 'Blantyre', 'Mzuzu')),
  receiver_lat     DOUBLE PRECISION
    CONSTRAINT shipments_receiver_lat_range CHECK (receiver_lat BETWEEN -90 AND 90),
  receiver_lng     DOUBLE PRECISION
    CONSTRAINT shipments_receiver_lng_range CHECK (receiver_lng BETWEEN -180 AND 180),

  -- ─── Package details ───────────────────────────────────────────
  -- weight_kg: stored as NUMERIC(5,2) for precision, but validated
  -- server-side to 1 decimal place (e.g. 2.5, not 2.57)
  weight_kg         NUMERIC(5,2)     NOT NULL
    CONSTRAINT shipments_weight_range CHECK (weight_kg BETWEEN 0.1 AND 10.0),
  package_size      package_size     NOT NULL,
  package_description TEXT           NOT NULL
    CONSTRAINT shipments_description_length CHECK (char_length(package_description) BETWEEN 3 AND 300),
  is_fragile        BOOLEAN          NOT NULL DEFAULT FALSE,
  declared_value_mwk INTEGER
    CONSTRAINT shipments_declared_value_positive CHECK (declared_value_mwk IS NULL OR declared_value_mwk >= 0),

  -- ─── Routing ───────────────────────────────────────────────────
  pickup_city       TEXT             NOT NULL
    CONSTRAINT shipments_pickup_city_valid CHECK (pickup_city IN ('Lilongwe', 'Blantyre', 'Mzuzu')),
  delivery_city     TEXT             NOT NULL
    CONSTRAINT shipments_delivery_city_valid CHECK (delivery_city IN ('Lilongwe', 'Blantyre', 'Mzuzu')),
  -- distance_km: road distance in km, calculated by geo service
  -- Stored as INTEGER (rounded km) for consistency
  distance_km       INTEGER          NOT NULL
    CONSTRAINT shipments_distance_positive CHECK (distance_km > 0),

  -- ─── Pricing (tambala = MWK × 100) ────────────────────────────
  -- quoted_price_mwk: shown to user before payment
  -- final_price_mwk: set after any admin adjustment; NULL until confirmed
  quoted_price_mwk  INTEGER          NOT NULL
    CONSTRAINT shipments_quoted_price_positive CHECK (quoted_price_mwk > 0),
  final_price_mwk   INTEGER
    CONSTRAINT shipments_final_price_positive CHECK (final_price_mwk IS NULL OR final_price_mwk > 0),

  -- ─── State machine ─────────────────────────────────────────────
  status            shipment_status  NOT NULL DEFAULT 'pending_approval',
  rejection_reason  TEXT
    CONSTRAINT shipments_rejection_reason_length
      CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 500),
  delivery_notes    TEXT
    CONSTRAINT shipments_delivery_notes_length
      CHECK (delivery_notes IS NULL OR char_length(delivery_notes) <= 500),
  proof_of_delivery_url TEXT
    CONSTRAINT shipments_pod_url_length
      CHECK (proof_of_delivery_url IS NULL OR char_length(proof_of_delivery_url) <= 1000),

  -- ─── Admin metadata ─────────────────────────────────────────────
  reviewed_by       UUID
    REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,

  -- ─── Key operational timestamps ────────────────────────────────
  estimated_delivery_date DATE,
  picked_up_at            TIMESTAMPTZ,
  delivered_at            TIMESTAMPTZ,
  confirmed_at            TIMESTAMPTZ,

  -- ─── Standard timestamps ────────────────────────────────────────
  created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  -- ─── Business invariant: pickup must precede delivery ──────────
  CONSTRAINT shipments_timestamps_order
    CHECK (
      picked_up_at IS NULL
      OR delivered_at IS NULL
      OR picked_up_at <= delivered_at
    )
);

-- ─── Indexes ──────────────────────────────────────────────────────
-- Query patterns:
--   1. User fetches own shipments (paginated, ordered by created_at DESC)
--   2. Admin fetches all shipments filtered by status
--   3. User fetches single shipment by tracking number
--   4. Admin searches by sender/receiver phone or name
--   5. Payment service looks up shipment by id to advance status

CREATE INDEX idx_shipments_user_id         ON shipments (user_id, created_at DESC);
CREATE INDEX idx_shipments_status          ON shipments (status) WHERE status NOT IN ('confirmed', 'rejected', 'cancelled');
CREATE INDEX idx_shipments_tracking_number ON shipments (tracking_number);
CREATE INDEX idx_shipments_pickup_city     ON shipments (pickup_city);
CREATE INDEX idx_shipments_delivery_city   ON shipments (delivery_city);
CREATE INDEX idx_shipments_created_at      ON shipments (created_at DESC);
CREATE INDEX idx_shipments_reviewed_by     ON shipments (reviewed_by) WHERE reviewed_by IS NOT NULL;

-- Trigram index for phone/name search
CREATE INDEX idx_shipments_sender_phone_trgm
  ON shipments USING gin (sender_phone gin_trgm_ops);
CREATE INDEX idx_shipments_receiver_phone_trgm
  ON shipments USING gin (receiver_phone gin_trgm_ops);
CREATE INDEX idx_shipments_sender_name_trgm
  ON shipments USING gin (sender_name gin_trgm_ops);

-- ─── Triggers ─────────────────────────────────────────────────────

-- Assign tracking number on INSERT
CREATE TRIGGER assign_shipment_tracking_number
  BEFORE INSERT ON shipments
  FOR EACH ROW EXECUTE FUNCTION trigger_assign_tracking_number();

-- Auto-update updated_at
CREATE TRIGGER set_shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Record status event on status change (requires 007 to exist)
-- This trigger is added AFTER 007 creates the shipment_status_events table.
-- See 007_shipment_status_events.sql for CREATE TRIGGER statement.

-- ─── Comments ─────────────────────────────────────────────────────
COMMENT ON TABLE  shipments                    IS 'Core business entity. Flat sender/receiver snapshot per ADR-003. Money in tambala (INTEGER).';
COMMENT ON COLUMN shipments.tracking_number    IS 'Auto-generated CRR-YYYYMMDD-XXXXXX. Human-readable for support.';
COMMENT ON COLUMN shipments.weight_kg          IS 'Max 10.0kg enforced by CHECK and backend validation.';
COMMENT ON COLUMN shipments.quoted_price_mwk   IS 'Price shown at booking. Tambala (MWK × 100). Never zero.';
COMMENT ON COLUMN shipments.final_price_mwk    IS 'Admin-confirmed price. NULL until admin reviews. Equals quoted_price_mwk unless adjusted.';
COMMENT ON COLUMN shipments.distance_km        IS 'Road distance in whole km. Calculated by geo service; fallback from INTER_CITY_DISTANCES_KM.';
COMMENT ON COLUMN shipments.status             IS 'State machine enforced server-side. See ALLOWED_TRANSITIONS in shared-constants.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

-- Customers: read only their own shipments
CREATE POLICY "shipments: owner can read"
  ON shipments FOR SELECT
  USING (auth.uid() = user_id);

-- Customers: create their own shipments
CREATE POLICY "shipments: owner can insert"
  ON shipments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Customers: update limited fields on pending_approval shipments
-- (delivery_notes only; status changes go through backend)
CREATE POLICY "shipments: owner can update notes"
  ON shipments FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'pending_approval'
  )
  WITH CHECK (
    auth.uid() = user_id
  );

-- Admin: read all shipments
CREATE POLICY "shipments: admin can read all"
  ON shipments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );

-- Admin: update status and review fields (via backend service role)
-- All status transitions are enforced in the backend state machine.
-- RLS here is a defense-in-depth layer; real enforcement is in the API.
CREATE POLICY "shipments: admin can update"
  ON shipments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );
