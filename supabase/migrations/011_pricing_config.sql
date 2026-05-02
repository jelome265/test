-- ═══════════════════════════════════════════════════════════════════
-- 011 — PRICING CONFIG
-- Versioned, temporal pricing rules.
-- Active config: is_active = TRUE. Only one active config at a time.
-- All monetary values in tambala (MWK × 100).
-- Change pricing by inserting a new row + deactivating the old one.
-- NEVER update or delete existing config rows (historical quotes depend on them).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE pricing_config (
  id                      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ─── Version label ──────────────────────────────────────────────
  name                    TEXT        NOT NULL UNIQUE,    -- e.g. 'v1', 'v2-fuel-surcharge'
  description             TEXT,

  -- ─── Base rate ──────────────────────────────────────────────────
  -- Applied to every shipment regardless of distance or weight.
  base_price_mwk          INTEGER     NOT NULL
    CONSTRAINT pricing_base_price_positive CHECK (base_price_mwk > 0),

  -- ─── Distance rate ──────────────────────────────────────────────
  -- Per-km charge applied to the road distance between cities.
  per_km_rate_mwk         INTEGER     NOT NULL
    CONSTRAINT pricing_per_km_rate_positive CHECK (per_km_rate_mwk > 0),

  -- ─── Weight surcharge ───────────────────────────────────────────
  -- Applied per kg above the first 1kg (first kg included in base).
  weight_rate_per_kg_mwk  INTEGER     NOT NULL DEFAULT 0
    CONSTRAINT pricing_weight_rate_gte_zero CHECK (weight_rate_per_kg_mwk >= 0),

  -- ─── Fragile surcharge ──────────────────────────────────────────
  -- Flat surcharge applied when is_fragile = TRUE.
  fragile_surcharge_mwk   INTEGER     NOT NULL DEFAULT 0
    CONSTRAINT pricing_fragile_surcharge_gte_zero CHECK (fragile_surcharge_mwk >= 0),

  -- ─── Size multipliers ────────────────────────────────────────────
  -- Multiplier in basis points (100 = 1.00x, 150 = 1.50x).
  -- Avoids NUMERIC; integer arithmetic only.
  small_multiplier_bp     INTEGER     NOT NULL DEFAULT 100
    CONSTRAINT pricing_small_mult_positive CHECK (small_multiplier_bp > 0),
  medium_multiplier_bp    INTEGER     NOT NULL DEFAULT 120
    CONSTRAINT pricing_medium_mult_positive CHECK (medium_multiplier_bp > 0),
  large_multiplier_bp     INTEGER     NOT NULL DEFAULT 150
    CONSTRAINT pricing_large_mult_positive CHECK (large_multiplier_bp > 0),

  -- ─── Active flag and temporal bounds ────────────────────────────
  is_active               BOOLEAN     NOT NULL DEFAULT FALSE,
  effective_from          TIMESTAMPTZ NOT NULL,
  effective_to            TIMESTAMPTZ,

  -- ─── Timestamps ─────────────────────────────────────────────────
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              UUID
    REFERENCES user_profiles(id) ON DELETE SET NULL,

  CONSTRAINT pricing_config_dates_order
    CHECK (effective_to IS NULL OR effective_from < effective_to)
);

-- Only one active config at a time
CREATE UNIQUE INDEX idx_pricing_config_one_active
  ON pricing_config (is_active)
  WHERE is_active = TRUE;

-- Lookup index for temporal queries
CREATE INDEX idx_pricing_config_effective ON pricing_config (effective_from, effective_to);

-- ─── Seed: initial pricing config ────────────────────────────────
-- Base: MWK 2,000 = 200,000 tambala
-- Per km: MWK 5 = 500 tambala
-- Weight: MWK 200/kg above 1kg = 20,000 tambala
-- Fragile: MWK 500 flat = 50,000 tambala
-- Adjust these values to match actual business pricing.
INSERT INTO pricing_config (
  name,
  description,
  base_price_mwk,
  per_km_rate_mwk,
  weight_rate_per_kg_mwk,
  fragile_surcharge_mwk,
  small_multiplier_bp,
  medium_multiplier_bp,
  large_multiplier_bp,
  is_active,
  effective_from
) VALUES (
  'v1',
  'Initial Phase 1 pricing. Base + distance + weight + fragile surcharge.',
  200000,    -- MWK 2,000 base
  500,       -- MWK 5/km
  20000,     -- MWK 200/kg (above 1kg)
  50000,     -- MWK 500 fragile surcharge
  100,       -- small: 1.00x
  120,       -- medium: 1.20x
  150,       -- large: 1.50x
  TRUE,
  NOW()
);

-- Comments
COMMENT ON TABLE  pricing_config                  IS 'Versioned pricing rules. One active config. All money in tambala. Never delete rows.';
COMMENT ON COLUMN pricing_config.name             IS 'Human-readable version label. Use for audit trail references.';
COMMENT ON COLUMN pricing_config.base_price_mwk   IS 'Flat fee per shipment in tambala. Applied before distance/weight/fragile.';
COMMENT ON COLUMN pricing_config.small_multiplier_bp IS 'Size multiplier in basis points. 100 = 1.00×, 150 = 1.50×.';

-- ─── Pricing calculation function ─────────────────────────────────
-- Called by the backend pricing.service.ts to verify quote integrity.
-- Can also be called directly in DB for data repair.
CREATE OR REPLACE FUNCTION calculate_shipment_price(
  p_distance_km      INTEGER,
  p_weight_kg        NUMERIC,
  p_size             package_size,
  p_is_fragile       BOOLEAN,
  p_config_id        UUID DEFAULT NULL  -- NULL = use active config
)
RETURNS TABLE (
  config_id              UUID,
  base_price_mwk         INTEGER,
  distance_charge_mwk    INTEGER,
  weight_charge_mwk      INTEGER,
  fragile_surcharge_mwk  INTEGER,
  size_multiplier_bp     INTEGER,
  subtotal_before_size   INTEGER,
  total_mwk              INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_config pricing_config%ROWTYPE;
  v_weight_above_1kg NUMERIC;
  v_base             INTEGER;
  v_distance_charge  INTEGER;
  v_weight_charge    INTEGER;
  v_fragile          INTEGER;
  v_multiplier       INTEGER;
  v_subtotal         INTEGER;
  v_total            INTEGER;
BEGIN
  -- Load config
  IF p_config_id IS NOT NULL THEN
    SELECT * INTO v_config FROM pricing_config WHERE id = p_config_id;
  ELSE
    SELECT * INTO v_config FROM pricing_config WHERE is_active = TRUE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pricing config found';
  END IF;

  -- Calculate components
  v_base            := v_config.base_price_mwk;
  v_distance_charge := p_distance_km * v_config.per_km_rate_mwk;

  -- Weight charge: first 1kg is free (included in base)
  v_weight_above_1kg := GREATEST(p_weight_kg - 1.0, 0);
  v_weight_charge    := ROUND(v_weight_above_1kg * v_config.weight_rate_per_kg_mwk);

  v_fragile := CASE WHEN p_is_fragile THEN v_config.fragile_surcharge_mwk ELSE 0 END;

  -- Size multiplier
  v_multiplier := CASE p_size
    WHEN 'small'  THEN v_config.small_multiplier_bp
    WHEN 'medium' THEN v_config.medium_multiplier_bp
    WHEN 'large'  THEN v_config.large_multiplier_bp
  END;

  -- Calculate total (multiply subtotal by size multiplier, in basis points)
  v_subtotal := v_base + v_distance_charge + v_weight_charge + v_fragile;
  v_total    := ROUND(v_subtotal::NUMERIC * v_multiplier / 100.0);

  RETURN QUERY SELECT
    v_config.id,
    v_base,
    v_distance_charge,
    v_weight_charge,
    v_fragile,
    v_multiplier,
    v_subtotal,
    v_total;
END;
$$;

COMMENT ON FUNCTION calculate_shipment_price IS
  'Returns an itemized price breakdown for a shipment.
   Uses active pricing config by default.
   All returned values are in tambala (MWK × 100).
   Mirror of PricingService.calculatePrice() in the backend.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read pricing (needed for quote screen)
CREATE POLICY "pricing_config: authenticated read"
  ON pricing_config FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only super_admin can insert/update pricing configs
CREATE POLICY "pricing_config: super_admin write"
  ON pricing_config FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'super_admin'
    )
  );

CREATE POLICY "pricing_config: super_admin update"
  ON pricing_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'super_admin'
    )
  );
