/**
 * payment.routes.ts — Authenticated payment API routes.
 *
 * Mounted at: /api/v1/payments
 *
 * Endpoints:
 *   POST   /initiate              → paymentService.initiatePayment()
 *   GET    /:id                   → paymentService.getPayment()
 *   GET    /shipment/:shipmentId  → paymentService.getShipmentPayments()
 *
 * All endpoints require authentication (requireAuth middleware).
 * The initiate endpoint is rate-limited (paymentRateLimit: 20/hour per IP).
 *
 * Response envelope: { data: T } for success.
 * Errors: global error handler (AppError hierarchy).
 *
 * Idempotency contract:
 *   POST /initiate requires the Idempotency-Key header OR idempotency_key in body.
 *   The body field takes precedence (mobile-friendly).
 *   Callers MUST generate a fresh UUID v4 before the first attempt and reuse it
 *   on retries. Changing the key on retry creates a new payment record.
 */

import { InitiatePaymentSchema } from '@courier/shared-validation';
import { Router } from 'express';
import type { Request, Response } from 'express';


import { requireAuth } from '../middleware/auth.middleware.js';
import { paymentRateLimit } from '../middleware/rate-limit.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { paymentService } from '../services/payment.service.js';
import { asyncHandler } from '../utils/async-handler.js';

export const paymentRouter = Router();

// ─── POST /api/v1/payments/initiate ──────────────────────────────────────────
/**
 * Initiate a payment for an approved shipment.
 *
 * Rate-limited: 20 req / hour per IP (paymentRateLimit)
 *
 * Request body: InitiatePaymentInput
 *   {
 *     shipment_id:     string (UUID)
 *     method:          'airtel_money' | 'tnm_mpamba' | 'bank_transfer' | 'card'
 *     phone_number?:   string  — required for airtel_money, tnm_mpamba
 *     idempotency_key: string  — UUID v4, client-generated
 *   }
 *
 * Response 201:
 *   {
 *     data: {
 *       payment_id:          string
 *       provider_reference:  string   — our tx_ref sent to Paychangu
 *       status:              'processing'
 *       expires_at:          string   — ISO 8601, 30 min from now
 *       payment_url?:        string   — present for card/web payments
 *     }
 *   }
 *
 * Response 200 (idempotent): same shape, returned when idempotency_key matches
 *   an existing payment record.
 *
 * Response 400: Validation error
 * Response 409: Concurrent payment in progress for this shipment
 * Response 422: Shipment not in 'approved' state
 * Response 429: Rate limit exceeded
 */
paymentRouter.post(
  '/initiate',
  requireAuth,
  requireRole('customer'),
  paymentRateLimit,
  validate(InitiatePaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await paymentService.initiatePayment(
      req.body,
      req.user!.id,
      req.ip ?? 'unknown',
    );

    // 200 if idempotent (existing record returned), 201 if new
    const statusCode = result.status === 'processing' ? 201 : 200;
    res.status(statusCode).json({ data: result });
  }),
);

// ─── GET /api/v1/payments/shipment/:shipmentId ────────────────────────────────
/**
 * Get all payment records for a shipment (may be multiple: retries after failures).
 *
 * Must be placed BEFORE /:id to avoid route ambiguity.
 * (Express matches 'shipment' as the :id segment if /:id is first.)
 *
 * Response 200:
 *   {
 *     data: Payment[]   — ordered by created_at DESC
 *   }
 */
paymentRouter.get(
  '/shipment/:shipmentId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
    const payments = await paymentService.getShipmentPayments(
      req.params.shipmentId!,
      req.user!.id,
      isAdmin,
    );
    res.status(200).json({ data: payments });
  }),
);

// ─── GET /api/v1/payments/:id ─────────────────────────────────────────────────
/**
 * Get a single payment record by ID.
 *
 * Response 200:
 *   {
 *     data: Payment
 *   }
 *
 * Response 404: Payment not found (or belongs to a different user)
 */
paymentRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
    const payment = await paymentService.getPayment(
      req.params.id!,
      req.user!.id,
      isAdmin,
    );
    res.status(200).json({ data: payment });
  }),
);
