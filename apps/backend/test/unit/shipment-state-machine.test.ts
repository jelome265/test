/**
 * shipment-state-machine.test.ts — State machine unit tests.
 *
 * Verifies that all valid transitions are allowed and invalid ones are blocked.
 */

import { describe, it, expect } from 'vitest';
import {
  validateTransition,
  validateTransitionAuthority,
  canCustomerCancel,
} from '../../src/services/shipment-state-machine.js';
import { BusinessRuleError, AuthorizationError } from '../../src/errors/app-error.js';

describe('Shipment State Machine', () => {
  describe('validateTransition', () => {
    it('allows valid transition: pending_approval -> approved', () => {
      expect(() => validateTransition('pending_approval', 'approved')).not.toThrow();
    });

    it('allows valid transition: approved -> payment_pending', () => {
      expect(() => validateTransition('approved', 'payment_pending')).not.toThrow();
    });

    it('allows valid transition: payment_pending -> payment_confirmed', () => {
      expect(() => validateTransition('payment_pending', 'payment_confirmed')).not.toThrow();
    });

    it('blocks invalid transition: pending_approval -> picked_up', () => {
      expect(() => validateTransition('pending_approval', 'picked_up')).toThrow(BusinessRuleError);
    });

    it('blocks invalid transition: delivered -> picked_up', () => {
      expect(() => validateTransition('delivered', 'picked_up')).toThrow(BusinessRuleError);
    });
  });

  describe('validateTransitionAuthority', () => {
    it('allows admin to make any valid transition', () => {
      expect(() => validateTransitionAuthority('pending_approval', 'approved', 'admin')).not.toThrow();
    });

    it('allows customer to confirm delivery (delivered -> confirmed)', () => {
      expect(() => validateTransitionAuthority('delivered', 'confirmed', 'customer')).not.toThrow();
    });

    it('allows customer to cancel (pending_approval -> cancelled)', () => {
      expect(() => validateTransitionAuthority('pending_approval', 'cancelled', 'customer')).not.toThrow();
    });

    it('blocks customer from approving (pending_approval -> approved)', () => {
      expect(() => validateTransitionAuthority('pending_approval', 'approved', 'customer')).toThrow(AuthorizationError);
    });

    it('blocks customer from marking picked_up', () => {
      expect(() => validateTransitionAuthority('payment_confirmed', 'picked_up', 'customer')).toThrow(AuthorizationError);
    });
  });

  describe('canCustomerCancel', () => {
    it('returns true for pending_approval', () => {
      expect(canCustomerCancel('pending_approval')).toBe(true);
    });

    it('returns true for approved', () => {
      expect(canCustomerCancel('approved')).toBe(true);
    });

    it('returns false for picked_up', () => {
      expect(canCustomerCancel('picked_up')).toBe(false);
    });

    it('returns false for terminal states', () => {
      expect(canCustomerCancel('confirmed')).toBe(false);
    });
  });
});
