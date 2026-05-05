/**
 * notification.service.ts — Notification lifecycle business logic.
 *
 * Responsibilities:
 *   - Event triggers: create DB notification + enqueue push job for every
 *     shipment/payment event (called by shipment.service and payment.service)
 *   - Fan-out: create one notification per active admin for new shipments
 *   - List: paginated cursor-based listing for the in-app inbox
 *   - Unread count: badge count for mobile tab bar
 *   - Mark read: single or all-at-once
 *
 * FIRE-AND-FORGET CONTRACT:
 *   All public notify*() methods are designed to be called as fire-and-forget:
 *     notificationService.notifyShipmentCreated(id).catch(logger.error)
 *   Errors in notification creation must NEVER propagate to and fail the
 *   calling business operation (shipment creation, payment processing, etc.).
 *
 * IDEMPOTENCY:
 *   - DB uniqueness is not enforced per (userId, type, shipmentId) — duplicate
 *     notifications are allowed (e.g. admin submits twice). This is intentional:
 *     business logic in the calling services prevents duplicate events.
 *   - BullMQ job IDs (`notif_${notificationId}`) prevent duplicate push dispatch.
 *
 * ADMIN FAN-OUT:
 *   When a shipment is created, one app_notifications row is created per active
 *   admin/super_admin. Promise.allSettled() ensures failure for one admin
 *   does not block notification of the remaining admins.
 *
 * DB ACCESS PATTERN:
 *   All writes use supabaseServiceRole() — service bypasses RLS.
 *   Reads in listNotifications/getUnreadCount also use service role with
 *   explicit userId filter — the HTTP layer enforces ownership.
 */

import type { NotificationType, AppNotification , ShipmentStatus } from '@courier/shared-types';


import { supabaseServiceRole } from '../config/supabase.js';
import { NotFoundError, mapSupabaseError } from '../errors/app-error.js';
import { enqueueNotificationPush } from '../queues/notification.queue.js';
import { logger } from '../utils/logger.js';
import {
  resolveTemplate,
  buildNotificationData,
  type TemplateContext,
} from '../utils/notification-templates.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListNotificationsOptions {
  /** Cursor from a previous response (base64url encoded) */
  cursor?:       string | undefined;
  /** Number of records to return (default 20, max 50) */
  limit?:        number | undefined;
  /** If true, return only unread notifications */
  unread_only?:  boolean | undefined;
}

export interface ListNotificationsResult {
  data:        AppNotification[];
  next_cursor: string | null;
  unread_count: number;
}

// ─── Cursor helpers ───────────────────────────────────────────────────────────

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ created_at: createdAt, id })).toString('base64url');
}

function decodeCursor(cursor: string): { created_at: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    const obj = JSON.parse(raw) as unknown;
    if (
      typeof obj === 'object' &&
      obj !== null &&
      'created_at' in obj &&
      'id' in obj &&
      typeof (obj as Record<string, unknown>)['created_at'] === 'string' &&
      typeof (obj as Record<string, unknown>)['id'] === 'string'
    ) {
      return obj as { created_at: string; id: string };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Status → notification type map ──────────────────────────────────────────

const STATUS_TO_NOTIFICATION: Partial<Record<ShipmentStatus, NotificationType>> = {
  approved:    'shipment_approved',
  rejected:    'shipment_rejected',
  picked_up:   'shipment_picked_up',
  in_transit:  'shipment_in_transit',
  delivered:   'shipment_delivered',
  confirmed:   'shipment_confirmed',
};

// ─── Notification Service ─────────────────────────────────────────────────────

class NotificationService {

  // ─── Core: create DB record + enqueue push ────────────────────────────────

  /**
   * Create an app_notifications row and enqueue a push dispatch job.
   *
   * DB write is synchronous and guaranteed.
   * Queue enqueue is async — failure is logged, NOT propagated.
   * This ensures the inbox record is always created even if Redis is down.
   */
  private async createAndEnqueue(
    userId:     string,
    type:       NotificationType,
    ctx:        TemplateContext,
  ): Promise<void> {
    const template = resolveTemplate(type, ctx);
    const data     = buildNotificationData(type, template, ctx.shipmentId);

    const { data: notification, error } = await supabaseServiceRole()
      .from('app_notifications')
      .insert({
        user_id:    userId,
        shipment_id: ctx.shipmentId ?? null,
        type,
        title:      template.title,
        body:       template.body,
        data,
      })
      .select('id')
      .single();

    if (error || !notification) {
      logger.error(
        { error: error?.message, userId, type },
        'Failed to create app_notifications record',
      );
      return;
    }

    const notificationId = notification.id as string;

    // Enqueue push — failure is non-fatal (inbox record already exists)
    enqueueNotificationPush(notificationId).catch((err: Error) => {
      logger.error(
        { err, notificationId, userId, type },
        'Failed to enqueue push notification — inbox record created, push skipped',
      );
    });
  }

  // ─── Shipment event triggers ──────────────────────────────────────────────

  /**
   * Notify the shipment owner that their request has been received.
   * Called by shipmentService.createShipment() immediately after INSERT.
   */
  async notifyShipmentCreated(shipmentId: string, userId: string): Promise<void> {
    await this.createAndEnqueue(userId, 'shipment_created', {
      shipmentId,
      // trackingNumber not yet available at call site — template handles missing value
    });
  }

  /**
   * Notify the shipment owner of a status transition.
   * Loads shipment data (tracking number, cities, rejection reason) from DB.
   * Called by shipmentService.adminTransitionShipment() and confirmDelivery().
   */
  async notifyShipmentStatusChanged(
    shipmentId: string,
    toStatus:   ShipmentStatus,
  ): Promise<void> {
    const notifType = STATUS_TO_NOTIFICATION[toStatus];
    if (!notifType) {
      // Not all statuses produce notifications (e.g. payment_pending, payment_confirmed)
      logger.debug({ shipmentId, toStatus }, 'No notification type for this transition');
      return;
    }

    // Load shipment context for template
    const { data: shipment, error } = await supabaseServiceRole()
      .from('shipments')
      .select('user_id, tracking_number, pickup_city, delivery_city, rejection_reason')
      .eq('id', shipmentId)
      .single();

    if (error || !shipment) {
      logger.error(
        { shipmentId, toStatus, error: error?.message },
        'Failed to load shipment for notification',
      );
      return;
    }

    const ctx: TemplateContext = {
      shipmentId,
      trackingNumber:  shipment.tracking_number  as string,
      pickupCity:      shipment.pickup_city       as string,
      deliveryCity:    shipment.delivery_city     as string,
      rejectionReason: (shipment as any).rejection_reason as string | null ?? undefined,
    };

    await this.createAndEnqueue(shipment.user_id as string, notifType, ctx);
  }

  /**
   * Notify the shipment owner that payment was confirmed.
   * Called by paymentService.processWebhook() after 'advanced' result.
   */
  async notifyPaymentConfirmed(shipmentId: string, userId: string): Promise<void> {
    await this.createAndEnqueue(userId, 'payment_confirmed', { shipmentId });
  }

  /**
   * Notify the shipment owner that payment failed or was cancelled.
   * Called by paymentService.processWebhook() after 'reverted' result.
   */
  async notifyPaymentFailed(shipmentId: string, userId: string): Promise<void> {
    await this.createAndEnqueue(userId, 'payment_failed', { shipmentId });
  }

  // ─── Admin fan-out ────────────────────────────────────────────────────────

  /**
   * Notify all active admins of a new shipment request.
   * Creates one notification per admin. Uses Promise.allSettled() so failure
   * for one admin does not block the others.
   */
  async notifyAdminsNewShipment(
    shipmentId:     string,
    trackingNumber: string,
    pickupCity:     string,
    deliveryCity:   string,
  ): Promise<void> {
    // Load all active admins
    const { data: admins, error } = await supabaseServiceRole()
      .from('user_profiles')
      .select('id')
      .in('role', ['admin', 'super_admin'])
      .eq('is_active', true);

    if (error) {
      logger.error({ error: error.message, shipmentId }, 'Failed to load admins for notification');
      return;
    }

    if (!admins || admins.length === 0) {
      logger.warn({ shipmentId }, 'No active admins found — admin alert skipped');
      return;
    }

    const ctx: TemplateContext = {
      shipmentId,
      trackingNumber,
      pickupCity,
      deliveryCity,
    };

    const results = await Promise.allSettled(
      admins.map((admin) =>
        this.createAndEnqueue(admin.id as string, 'admin_new_request', ctx),
      ),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      logger.warn(
        { shipmentId, total: admins.length, failed: failed.length },
        'Some admin notifications failed to create',
      );
    }

    logger.info(
      { shipmentId, notified: admins.length - failed.length, failed: failed.length },
      'Admin new shipment notifications dispatched',
    );
  }

  // ─── API methods: list, count, mark-read ─────────────────────────────────

  /**
   * List notifications for a user, newest first, with cursor pagination.
   * Returns unread_count alongside the page for mobile badge display.
   */
  async listNotifications(
    userId:  string,
    options: ListNotificationsOptions,
  ): Promise<ListNotificationsResult> {
    const limit = Math.min(options.limit ?? 20, 50);

    let query = supabaseServiceRole()
      .from('app_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(limit + 1); // Extra row to detect next page

    if (options.unread_only === true) {
      query = query.eq('is_read', false);
    }

    // Apply cursor
    if (options.cursor) {
      const cur = decodeCursor(options.cursor);
      if (cur) {
        query = query.or(
          `created_at.lt.${cur.created_at},` +
          `and(created_at.eq.${cur.created_at},id.lt.${cur.id})`,
        );
      }
    }

    const { data, error } = await query;

    if (error) {
      throw mapSupabaseError(error);
    }

    const rows         = (data ?? []) as unknown as AppNotification[];
    const hasNextPage  = rows.length > limit;
    const page         = hasNextPage ? rows.slice(0, limit) : rows;

    let next_cursor: string | null = null;
    if (hasNextPage && page.length > 0) {
      const last = page[page.length - 1];
      if (last) {
        next_cursor = encodeCursor(last.created_at, last.id);
      }
    }

    // Fetch unread count (always, for badge sync)
    const unread_count = await this.getUnreadCount(userId);

    return { data: page, next_cursor, unread_count };
  }

  /**
   * Count unread notifications for a user.
   * Returns 0 on error (badge should not block UI).
   */
  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabaseServiceRole()
      .from('app_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to fetch unread count');
      return 0;
    }

    return count ?? 0;
  }

  /**
   * Mark a single notification as read.
   * Enforces ownership: throws NotFoundError if notification doesn't belong to user.
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const { data, error } = await supabaseServiceRole()
      .from('app_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)      // Ownership guard
      .eq('is_read', false)       // No-op if already read
      .select('id')
      .single();

    if (error) {
      // PGRST116 = no rows matched (not found or wrong user)
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Notification');
      }
      throw mapSupabaseError(error);
    }

    if (!data) {
      throw new NotFoundError('Notification');
    }
  }

  /**
   * Mark all unread notifications for a user as read.
   * Returns the number of notifications marked.
   */
  async markAllAsRead(userId: string): Promise<number> {
    const { data, error } = await supabaseServiceRole()
      .from('app_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false)
      .select('id');

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []).length;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const notificationService = new NotificationService();
