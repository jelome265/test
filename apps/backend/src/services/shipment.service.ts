/**
 * shipment.service.ts — Full shipment business logic.
 *
 * Covers the complete customer-facing shipment lifecycle:
 *   - Quote (price estimate, no auth, no DB write)
 *   - Create (geo + pricing + insert + audit)
 *   - List (paginated, owner-scoped, keyset cursor)
 *   - Get (single, ownership enforced)
 *   - History (shipment + full status event timeline via RPC)
 *   - Confirm delivery (customer confirms receipt via RPC)
 *   - Cancel (customer-initiated, pre-pickup states only)
 *
 * Admin transitions (approve, reject, picked_up, in_transit, delivered)
 * are in this same service under adminTransitionShipment().
 * Public tracking is in trackShipment() — no ownership check.
 *
 * SECURITY CONTRACT:
 *   - Shipment data is always scoped to req.user.id UNLESS the caller
 *     is an admin. Admin access is enforced at the route level via
 *     requireAdminRole middleware.
 *   - The service trusts the actorId parameter to be the authenticated
 *     user's ID. Never derive actorId from the request body.
 *   - Distance and price are always calculated server-side. No client
 *     values are trusted for financial fields.
 *
 * Database access patterns:
 *   - createShipment:     1 pricing load + 1 INSERT + 1 audit write
 *   - listShipments:      1 SELECT with pagination
 *   - getShipment:        1 SELECT + ownership check
 *   - getShipmentHistory: 1 RPC call (get_shipment_history)
 *   - confirmDelivery:    1 RPC call (confirm_delivery)
 *   - adminTransition:    1 RPC call (admin_transition_shipment)
 *   - cancelShipment:     1 UPDATE + 1 audit write
 *   - trackShipment:      1 SELECT (public, no user filter)
 */

import type { Shipment, ShipmentStatus, ShipmentStatusEvent, UserRole } from '@courier/shared-types';
import type { CreateShipmentInput } from '@courier/shared-validation';

import { supabaseServiceRole } from '../config/supabase.js';
import {
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  mapSupabaseError,
} from '../errors/app-error.js';
import { logger } from '../utils/logger.js';

import { auditService } from './audit.service.js';
import { calculateDistance } from './geo.service.js';
import { notificationService } from './notification.service.js';
import { calculateShipmentPrice } from './pricing.service.js';
import {
  validateAdminTransition,
  canCustomerCancel,
  type TransitionContext,
} from './shipment-state-machine.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuoteResult {
  pickup_city:           string;
  delivery_city:         string;
  weight_kg:             number;
  package_size:          string;
  is_fragile:            boolean;
  distance_km:           number;
  distance_source:       string;
  base_price_mwk:        number;
  distance_charge_mwk:   number;
  weight_charge_mwk:     number;
  fragile_surcharge_mwk: number;
  size_multiplier_bp:    number;
  total_mwk:             number;
  config_name:           string;
  currency:              'MWK';
}

export interface CreateShipmentResult {
  shipment: Shipment;
}

export interface ListShipmentsResult {
  data:        Shipment[];
  next_cursor: string | null;  // base64 { created_at, id }
  total_count: number | null;  // null = not calculated (performance)
}

export interface ShipmentHistoryResult {
  shipment: Shipment;
  events:   ShipmentStatusEvent[];
}

export interface ListShipmentsOptions {
  cursor?:      string;   // base64 pagination cursor
  limit?:       number;   // default 20, max 100
  status?:      ShipmentStatus;
  // Admin-only filters:
  user_id?:     string;
  search?:      string;   // search sender/receiver phone or name
}

// ─── Cursor helpers ───────────────────────────────────────────────────────────

interface CursorPayload {
  created_at: string;
  id:         string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    const payload = JSON.parse(decoded) as unknown;

    if (
      typeof payload === 'object' &&
      payload !== null &&
      'created_at' in payload &&
      'id' in payload &&
      typeof (payload as CursorPayload).created_at === 'string' &&
      typeof (payload as CursorPayload).id === 'string'
    ) {
      return payload as CursorPayload;
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Shipment Service ─────────────────────────────────────────────────────────

class ShipmentService {

  // ─── Quote (public, no auth) ────────────────────────────────────────────────

  /**
   * Calculate a price estimate for a shipment without creating one.
   * This endpoint is public — no authentication required.
   * Price is advisory; the server recalculates on actual creation.
   */
  async getQuote(input: {
    pickup_city:   string;
    delivery_city: string;
    weight_kg:     number;
    package_size:  'small' | 'medium' | 'large';
    is_fragile:    boolean;
  }): Promise<QuoteResult> {
    const { pickup_city, delivery_city, weight_kg, package_size, is_fragile } = input;

    // Calculate distance (no user coordinates for anonymous quote)
    const distanceResult = await calculateDistance({
      pickup_city:   pickup_city as any,
      delivery_city: delivery_city as any,
    });

    // Calculate price
    const breakdown = await calculateShipmentPrice({
      distance_km:  distanceResult.distance_km,
      weight_kg,
      package_size,
      is_fragile,
    });

    return {
      pickup_city,
      delivery_city,
      weight_kg,
      package_size,
      is_fragile,
      distance_km:           distanceResult.distance_km,
      distance_source:       distanceResult.source,
      base_price_mwk:        breakdown.base_price_mwk,
      distance_charge_mwk:   breakdown.distance_charge_mwk,
      weight_charge_mwk:     breakdown.weight_charge_mwk,
      fragile_surcharge_mwk: breakdown.fragile_surcharge_mwk,
      size_multiplier_bp:    breakdown.size_multiplier_bp,
      total_mwk:             breakdown.total_mwk,
      config_name:           breakdown.config_name,
      currency:              'MWK',
    };
  }

  // ─── Create shipment ────────────────────────────────────────────────────────

  /**
   * Create a new shipment for the authenticated customer.
   *
   * Flow (ADR-023 — atomic):
   *   1. Calculate distance (geo service with fallback)
   *   2. Calculate price (pricing service — server-side, never from client)
   *   3. Insert shipment record (trigger assigns tracking number)
   *   4. Write audit log
   *   5. Return complete shipment
   *
   * The client does NOT send a price. The server calculates and stores it.
   * The client sees the price in the response and must confirm payment.
   */
  async createShipment(
    input:   CreateShipmentInput,
    userId:  string,
    actorIp: string,
  ): Promise<CreateShipmentResult> {
    const { sender, receiver, package: pkg, delivery_notes } = input;

    // ── Calculate distance ─────────────────────────────────────────────────
    const distanceResult = await calculateDistance({
      pickup_city:   sender.city,
      delivery_city: receiver.city,
      sender_lat:    sender.coordinates?.latitude ?? null,
      sender_lng:    sender.coordinates?.longitude ?? null,
      receiver_lat:  receiver.coordinates?.latitude ?? null,
      receiver_lng:  receiver.coordinates?.longitude ?? null,
    });

    logger.debug(
      {
        pickup_city:    sender.city,
        delivery_city:  receiver.city,
        distance_km:    distanceResult.distance_km,
        source:         distanceResult.source,
      },
      'Distance calculated for new shipment',
    );

    // ── Calculate price ────────────────────────────────────────────────────
    const priceBreakdown = await calculateShipmentPrice({
      distance_km:  distanceResult.distance_km,
      weight_kg:    pkg.weight_kg,
      package_size: pkg.size,
      is_fragile:   pkg.is_fragile,
    });

    logger.debug(
      {
        total_mwk:  priceBreakdown.total_mwk,
        config:     priceBreakdown.config_name,
      },
      'Price calculated for new shipment',
    );

    // ── Insert shipment record ─────────────────────────────────────────────
    const insertPayload = {
      user_id: userId,

      // Sender snapshot
      sender_name:    sender.full_name,
      sender_phone:   sender.phone_number,
      sender_email:   sender.email ?? null,
      sender_address: sender.address,
      sender_city:    sender.city,
      sender_lat:     sender.coordinates?.latitude ?? null,
      sender_lng:     sender.coordinates?.longitude ?? null,

      // Receiver snapshot
      receiver_name:    receiver.full_name,
      receiver_phone:   receiver.phone_number,
      receiver_email:   receiver.email ?? null,
      receiver_address: receiver.address,
      receiver_city:    receiver.city,
      receiver_lat:     receiver.coordinates?.latitude ?? null,
      receiver_lng:     receiver.coordinates?.longitude ?? null,

      // Package
      weight_kg:           pkg.weight_kg,
      package_size:        pkg.size,
      package_description: pkg.description,
      is_fragile:          pkg.is_fragile,
      declared_value_mwk:  pkg.declared_value_mwk ?? null,

      // Routing
      pickup_city:   sender.city,
      delivery_city: receiver.city,
      distance_km:   distanceResult.distance_km,

      // Pricing (server-calculated, never from client)
      quoted_price_mwk: priceBreakdown.total_mwk,
      // final_price_mwk: set by admin after review

      // State: starts at pending_approval (DB default)

      // Optional
      delivery_notes: delivery_notes ?? null,
    };

    const { data: shipment, error: insertError } = await supabaseServiceRole()
      .from('shipments')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError) {
      logger.error({ error: insertError.message }, 'Shipment insert failed');
      throw mapSupabaseError(insertError);
    }

    if (!shipment) {
      throw new Error('Shipment insert returned no data');
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    await auditService.logShipmentCreated(
      userId,
      shipment.id as string,
      actorIp,
      {
        tracking_number: shipment.tracking_number as string,
        pickup_city:     sender.city,
        delivery_city:   receiver.city,
      },
    );

    logger.info(
      {
        shipmentId:      shipment.id,
        trackingNumber:  shipment.tracking_number,
        userId,
        total_mwk:       priceBreakdown.total_mwk,
      },
      'Shipment created',
    );

    // Fire-and-forget: notification errors must NEVER fail the shipment creation.
    notificationService.notifyShipmentCreated(shipment.id as string, userId)
      .catch((err: Error) => logger.error({ err, shipmentId: shipment.id }, 'notifyShipmentCreated failed'));

    notificationService.notifyAdminsNewShipment(
      shipment.id as string,
      shipment.tracking_number as string,
      sender.city,
      receiver.city,
    ).catch((err: Error) => logger.error({ err, shipmentId: shipment.id }, 'notifyAdminsNewShipment failed'));

    return { shipment: shipment as unknown as Shipment };
  }

  // ─── List shipments (paginated, keyset cursor) ──────────────────────────────

  /**
   * List shipments for a user (customers see only their own).
   * Admins can pass user_id to filter, or omit for all shipments.
   *
   * Keyset (cursor) pagination — see ADR-025.
   */
  async listShipments(
    options:     ListShipmentsOptions,
    actorId:     string,
    isAdmin:     boolean,
  ): Promise<ListShipmentsResult> {
    const limit = Math.min(options.limit ?? 20, 100);

    let query = supabaseServiceRole()
      .from('shipments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1); // Fetch one extra to detect if there's a next page

    // ── Ownership filter ───────────────────────────────────────────────────
    if (!isAdmin) {
      // Customers only see their own shipments
      query = query.eq('user_id', actorId);
    } else if (options.user_id) {
      // Admin filtered to specific user
      query = query.eq('user_id', options.user_id);
    }

    // ── Status filter ──────────────────────────────────────────────────────
    if (options.status) {
      query = query.eq('status', options.status);
    }

    // ── Keyset cursor ──────────────────────────────────────────────────────
    if (options.cursor) {
      const cursorPayload = decodeCursor(options.cursor);
      if (cursorPayload) {
        // Get rows created before the cursor position
        query = query.or(
          `created_at.lt.${cursorPayload.created_at},` +
          `and(created_at.eq.${cursorPayload.created_at},id.lt.${cursorPayload.id})`,
        );
      }
      // Invalid cursor: ignore it and return from the beginning
    }

    // ── Admin text search ──────────────────────────────────────────────────
    if (isAdmin && options.search) {
      const search = options.search.trim();
      query = query.or(
        `sender_phone.ilike.%${search}%,` +
        `receiver_phone.ilike.%${search}%,` +
        `sender_name.ilike.%${search}%,` +
        `receiver_name.ilike.%${search}%,` +
        `tracking_number.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error({ error: error.message }, 'Shipment list query failed');
      throw mapSupabaseError(error);
    }

    const rows = (data ?? []) as unknown as Shipment[];

    // Detect if there's a next page
    const hasNextPage = rows.length > limit;
    const shipments   = hasNextPage ? rows.slice(0, limit) : rows;

    // Build next cursor from the last item in the page
    let next_cursor: string | null = null;
    if (hasNextPage && shipments.length > 0) {
      const last = shipments[shipments.length - 1];
      if (last) {
        next_cursor = encodeCursor({
          created_at: last.created_at,
          id:         last.id,
        });
      }
    }

    return {
      data:        shipments,
      next_cursor,
      total_count: count,
    };
  }

  // ─── Get single shipment ────────────────────────────────────────────────────

  /**
   * Fetch a single shipment by ID.
   * Enforces ownership: customers can only view their own shipments.
   * Admins can view any shipment.
   */
  async getShipment(
    shipmentId: string,
    actorId:    string,
    isAdmin:    boolean,
  ): Promise<Shipment> {
    const { data, error } = await supabaseServiceRole()
      .from('shipments')
      .select('*')
      .eq('id', shipmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Shipment');
      }
      throw mapSupabaseError(error);
    }

    if (!data) {
      throw new NotFoundError('Shipment');
    }

    const shipment = data as unknown as Shipment;

    // Ownership check
    if (!isAdmin && shipment.user_id !== actorId) {
      // Return 404, not 403 — don't confirm the shipment exists to other users
      throw new NotFoundError('Shipment');
    }

    return shipment;
  }

  // ─── Get shipment history (with status events) ──────────────────────────────

  /**
   * Return a shipment + its full status event timeline.
   * Uses the get_shipment_history() Supabase RPC (migration 014)
   * which enforces ownership inside the DB function.
   */
  async getShipmentHistory(
    shipmentId:  string,
    actorId:     string,
    actorRole:   UserRole,
  ): Promise<ShipmentHistoryResult> {
    // Use service-role client and pass actor context via session variables
    // The RPC handles ownership/access internally using auth.uid() — but since
    // we're using service role, we call the history RPC differently.
    // We call our own getShipment (enforces ownership) then load events separately.

    const shipment = await this.getShipment(
      shipmentId,
      actorId,
      actorRole === 'admin' || actorRole === 'super_admin',
    );

    const { data: events, error: eventsError } = await supabaseServiceRole()
      .from('shipment_status_events')
      .select('*')
      .eq('shipment_id', shipmentId)
      .order('created_at', { ascending: true });

    if (eventsError) {
      logger.error({ error: eventsError.message, shipmentId }, 'Failed to load status events');
      // Return shipment without events rather than failing the whole request
      return { shipment, events: [] };
    }

    return {
      shipment,
      events: (events ?? []) as unknown as ShipmentStatusEvent[],
    };
  }

  // ─── Confirm delivery (customer) ────────────────────────────────────────────

  /**
   * Customer confirms they received their package.
   * Transitions: delivered → confirmed (via DB RPC for concurrency safety).
   *
   * The DB RPC (confirm_delivery) enforces:
   *   - Caller must be the shipment owner
   *   - Shipment must be in 'delivered' state
   *   - Optimistic concurrency (ADR-005)
   */
  async confirmDelivery(
    shipmentId: string,
    actorId:    string,
    actorIp:    string,
  ): Promise<Shipment> {
    // Pre-check: load shipment and validate state before RPC call.
    // Gives a better error message than the DB exception.
    const current = await this.getShipment(shipmentId, actorId, false);

    if (current.status !== 'delivered') {
      throw new BusinessRuleError(
        `Cannot confirm delivery: shipment is in '${current.status}' state, not 'delivered'.`,
        'INVALID_STATE_FOR_CONFIRMATION',
      );
    }

    // Execute via DB RPC for concurrency safety
    const { data, error } = await supabaseServiceRole().rpc('confirm_delivery', {
      p_shipment_id: shipmentId,
    });

    if (error) {
      const msg = error.message ?? '';

      if (msg.includes('CONFLICT')) {
        throw new ConflictError('Shipment status changed concurrently. Please reload and retry.');
      }
      if (msg.includes('FORBIDDEN')) {
        throw new NotFoundError('Shipment'); // Hide existence from non-owners
      }
      if (msg.includes('INVALID_TRANSITION')) {
        throw new BusinessRuleError(
          `Cannot confirm delivery in current state.`,
          'INVALID_STATE_TRANSITION',
        );
      }

      throw mapSupabaseError(error);
    }

    await auditService.logStatusChange(
      actorId, 'customer', shipmentId, 'delivered', 'confirmed', actorIp,
    );

    logger.info({ shipmentId, actorId }, 'Delivery confirmed by customer');

    notificationService.notifyShipmentStatusChanged(shipmentId, 'confirmed')
      .catch((err: Error) => logger.error({ err, shipmentId }, 'notifyShipmentStatusChanged (confirmed) failed'));

    return data as unknown as Shipment;
  }

  // ─── Cancel shipment (customer) ─────────────────────────────────────────────

  /**
   * Customer cancels their own shipment.
   * Permitted from: pending_approval, approved, payment_confirmed.
   * NOT permitted once picked_up (courier already has the package).
   */
  async cancelShipment(
    shipmentId: string,
    actorId:    string,
    actorIp:    string,
    reason?:    string,
  ): Promise<Shipment> {
    // Load and validate
    const current = await this.getShipment(shipmentId, actorId, false);

    if (!canCustomerCancel(current.status)) {
      throw new BusinessRuleError(
        `Shipment cannot be cancelled in '${current.status}' state. ` +
        `Cancellation is only allowed before the courier picks up the package.`,
        'CANCELLATION_NOT_ALLOWED',
      );
    }

    // Optimistic concurrency update
    const { data, error } = await supabaseServiceRole()
      .from('shipments')
      .update({
        status:           'cancelled',
        rejection_reason: reason?.trim() ?? null,
      })
      .eq('id', shipmentId)
      .eq('status', current.status)  // ADR-005: concurrency guard
      .select('*')
      .single();

    if (error) {
      throw mapSupabaseError(error);
    }

    if (!data) {
      throw new ConflictError('Shipment status changed concurrently. Please reload and retry.');
    }

    await auditService.logStatusChange(
      actorId, 'customer', shipmentId, current.status, 'cancelled', actorIp,
    );

    logger.info({ shipmentId, actorId, from: current.status }, 'Shipment cancelled by customer');

    return data as unknown as Shipment;
  }

  // ─── Admin: transition shipment ─────────────────────────────────────────────

  /**
   * Admin transitions a shipment to a new status.
   * Uses the admin_transition_shipment() RPC (migration 014) which:
   *   - Validates the transition
   *   - Enforces optimistic concurrency
   *   - Writes the status event automatically via trigger
   *   - Writes an audit log entry inside the RPC
   *
   * Pre-validates in application layer for better error messages.
   */
  async adminTransitionShipment(
    shipmentId:   string,
    targetStatus: ShipmentStatus,
    actorId:      string,
    actorRole:    UserRole,
    _actorIp:      string,
    context:      TransitionContext = {},
  ): Promise<Shipment> {
    // Load current state for pre-validation
    const current = await this.getShipment(shipmentId, actorId, true);

    // Application-layer validation (fast, no extra DB call)
    validateAdminTransition(current.status, targetStatus, actorRole, context);

    // Execute via DB RPC for concurrency safety
    const { data, error } = await supabaseServiceRole().rpc('admin_transition_shipment', {
      p_shipment_id:     shipmentId,
      p_to_status:       targetStatus,
      p_notes:           context.notes ?? null,
      p_rejection_reason: context.rejection_reason ?? null,
    });

    if (error) {
      const msg = error.message ?? '';

      if (msg.includes('CONFLICT')) {
        throw new ConflictError('Shipment status changed concurrently. Please reload and retry.');
      }
      if (msg.includes('INVALID_TRANSITION')) {
        throw new BusinessRuleError(msg, 'INVALID_STATE_TRANSITION');
      }
      if (msg.includes('NOT_FOUND')) {
        throw new NotFoundError('Shipment');
      }
      if (msg.includes('VALIDATION')) {
        throw new BusinessRuleError(msg, 'VALIDATION_ERROR');
      }

      throw mapSupabaseError(error);
    }

    logger.info(
      { shipmentId, from: current.status, to: targetStatus, actorId, actorRole },
      'Admin transitioned shipment status',
    );

    notificationService.notifyShipmentStatusChanged(shipmentId, targetStatus)
      .catch((err: Error) => logger.error({ err, shipmentId, targetStatus }, 'notifyShipmentStatusChanged failed'));

    return data as unknown as Shipment;
  }

  // ─── Public tracking (no auth) ──────────────────────────────────────────────

  /**
   * Look up a shipment by tracking number — public, no authentication required.
   * Returns a REDACTED shipment: no PII (no sender/receiver name, address, email).
   * Only exposes: tracking number, status, cities, timestamps, package description.
   */
  async trackShipment(trackingNumber: string): Promise<Partial<Shipment>> {
    const { data, error } = await supabaseServiceRole()
      .from('shipments')
      .select(
        'id, tracking_number, status, pickup_city, delivery_city, ' +
        'package_description, weight_kg, is_fragile, package_size, ' +
        'estimated_delivery_date, picked_up_at, delivered_at, confirmed_at, ' +
        'created_at, updated_at',
      )
      .eq('tracking_number', trackingNumber.toUpperCase())
      .single();

    if (error || !data) {
      throw new NotFoundError('Shipment');
    }

    return data as Partial<Shipment>;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const shipmentService = new ShipmentService();
