/**
 * shipment-state-machine.ts — Application-layer state machine enforcement.
 *
 * This module is the authoritative source of transition validation for the
 * application layer. It derives its rules from ALLOWED_TRANSITIONS in
 * shared-constants — the same constant used by the mobile app to show/hide
 * action buttons.
 *
 * Two enforcement layers (ADR-022):
 *   1. THIS FILE — fast, no DB round-trip, catches programming errors early
 *   2. admin_transition_shipment() SQL RPC — handles concurrent modifications
 *
 * Usage:
 *   // Will throw BusinessRuleError if transition is invalid
 *   validateTransition('approved', 'picked_up');
 *
 *   // Use in service layer before any DB call
 *   validateTransition(currentShipment.status, requestedStatus);
 *
 * Role-based transition authority:
 *   - 'customer': can only confirm delivery (delivered → confirmed) and cancel
 *     (pending_approval, approved → cancelled)
 *   - 'admin' / 'super_admin': all other transitions
 *
 * Customer cancellation is handled separately (PATCH /:id/cancel) to give
 * a better UX than the generic admin transition endpoint.
 */

import { ALLOWED_TRANSITIONS } from '@courier/shared-constants';
import type { ShipmentStatus, UserRole } from '@courier/shared-types';

import { BusinessRuleError, AuthorizationError } from '../errors/app-error.js';

// ─── Transition validation ────────────────────────────────────────────────────

/**
 * Validate that a status transition is permitted by the state machine.
 * Throws BusinessRuleError if the transition is invalid.
 *
 * @param from - Current shipment status
 * @param to   - Requested new status
 */
export function validateTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  const allowed = (ALLOWED_TRANSITIONS as any)[from];

  if (!allowed || !allowed.includes(to)) {
    const allowedStr = allowed?.length
      ? `Allowed transitions from '${from}': ${allowed.join(', ')}`
      : `'${from}' is a terminal state with no allowed transitions.`;

    throw new BusinessRuleError(
      `Cannot transition shipment from '${from}' to '${to}'. ${allowedStr}`,
      'INVALID_STATE_TRANSITION',
    );
  }
}

// ─── Role-based transition authority ─────────────────────────────────────────

/**
 * The set of transitions that a customer (non-admin) is permitted to make.
 * All other transitions require admin or super_admin role.
 */
const CUSTOMER_ALLOWED_TRANSITIONS: Partial<Record<ShipmentStatus, ShipmentStatus[]>> = {
  delivered:          ['confirmed'],  // Customer confirms receipt
  pending_approval:   ['cancelled'],  // Customer cancels before review
  approved:           ['cancelled'],  // Customer cancels after approval but before payment
  payment_confirmed:  ['cancelled'],  // Customer cancels after payment (before pickup)
};

/**
 * Validate that the requesting user's role is authorized to make a transition.
 * Throws AuthorizationError if the role is not permitted.
 *
 * INVARIANT: Call validateTransition() first to ensure the transition is
 * mechanically valid before checking role authority. Role check is secondary
 * to the state machine rules.
 *
 * @param from       - Current shipment status
 * @param to         - Requested new status
 * @param actorRole  - The role of the requesting user
 */
export function validateTransitionAuthority(
  from:      ShipmentStatus,
  to:        ShipmentStatus,
  actorRole: UserRole,
): void {
  if (actorRole === 'admin' || actorRole === 'super_admin') {
    return; // Admins can make any valid transition
  }

  // Customer role: check against the allowed customer transitions
  const customerAllowed = CUSTOMER_ALLOWED_TRANSITIONS[from];

  if (!customerAllowed || !customerAllowed.includes(to)) {
    throw new AuthorizationError(
      `Customers cannot transition shipments from '${from}' to '${to}'. ` +
      `This transition requires admin privileges.`,
    );
  }
}

// ─── Business rule predicates ─────────────────────────────────────────────────
// Derived from the state machine — single source of truth.

/** Returns true if the shipment is in a state where the customer can cancel. */
export function canCustomerCancel(status: ShipmentStatus): boolean {
  const allowed = CUSTOMER_ALLOWED_TRANSITIONS[status];
  return allowed?.includes('cancelled') ?? false;
}

/** Returns true if the shipment requires payment to proceed. */
export function requiresPayment(status: ShipmentStatus): boolean {
  return status === 'approved';
}

/** Returns true if the shipment has been collected by a courier. */
export function isInProgress(status: ShipmentStatus): boolean {
  return ['picked_up', 'in_transit', 'delivered'].includes(status);
}

/** Returns true if the shipment has completed the full lifecycle. */
export function isTerminal(status: ShipmentStatus): boolean {
  return ['confirmed', 'rejected', 'cancelled'].includes(status);
}

// ─── Admin transition with context ───────────────────────────────────────────

export interface TransitionContext {
  notes?:            string;
  rejection_reason?: string;
}

/**
 * Validate all preconditions for an admin status transition.
 * Throws appropriate errors if any precondition fails.
 *
 * Call this BEFORE the DB call to catch issues early with good error messages.
 *
 * @param currentStatus - Current status loaded from DB
 * @param targetStatus  - Requested transition target
 * @param actorRole     - The role of the requesting admin
 * @param context       - Additional context (notes, rejection reason, etc.)
 */
export function validateAdminTransition(
  currentStatus: ShipmentStatus,
  targetStatus:  ShipmentStatus,
  actorRole:     UserRole,
  context:       TransitionContext = {},
): void {
  // 1. Check state machine rules
  validateTransition(currentStatus, targetStatus);

  // 2. Check role authority
  validateTransitionAuthority(currentStatus, targetStatus, actorRole);

  // 3. Business-rule preconditions beyond the state machine

  // Rejection requires a reason
  if (targetStatus === 'rejected' && (!context.rejection_reason?.trim())) {
    throw new BusinessRuleError(
      'A rejection reason is required when rejecting a shipment.',
      'REJECTION_REASON_REQUIRED',
    );
  }

  // Cannot move to picked_up without payment confirmed
  // This is enforced by the state machine (payment_confirmed → picked_up),
  // but an extra explicit check here improves the error message.
  if (targetStatus === 'picked_up' && currentStatus !== 'payment_confirmed') {
    throw new BusinessRuleError(
      'Shipment cannot be marked as picked up without confirmed payment. ' +
      `Current status is '${currentStatus}'.`,
      'PAYMENT_NOT_CONFIRMED',
    );
  }
}
