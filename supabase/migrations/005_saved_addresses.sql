-- ═══════════════════════════════════════════════════════════════════
-- 005 — SAVED ADDRESSES
-- User address book for pre-filling shipment forms.
-- Cities restricted to supported service regions only.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE saved_addresses (
  id          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID          NOT NULL
    REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- ─── Label and location ─────────────────────────────────────────
  label       TEXT          NOT NULL
    CONSTRAINT saved_addresses_label_length
      CHECK (char_length(label) BETWEEN 1 AND 50),
  street      TEXT          NOT NULL
    CONSTRAINT saved_addresses_street_length
      CHECK (char_length(street) BETWEEN 3 AND 300),
  area        TEXT          NOT NULL DEFAULT '',
  city        TEXT          NOT NULL
    CONSTRAINT saved_addresses_city_valid
      CHECK (city IN ('Lilongwe', 'Blantyre', 'Mzuzu')),

  -- ─── Coordinates (optional — user may not share location) ───────
  latitude    DOUBLE PRECISION
    CONSTRAINT saved_addresses_lat_range CHECK (latitude  BETWEEN -90  AND 90),
  longitude   DOUBLE PRECISION
    CONSTRAINT saved_addresses_lng_range CHECK (longitude BETWEEN -180 AND 180),

  -- ─── Default flag ───────────────────────────────────────────────
  -- At most one default per user enforced via partial unique index below.
  is_default  BOOLEAN       NOT NULL DEFAULT FALSE,

  -- ─── Timestamps ─────────────────────────────────────────────────
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_saved_addresses_user_id   ON saved_addresses (user_id);
CREATE INDEX idx_saved_addresses_city      ON saved_addresses (city);

-- Enforce at most one default address per user
CREATE UNIQUE INDEX idx_saved_addresses_one_default
  ON saved_addresses (user_id)
  WHERE is_default = TRUE;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_saved_addresses_updated_at
  BEFORE UPDATE ON saved_addresses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Comments
COMMENT ON TABLE  saved_addresses            IS 'User address book. Pre-fills shipment creation form.';
COMMENT ON COLUMN saved_addresses.city       IS 'Must be one of the three supported cities. Enforced by CHECK constraint.';
COMMENT ON COLUMN saved_addresses.is_default IS 'Unique partial index ensures at most one default per user.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE saved_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_addresses: owner full access"
  ON saved_addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saved_addresses: admin read only"
  ON saved_addresses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );
