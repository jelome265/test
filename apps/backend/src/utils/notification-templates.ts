/**
 * notification-templates.ts — Type-safe notification template resolver.
 *
 * Maps a NotificationType + TemplateContext → { title, body, screen }.
 * The screen field is an Expo Router href used for deep linking when
 * the customer taps the push notification.
 *
 * INVARIANT: Every NotificationType must have a case in resolveTemplate().
 * TypeScript's exhaustiveness check (never type) enforces this at compile time.
 * Adding a new NotificationType without adding a template causes a type error.
 *
 * Template guidelines:
 *   - Title: ≤ 65 characters (iOS truncates longer titles in lock screen)
 *   - Body:  ≤ 178 characters (iOS truncates, Android wraps)
 *   - Use emoji sparingly — improves scannability on lock screen
 *   - Never include PII in body (names, phone numbers, addresses)
 *   - Tracking numbers are OK — they are not sensitive
 */

import type { NotificationType } from '@courier/shared-types';

// ─── Template context ─────────────────────────────────────────────────────────

export interface TemplateContext {
  /** UUID of the shipment — used for deep link construction */
  shipmentId?:      string | undefined;
  /** Tracking number e.g. CRR-20240101-A3F9C2 */
  trackingNumber?:  string | undefined;
  /** Pickup city e.g. Lilongwe */
  pickupCity?:      string | undefined;
  /** Delivery city e.g. Blantyre */
  deliveryCity?:    string | undefined;
  /** Admin-provided rejection reason */
  rejectionReason?: string | undefined;
}

// ─── Resolved template ────────────────────────────────────────────────────────

export interface NotificationTemplate {
  /** Push notification title (shown in OS notification shade) */
  title:  string;
  /** Push notification body (shown below title) */
  body:   string;
  /** Expo Router href — screen to open when notification is tapped */
  screen: string;
}

// ─── Deep link helpers ────────────────────────────────────────────────────────

function shipmentScreen(shipmentId: string | undefined): string {
  return shipmentId
    ? `/(app)/shipments/${shipmentId}`
    : '/(app)/shipments';
}

function adminShipmentScreen(shipmentId: string | undefined): string {
  return shipmentId
    ? `/(admin)/shipments/${shipmentId}`
    : '/(admin)/shipments';
}

// ─── Template resolver ────────────────────────────────────────────────────────

/**
 * Resolve a notification template for the given type and context.
 * Guaranteed to return a template for every valid NotificationType.
 */
export function resolveTemplate(
  type: NotificationType,
  ctx:  TemplateContext,
): NotificationTemplate {
  const ref = ctx.trackingNumber ?? 'Your shipment';

  switch (type) {
    case 'shipment_created':
      return {
        title:  'Delivery Request Received',
        body:   'Your request is under review. We\'ll notify you once it\'s approved.',
        screen: shipmentScreen(ctx.shipmentId),
      };

    case 'shipment_approved':
      return {
        title:  'Request Approved ✓',
        body:   `${ref} approved. Please complete payment to proceed.`,
        screen: shipmentScreen(ctx.shipmentId),
      };

    case 'shipment_rejected': {
      const reason = ctx.rejectionReason
        ? `: ${ctx.rejectionReason.substring(0, 80)}`
        : '. Please contact support for details.';
      return {
        title:  'Request Not Approved',
        body:   `${ref} was not approved${reason}`,
        screen: shipmentScreen(ctx.shipmentId),
      };
    }

    case 'payment_confirmed':
      return {
        title:  'Payment Confirmed ✓',
        body:   'Payment received. Your package will be collected shortly.',
        screen: shipmentScreen(ctx.shipmentId),
      };

    case 'payment_failed':
      return {
        title:  'Payment Unsuccessful',
        body:   'Your payment was not completed. Please try again from the app.',
        screen: shipmentScreen(ctx.shipmentId),
      };

    case 'shipment_picked_up':
      return {
        title:  'Package Collected 📦',
        body:   `${ref} has been collected and is on its way.`,
        screen: shipmentScreen(ctx.shipmentId),
      };

    case 'shipment_in_transit': {
      const dest = ctx.deliveryCity ? ` to ${ctx.deliveryCity}` : '';
      return {
        title:  'Package In Transit 🚚',
        body:   `${ref} is on its way${dest}.`,
        screen: shipmentScreen(ctx.shipmentId),
      };
    }

    case 'shipment_delivered':
      return {
        title:  'Package Delivered ✓',
        body:   `${ref} has been delivered. Please confirm receipt in the app.`,
        screen: shipmentScreen(ctx.shipmentId),
      };

    case 'shipment_confirmed':
      return {
        title:  'Delivery Confirmed',
        body:   `${ref} confirmed. Thank you for choosing CourierApp.`,
        screen: '/(app)/shipments',
      };

    case 'admin_new_request': {
      const route =
        ctx.pickupCity && ctx.deliveryCity
          ? `${ctx.pickupCity} → ${ctx.deliveryCity}`
          : 'new route';
      return {
        title:  'New Delivery Request 📬',
        body:   `${ref}: ${route}. Tap to review and approve.`,
        screen: adminShipmentScreen(ctx.shipmentId),
      };
    }

    default: {
      // TypeScript exhaustiveness check — compile error if NotificationType grows
      const _exhaustiveCheck: never = type;
      void _exhaustiveCheck;
      return {
        title:  'Courier Update',
        body:   'You have a new update from CourierApp.',
        screen: '/(app)',
      };
    }
  }
}

/**
 * Build the JSONB data payload attached to FCM messages and stored in
 * app_notifications.data. Used by the mobile app for deep-link navigation.
 */
export function buildNotificationData(
  type:         NotificationType,
  template:     NotificationTemplate,
  shipmentId?:  string,
): Record<string, string> {
  return {
    notification_type: type,
    screen:            template.screen,
    shipment_id:       shipmentId ?? '',
  };
}
