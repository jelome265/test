/**
 * pricing.test.ts — Pricing utility unit tests.
 *
 * Tests the monetary conversion utilities from shared-constants.
 * These utilities are critical: incorrect conversions silently produce
 * wrong prices charged to customers.
 *
 * Run: npm run test -- --filter pricing
 */

import { describe, it, expect } from 'vitest';
import {
  mkwToTambala,
  tambalaToMwk,
  formatMwk,
  TAMBALA_PER_MWK,
  MAX_WEIGHT_KG,
  MIN_WEIGHT_KG,
  PAYMENT_EXPIRY_MINUTES,
} from '@courier/shared-constants';

describe('Monetary conversion utilities', () => {

  describe('mkwToTambala', () => {
    it('converts whole MWK to tambala', () => {
      expect(mkwToTambala(1)).toBe(100);
      expect(mkwToTambala(10)).toBe(1000);
      expect(mkwToTambala(100)).toBe(10000);
      expect(mkwToTambala(2000)).toBe(200000);
    });

    it('handles fractional MWK correctly (banker rounding via Math.round)', () => {
      expect(mkwToTambala(1.5)).toBe(150);
      expect(mkwToTambala(0.5)).toBe(50);
      expect(mkwToTambala(9.99)).toBe(999);
    });

    it('converts zero correctly', () => {
      expect(mkwToTambala(0)).toBe(0);
    });

    it('handles large amounts without floating-point error', () => {
      // MWK 1,000,000 = 100,000,000 tambala
      expect(mkwToTambala(1_000_000)).toBe(100_000_000);
    });

    it('is the inverse of tambalaToMwk for integer tambala values', () => {
      const testValues = [100, 200, 5000, 200000, 1500000];
      for (const tambala of testValues) {
        expect(mkwToTambala(tambalaToMwk(tambala))).toBe(tambala);
      }
    });
  });

  describe('tambalaToMwk', () => {
    it('converts tambala to MWK', () => {
      expect(tambalaToMwk(100)).toBe(1);
      expect(tambalaToMwk(200000)).toBe(2000);
      expect(tambalaToMwk(50)).toBe(0.5);
    });

    it('converts zero correctly', () => {
      expect(tambalaToMwk(0)).toBe(0);
    });
  });

  describe('formatMwk', () => {
    it('formats round amounts without decimal places', () => {
      // Locale-dependent: test structure, not exact string
      const formatted = formatMwk(200000); // MWK 2,000
      expect(formatted).toContain('MWK');
      expect(formatted).toContain('2');
      expect(formatted).toContain('000');
    });

    it('formats fractional amounts correctly', () => {
      const formatted = formatMwk(150); // MWK 1.50
      expect(formatted).toContain('MWK');
      expect(formatted).toContain('1');
    });

    it('formats zero correctly', () => {
      const formatted = formatMwk(0);
      expect(formatted).toContain('MWK');
      expect(formatted).toContain('0');
    });

    it('always includes MWK prefix', () => {
      expect(formatMwk(100)).toMatch(/^MWK /);
      expect(formatMwk(1000000)).toMatch(/^MWK /);
    });
  });

  describe('Business constants', () => {
    it('TAMBALA_PER_MWK is 100', () => {
      expect(TAMBALA_PER_MWK).toBe(100);
    });

    it('MAX_WEIGHT_KG is 10', () => {
      expect(MAX_WEIGHT_KG).toBe(10.0);
    });

    it('MIN_WEIGHT_KG is 0.1', () => {
      expect(MIN_WEIGHT_KG).toBe(0.1);
    });

    it('PAYMENT_EXPIRY_MINUTES is 30', () => {
      expect(PAYMENT_EXPIRY_MINUTES).toBe(30);
    });
  });

  describe('Floating-point safety', () => {
    it('0.1 + 0.2 in MWK does not cause precision loss in tambala', () => {
      // The classic floating-point landmine: 0.1 + 0.2 !== 0.3 in IEEE 754
      // Working in tambala (integers) avoids this
      const price1 = mkwToTambala(0.1);
      const price2 = mkwToTambala(0.2);
      const total  = price1 + price2;

      // 10 + 20 = 30 (exact integer arithmetic)
      expect(total).toBe(30);
      expect(tambalaToMwk(total)).toBe(0.3);
    });

    it('large price calculations remain exact in tambala', () => {
      // Distance charge: 312 km × MWK 5/km = MWK 1,560 = 156,000 tambala
      const distanceKm    = 312;
      const ratePerKm     = 500; // MWK 5 = 500 tambala
      const distanceCharge = distanceKm * ratePerKm;

      expect(distanceCharge).toBe(156_000);
      expect(tambalaToMwk(distanceCharge)).toBe(1560);
    });
  });
});
