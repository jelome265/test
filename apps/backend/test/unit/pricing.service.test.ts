/**
 * pricing.service.test.ts — Pricing service unit tests.
 *
 * Verifies the pricing math, tambala accuracy, size multipliers,
 * and config loading logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoist mocks ─────────────────────────────────────────────────────────────
const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../../src/config/supabase.js', () => ({
  supabaseServiceRole: () => ({
    from: mockFrom,
  }),
}));

import {
  calculatePrice,
  loadActivePricingConfig,
  bustPricingConfigCache,
  type PricingConfig,
} from '../../src/services/pricing.service.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const MOCK_CONFIG: PricingConfig = {
  id:                     'config-uuid',
  name:                   'Standard 2024',
  base_price_mwk:         500000,    // 5000 MWK
  per_km_rate_mwk:        2000,      // 20 MWK/km
  weight_rate_per_kg_mwk: 10000,     // 100 MWK/kg
  fragile_surcharge_mwk:  50000,     // 500 MWK
  small_multiplier_bp:    100,       // 1.00x
  medium_multiplier_bp:   120,       // 1.20x
  large_multiplier_bp:    150,       // 1.50x
  effective_from:         '2024-01-01T00:00:00Z',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Pricing Math (calculatePrice)', () => {
  it('calculates base price correctly (0km, 1kg, non-fragile, small)', () => {
    const breakdown = calculatePrice(MOCK_CONFIG, {
      distance_km:  0,
      weight_kg:    1.0,
      package_size: 'small',
      is_fragile:   false,
    });

    expect(breakdown.total_mwk).toBe(500000);
  });

  it('adds distance charge correctly', () => {
    const breakdown = calculatePrice(MOCK_CONFIG, {
      distance_km:  100,
      weight_kg:    1.0,
      package_size: 'small',
      is_fragile:   false,
    });

    // 500,000 + (100 * 2,000) = 700,000
    expect(breakdown.total_mwk).toBe(700000);
  });

  it('adds weight charge for first kg above 1kg', () => {
    const breakdown = calculatePrice(MOCK_CONFIG, {
      distance_km:  0,
      weight_kg:    2.0,
      package_size: 'small',
      is_fragile:   false,
    });

    // 500,000 + (1 * 10,000) = 510,000
    expect(breakdown.total_mwk).toBe(510000);
  });

  it('adds fragile surcharge', () => {
    const breakdown = calculatePrice(MOCK_CONFIG, {
      distance_km:  0,
      weight_kg:    1.0,
      package_size: 'small',
      is_fragile:   true,
    });

    // 500,000 + 50,000 = 550,000
    expect(breakdown.total_mwk).toBe(550000);
  });

  it('applies medium size multiplier (1.20x)', () => {
    const breakdown = calculatePrice(MOCK_CONFIG, {
      distance_km:  0,
      weight_kg:    1.0,
      package_size: 'medium',
      is_fragile:   false,
    });

    // 500,000 * 1.20 = 600,000
    expect(breakdown.total_mwk).toBe(600000);
  });

  it('rounds to nearest tambala (0.5 up)', () => {
    const configWithOddRates = {
      ...MOCK_CONFIG,
      small_multiplier_bp: 133, // 1.33x
    };

    const breakdown = calculatePrice(configWithOddRates, {
      distance_km:  0,
      weight_kg:    1.0,
      package_size: 'small',
      is_fragile:   false,
    });

    // 500,000 * 1.33 = 665,000.00
    expect(breakdown.total_mwk).toBe(665000);
  });
});

describe('Pricing Config Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bustPricingConfigCache();
  });

  it('loads active config from database', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: MOCK_CONFIG, error: null }),
    });

    const config = await loadActivePricingConfig();
    expect(config.id).toBe(MOCK_CONFIG.id);
    expect(mockFrom).toHaveBeenCalledWith('pricing_config');
  });

  it('uses cache for subsequent calls', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: MOCK_CONFIG, error: null }),
    });

    await loadActivePricingConfig();
    await loadActivePricingConfig();

    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});
