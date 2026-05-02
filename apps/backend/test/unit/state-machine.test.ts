/**
 * state-machine.test.ts — Shipment state machine unit tests.
 *
 * Tests the ALLOWED_TRANSITIONS constant from shared-constants.
 * This verifies that the business rules documented in PHASE_1_ARCHITECTURE.md
 * are actually enforced by the data structure.
 *
 * Run: npm run test -- --filter state-machine
 */

import { describe, it, expect } from 'vitest';
import { ALLOWED_TRANSITIONS } from '@courier/shared-constants';
import type { ShipmentStatus } from '@courier/shared-types';

describe('ShipmentStatus state machine', () => {

  // ─── Terminal state tests ─────────────────────────────────────────────────
  describe('Terminal states have no outgoing transitions', () => {
    const terminalStates: ShipmentStatus[] = ['confirmed', 'rejected', 'cancelled'];

    for (const state of terminalStates) {
      it(`${state} has no allowed transitions`, () => {
        expect(ALLOWED_TRANSITIONS[state]).toHaveLength(0);
      });
    }
  });

  // ─── Happy path ───────────────────────────────────────────────────────────
  describe('Happy path transitions are allowed', () => {
    const happyPath: Array<[ShipmentStatus, ShipmentStatus]> = [
      ['pending_approval',  'approved'],
      ['approved',          'payment_pending'],
      ['payment_pending',   'payment_confirmed'],
      ['payment_confirmed', 'picked_up'],
      ['picked_up',         'in_transit'],
      ['in_transit',        'delivered'],
      ['delivered',         'confirmed'],
    ];

    for (const [from, to] of happyPath) {
      it(`${from} → ${to} is allowed`, () => {
        expect(ALLOWED_TRANSITIONS[from]).toContain(to);
      });
    }
  });

  // ─── Rejection path ───────────────────────────────────────────────────────
  describe('Admin rejection path', () => {
    it('pending_approval → rejected is allowed', () => {
      expect(ALLOWED_TRANSITIONS.pending_approval).toContain('rejected');
    });

    it('rejected has no outgoing transitions', () => {
      expect(ALLOWED_TRANSITIONS.rejected).toHaveLength(0);
    });
  });

  // ─── Cancellation paths ───────────────────────────────────────────────────
  describe('Cancellation paths', () => {
    it('approved → cancelled is allowed', () => {
      expect(ALLOWED_TRANSITIONS.approved).toContain('cancelled');
    });

    it('payment_confirmed → cancelled is allowed', () => {
      expect(ALLOWED_TRANSITIONS.payment_confirmed).toContain('cancelled');
    });

    it('picked_up → cancelled is NOT allowed (package already collected)', () => {
      expect(ALLOWED_TRANSITIONS.picked_up).not.toContain('cancelled');
    });

    it('in_transit → cancelled is NOT allowed', () => {
      expect(ALLOWED_TRANSITIONS.in_transit).not.toContain('cancelled');
    });

    it('confirmed → cancelled is NOT allowed (terminal)', () => {
      expect(ALLOWED_TRANSITIONS.confirmed).not.toContain('cancelled');
    });
  });

  // ─── Payment failure recovery ─────────────────────────────────────────────
  describe('Payment failure recovery', () => {
    it('payment_pending → approved is allowed (revert after failure)', () => {
      expect(ALLOWED_TRANSITIONS.payment_pending).toContain('approved');
    });

    it('payment_pending → failed is allowed', () => {
      expect(ALLOWED_TRANSITIONS.payment_pending).toContain('failed');
    });

    it('payment_confirmed → payment_pending is NOT allowed (double-payment attack)', () => {
      expect(ALLOWED_TRANSITIONS.payment_confirmed).not.toContain('payment_pending');
    });
  });

  // ─── Delivery failure ─────────────────────────────────────────────────────
  describe('Delivery failure handling', () => {
    it('in_transit → failed is allowed', () => {
      expect(ALLOWED_TRANSITIONS.in_transit).toContain('failed');
    });

    it('failed → pending_approval is allowed (re-submit)', () => {
      expect(ALLOWED_TRANSITIONS.failed).toContain('pending_approval');
    });

    it('failed has no other transitions besides pending_approval', () => {
      expect(ALLOWED_TRANSITIONS.failed).toHaveLength(1);
      expect(ALLOWED_TRANSITIONS.failed[0]).toBe('pending_approval');
    });
  });

  // ─── Security: forward-only checks ───────────────────────────────────────
  describe('Critical security: payment cannot be bypassed', () => {
    it('approved → picked_up is NOT allowed (payment must happen first)', () => {
      expect(ALLOWED_TRANSITIONS.approved).not.toContain('picked_up');
    });

    it('approved → in_transit is NOT allowed', () => {
      expect(ALLOWED_TRANSITIONS.approved).not.toContain('in_transit');
    });

    it('approved → delivered is NOT allowed', () => {
      expect(ALLOWED_TRANSITIONS.approved).not.toContain('delivered');
    });

    it('payment_pending → picked_up is NOT allowed (confirm payment first)', () => {
      expect(ALLOWED_TRANSITIONS.payment_pending).not.toContain('picked_up');
    });
  });

  // ─── Idempotency: no self-transitions ────────────────────────────────────
  describe('No self-transitions', () => {
    const allStates = Object.keys(ALLOWED_TRANSITIONS) as ShipmentStatus[];

    for (const state of allStates) {
      it(`${state} cannot transition to itself`, () => {
        expect(ALLOWED_TRANSITIONS[state]).not.toContain(state);
      });
    }
  });

  // ─── All states are covered ───────────────────────────────────────────────
  it('ALLOWED_TRANSITIONS covers all 11 shipment states', () => {
    const expectedStates: ShipmentStatus[] = [
      'pending_approval', 'approved', 'payment_pending', 'payment_confirmed',
      'picked_up', 'in_transit', 'delivered', 'confirmed',
      'rejected', 'cancelled', 'failed',
    ];

    const actualStates = Object.keys(ALLOWED_TRANSITIONS).sort();
    expect(actualStates).toEqual(expectedStates.sort());
  });
});
