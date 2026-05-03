/**
 * pricing.service.ts — Server-side shipment price calculation.
 *
 * Mirrors the PostgreSQL calculate_shipment_price() function (migration 011)
 * exactly. Both must produce identical results for the same inputs.
 * If you change pricing logic here, update the SQL function too.
 *
 * All monetary values are in TAMBALA (MWK × 100).
 * Never use floating-point arithmetic for money.
 * All intermediate values are integers; division is done last.
 *
 * Pricing formula:
 *   subtotal = base_price + (distance_km × per_km_rate) +
 *              (max(weight_kg - 1, 0) × weight_rate) +
 *              (is_fragile ? fragile_surcharge : 0)
 *   total    = round(subtotal × size_multiplier / 100)
 *
 * The size_multiplier is in basis points (100 = 1.00×, 150 = 1.50×).
 *
 * INVARIANT: This service ONLY reads from the database (pricing_config table).
 * It NEVER writes anything. It is safe to call from any context.
 *
 * Performance: The active pricing config is loaded from DB on each call.
 * At Phase 1 scale this is ~5ms. If it becomes a hotspot, add a 30-second
 * in-memory cache keyed on the config's id + updated_at timestamp.
 */

import type { PackageSize } from '@courier/shared-types';

import { supabaseServiceRole } from '../config/supabase.js';
import { InternalError } from '../errors/app-error.js';
import { logger } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PricingConfig {
  id:                     string;
  name:                   string;
  base_price_mwk:         number;   // tambala
  per_km_rate_mwk:        number;   // tambala per km
  weight_rate_per_kg_mwk: number;   // tambala per kg above first 1kg
  fragile_surcharge_mwk:  number;   // tambala flat
  small_multiplier_bp:    number;   // basis points (100 = 1.00×)
  medium_multiplier_bp:   number;
  large_multiplier_bp:    number;
  effective_from:         string;
}

export interface PriceBreakdown {
  // Itemized components — all in tambala
  base_price_mwk:        number;
  distance_charge_mwk:   number;
  weight_charge_mwk:     number;
  fragile_surcharge_mwk: number;
  size_multiplier_bp:    number;
  subtotal_before_size:  number;
  total_mwk:             number;

  // Context
  distance_km:           number;
  weight_kg:             number;
  package_size:          PackageSize;
  is_fragile:            boolean;
  config_id:             string;
  config_name:           string;
}

export interface QuoteInput {
  pickup_city:   string;
  delivery_city: string;
  weight_kg:     number;
  is_fragile:    boolean;
  distance_km:   number;   // Pre-calculated by geo service
  package_size:  PackageSize;
}

// ─── Pricing config loader ────────────────────────────────────────────────────

let _configCache: { config: PricingConfig; cachedAt: number } | null = null;
const CONFIG_CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Load the active pricing configuration from the database.
 * Caches for 30 seconds to avoid a DB round-trip on every price calculation.
 * Cache is busted when the config changes (new row with is_active = TRUE).
 *
 * Throws InternalError if no active config exists — this should never happen
 * after migration 011 runs.
 */
export async function loadActivePricingConfig(bypassCache = false): Promise<PricingConfig> {
  const now = Date.now();

  if (
    !bypassCache &&
    _configCache &&
    now - _configCache.cachedAt < CONFIG_CACHE_TTL_MS
  ) {
    return _configCache.config;
  }

  const { data, error } = await supabaseServiceRole()
    .from('pricing_config')
    .select(
      'id, name, base_price_mwk, per_km_rate_mwk, weight_rate_per_kg_mwk, ' +
      'fragile_surcharge_mwk, small_multiplier_bp, medium_multiplier_bp, ' +
      'large_multiplier_bp, effective_from',
    )
    .eq('is_active', true)
    .single();

  if (error || !data) {
    logger.error(
      { error: error?.message },
      'No active pricing config found — migration 011 may not have run',
    );
    throw new InternalError(
      'Pricing configuration is not available. Contact support.',
    );
  }

  const config: PricingConfig = {
    id:                     data.id as string,
    name:                   data.name as string,
    base_price_mwk:         data.base_price_mwk as number,
    per_km_rate_mwk:        data.per_km_rate_mwk as number,
    weight_rate_per_kg_mwk: data.weight_rate_per_kg_mwk as number,
    fragile_surcharge_mwk:  data.fragile_surcharge_mwk as number,
    small_multiplier_bp:    data.small_multiplier_bp as number,
    medium_multiplier_bp:   data.medium_multiplier_bp as number,
    large_multiplier_bp:    data.large_multiplier_bp as number,
    effective_from:         data.effective_from as string,
  };

  _configCache = { config, cachedAt: now };
  logger.debug({ configId: config.id, configName: config.name }, 'Pricing config loaded');

  return config;
}

// ─── Pure pricing calculation ─────────────────────────────────────────────────
// This function is pure: same inputs always produce same outputs.
// No DB calls, no side effects. Unit-testable without mocking.

/**
 * Calculate the price for a shipment given a config and input parameters.
 * All monetary values are in tambala (MWK × 100).
 *
 * Algorithm matches calculate_shipment_price() PostgreSQL function exactly.
 * If these diverge, shipment prices will be inconsistent.
 */
export function calculatePrice(
  config: PricingConfig,
  input: {
    distance_km:  number;
    weight_kg:    number;
    package_size: PackageSize;
    is_fragile:   boolean;
  },
): PriceBreakdown {
  const { distance_km, weight_kg, package_size, is_fragile } = input;

  // ── Base price: flat fee per shipment ──────────────────────────────────────
  const base_price_mwk = config.base_price_mwk;

  // ── Distance charge: per km × distance ────────────────────────────────────
  // distance_km is already rounded to whole km by geo service
  const distance_charge_mwk = Math.round(distance_km) * config.per_km_rate_mwk;

  // ── Weight charge: per kg above the first 1kg ─────────────────────────────
  // First 1kg is included in the base price.
  // Use integer arithmetic: multiply weight_kg by 10, compare against 10,
  // to avoid floating-point issues with numbers like 1.1, 2.3, etc.
  const weight_kg_above_1 = Math.max(weight_kg - 1.0, 0);
  // Round to nearest tambala to avoid accumulating floating-point error
  const weight_charge_mwk = Math.round(weight_kg_above_1 * config.weight_rate_per_kg_mwk);

  // ── Fragile surcharge: flat addition ──────────────────────────────────────
  const fragile_surcharge_mwk = is_fragile ? config.fragile_surcharge_mwk : 0;

  // ── Subtotal (before size multiplier) ─────────────────────────────────────
  const subtotal_before_size =
    base_price_mwk + distance_charge_mwk + weight_charge_mwk + fragile_surcharge_mwk;

  // ── Size multiplier in basis points ───────────────────────────────────────
  // 100 bp = 1.00× (no change), 120 bp = 1.20× (20% surcharge), etc.
  const size_multiplier_bp =
    package_size === 'small'  ? config.small_multiplier_bp :
    package_size === 'medium' ? config.medium_multiplier_bp :
                                config.large_multiplier_bp;

  // ── Total: subtotal × (multiplier / 100), rounded to nearest tambala ──────
  // Division is done LAST, once, to minimize floating-point accumulation.
  const total_mwk = Math.round((subtotal_before_size * size_multiplier_bp) / 100);

  return {
    base_price_mwk,
    distance_charge_mwk,
    weight_charge_mwk,
    fragile_surcharge_mwk,
    size_multiplier_bp,
    subtotal_before_size,
    total_mwk,
    distance_km,
    weight_kg,
    package_size,
    is_fragile,
    config_id:   config.id,
    config_name: config.name,
  };
}

// ─── Convenience: load config + calculate in one call ─────────────────────────

/**
 * Full pricing flow: load active config → calculate → return breakdown.
 * Use this in route handlers.
 */
export async function calculateShipmentPrice(input: {
  distance_km:  number;
  weight_kg:    number;
  package_size: PackageSize;
  is_fragile:   boolean;
}): Promise<PriceBreakdown> {
  const config = await loadActivePricingConfig();
  return calculatePrice(config, input);
}

// ─── Cache management ─────────────────────────────────────────────────────────
// Used in tests and when pricing config is updated.

export function bustPricingConfigCache(): void {
  _configCache = null;
}
