/**
 * geo.service.test.ts — Geo service unit tests.
 *
 * Verifies inter-city distance lookups and same-city defaults.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calculateDistance,
} from '../../src/services/geo.service.js';
import {
  INTER_CITY_DISTANCES_KM,
  DEFAULT_SAME_CITY_DISTANCE_KM,
} from '@courier/shared-constants';

describe('Geo Distance Calculation', () => {
  it('uses preset table for inter-city delivery (Lilongwe-Blantyre)', async () => {
    const result = await calculateDistance({
      pickup_city:   'Lilongwe',
      delivery_city: 'Blantyre',
    });

    expect(result.distance_km).toBe(INTER_CITY_DISTANCES_KM['Lilongwe-Blantyre']);
    expect(result.source).toBe('preset_table');
  });

  it('uses preset table for inter-city delivery (Blantyre-Lilongwe)', async () => {
    const result = await calculateDistance({
      pickup_city:   'Blantyre',
      delivery_city: 'Lilongwe',
    });

    expect(result.distance_km).toBe(INTER_CITY_DISTANCES_KM['Blantyre-Lilongwe']);
    expect(result.source).toBe('preset_table');
  });

  it('uses same-city default for same city (Lilongwe-Lilongwe)', async () => {
    const result = await calculateDistance({
      pickup_city:   'Lilongwe',
      delivery_city: 'Lilongwe',
    });

    expect(result.distance_km).toBe(DEFAULT_SAME_CITY_DISTANCE_KM);
    expect(result.source).toBe('same_city_default');
  });
});
