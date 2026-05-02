import type { ShipmentStatus } from '@courier/shared-types';

// Human-readable labels for each status
export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending_approval:  'Pending Review',
  approved:          'Approved',
  payment_pending:   'Awaiting Payment',
  payment_confirmed: 'Payment Confirmed',
  picked_up:         'Picked Up',
  in_transit:        'In Transit',
  delivered:         'Delivered',
  confirmed:         'Delivery Confirmed',
  rejected:          'Rejected',
  cancelled:         'Cancelled',
  failed:            'Delivery Failed',
} as const;

// Status descriptions for user-facing copy
export const STATUS_DESCRIPTIONS: Record<ShipmentStatus, string> = {
  pending_approval:  'Your request is being reviewed by our team.',
  approved:          'Your request is approved. Please complete payment to proceed.',
  payment_pending:   'Your payment is being processed.',
  payment_confirmed: 'Payment received. Your package will be picked up shortly.',
  picked_up:         'Your package has been collected by our courier.',
  in_transit:        'Your package is on its way to the destination.',
  delivered:         'Your package has been delivered. Please confirm receipt.',
  confirmed:         'Delivery confirmed. Thank you for using CourierApp.',
  rejected:          'Your request was not approved. Check details for the reason.',
  cancelled:         'This shipment has been cancelled.',
  failed:            'Delivery was unsuccessful. You may re-submit your request.',
} as const;

// Legal transitions — used by both backend state machine and frontend
// to determine which actions to show
export const ALLOWED_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  pending_approval:  ['approved', 'rejected'],
  approved:          ['payment_pending', 'cancelled'],
  payment_pending:   ['payment_confirmed', 'approved', 'failed'],
  payment_confirmed: ['picked_up', 'cancelled'],
  picked_up:         ['in_transit'],
  in_transit:        ['delivered', 'failed'],
  delivered:         ['confirmed'],
  confirmed:         [],
  rejected:          [],
  cancelled:         [],
  failed:            ['pending_approval'],
} as const;

export function isTerminalStatus(status: ShipmentStatus): boolean {
  return ['confirmed', 'rejected', 'cancelled'].includes(status);
}

export function isActiveStatus(status: ShipmentStatus): boolean {
  return [
    'approved',
    'payment_pending',
    'payment_confirmed',
    'picked_up',
    'in_transit',
    'delivered',
  ].includes(status);
}

export function canPay(status: ShipmentStatus): boolean {
  return status === 'approved';
}

export function canConfirm(status: ShipmentStatus): boolean {
  return status === 'delivered';
}

export function canCancel(status: ShipmentStatus): boolean {
  return ['pending_approval', 'approved', 'payment_confirmed'].includes(status);
}
