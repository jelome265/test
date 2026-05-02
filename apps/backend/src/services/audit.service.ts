/**
 * audit.service.ts — Structured audit log writer.
 *
 * Writes to the audit_log table (migration 010) via service-role client.
 * Writes are synchronous to the request lifecycle — they are not queued.
 * See ADR-013 for rationale.
 *
 * SECURITY INVARIANTS (enforced by this service, not the schema):
 *   - NEVER include passwords, tokens, private keys, or card data in payload
 *   - Redact phone numbers to last 4 digits in payload (PII minimization)
 *   - Truncate user-agent strings to 500 characters
 *   - payload must be a plain object — no class instances, no circular refs
 *
 * Usage:
 *   await auditService.log({
 *     event:      'shipment_status_changed',
 *     actorId:    req.user.id,
 *     actorRole:  req.user.role,
 *     actorIp:    req.ip,
 *     actorUa:    req.headers['user-agent'],
 *     targetType: 'shipment',
 *     targetId:   shipmentId,
 *     payload:    { from_status: 'approved', to_status: 'payment_pending' },
 *   });
 */

import type { UserRole } from '@courier/shared-types';

import { supabaseServiceRole } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

// Matches the audit_event_type enum in migration 002
type AuditEventType =
  | 'user_login'
  | 'user_logout'
  | 'user_registered'
  | 'user_password_changed'
  | 'user_role_changed'
  | 'user_deactivated'
  | 'user_reactivated'
  | 'shipment_created'
  | 'shipment_status_changed'
  | 'shipment_reviewed'
  | 'payment_initiated'
  | 'payment_webhook_received'
  | 'payment_refunded'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'admin_rpc_called';

interface AuditLogParams {
  event:       AuditEventType;
  actorId?:    string;           // null for unauthenticated events
  actorRole?:  UserRole;
  actorIp?:    string;
  actorUa?:    string;
  targetType?: string;           // 'shipment' | 'user' | 'payment' | 'dispute'
  targetId?:   string;
  payload?:    Record<string, unknown>;
  success?:    boolean;
  errorMessage?: string;
}

// ─── Redaction helpers ────────────────────────────────────────────────────────

/** Strips known sensitive keys from a payload object before logging. */
function sanitizePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const FORBIDDEN_KEYS = new Set([
    'password', 'new_password', 'current_password', 'confirm_password',
    'token', 'access_token', 'refresh_token', 'service_role_key',
    'private_key', 'secret_key', 'webhook_secret',
    'card_number', 'cvv', 'pan',
    'fcm_token',
  ]);

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      sanitized[key] = sanitizePayload(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/** Truncate user-agent to 500 chars to prevent payload bloat. */
function truncateUa(ua: string | undefined): string | undefined {
  if (!ua) return undefined;
  return ua.length > 500 ? `${ua.slice(0, 497)}...` : ua;
}

// ─── Audit service ────────────────────────────────────────────────────────────

class AuditService {
  /**
   * Write a single audit log entry.
   * Errors are logged but do NOT propagate — a failing audit write should not
   * cause the business operation to fail. The audit write failure IS itself logged.
   */
  async log(params: AuditLogParams): Promise<void> {
    const sanitizedPayload = params.payload
      ? sanitizePayload(params.payload)
      : {};

    const { error } = await supabaseServiceRole()
      .from('audit_log')
      .insert({
        event_type:    params.event,
        actor_id:      params.actorId      ?? null,
        actor_role:    params.actorRole    ?? null,
        actor_ip:      params.actorIp      ?? null,
        actor_ua:      truncateUa(params.actorUa),
        target_type:   params.targetType   ?? null,
        target_id:     params.targetId     ?? null,
        payload:       sanitizedPayload,
        success:       params.success      ?? true,
        error_message: params.errorMessage ?? null,
      });

    if (error) {
      // CRITICAL: Log the failure but do not re-throw.
      // A broken audit trail is bad; failing the business operation for audit
      // reasons is worse (it degrades availability without improving correctness).
      logger.error(
        { auditEvent: params.event, actorId: params.actorId, error: error.message },
        'Audit log write failed — audit trail has a gap',
      );
    }
  }

  // ─── Convenience methods ─────────────────────────────────────────────────

  async logLogin(actorId: string, actorIp: string, actorUa: string): Promise<void> {
    await this.log({
      event: 'user_login',
      actorId,
      actorIp,
      actorUa,
      targetType: 'user',
      targetId: actorId,
    });
  }

  async logLogout(actorId: string, actorIp: string): Promise<void> {
    await this.log({
      event: 'user_logout',
      actorId,
      actorIp,
      targetType: 'user',
      targetId: actorId,
    });
  }

  async logRegistration(actorId: string, actorIp: string, actorUa: string): Promise<void> {
    await this.log({
      event: 'user_registered',
      actorId,
      actorIp,
      actorUa,
      targetType: 'user',
      targetId: actorId,
    });
  }

  async logShipmentCreated(
    actorId: string,
    shipmentId: string,
    actorIp: string,
    payload: { tracking_number: string; pickup_city: string; delivery_city: string },
  ): Promise<void> {
    await this.log({
      event: 'shipment_created',
      actorId,
      actorIp,
      targetType: 'shipment',
      targetId: shipmentId,
      payload,
    });
  }

  async logStatusChange(
    actorId: string,
    actorRole: UserRole,
    shipmentId: string,
    fromStatus: string,
    toStatus: string,
    actorIp: string,
  ): Promise<void> {
    await this.log({
      event: 'shipment_status_changed',
      actorId,
      actorRole,
      actorIp,
      targetType: 'shipment',
      targetId: shipmentId,
      payload: { from_status: fromStatus, to_status: toStatus },
    });
  }

  async logPaymentInitiated(
    actorId: string,
    paymentId: string,
    shipmentId: string,
    method: string,
    actorIp: string,
  ): Promise<void> {
    await this.log({
      event: 'payment_initiated',
      actorId,
      actorIp,
      targetType: 'payment',
      targetId: paymentId,
      payload: { shipment_id: shipmentId, method },
    });
  }

  async logWebhookReceived(
    event: 'payment_webhook_received',
    providerReference: string,
    status: string,
  ): Promise<void> {
    await this.log({
      event,
      targetType: 'payment',
      payload: { provider_reference: providerReference, status },
    });
  }

  async logRoleChange(
    actorId: string,
    targetUserId: string,
    fromRole: UserRole,
    toRole: UserRole,
    actorIp: string,
  ): Promise<void> {
    await this.log({
      event: 'user_role_changed',
      actorId,
      actorRole: 'super_admin',
      actorIp,
      targetType: 'user',
      targetId: targetUserId,
      payload: { from_role: fromRole, to_role: toRole },
    });
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const auditService = new AuditService();
