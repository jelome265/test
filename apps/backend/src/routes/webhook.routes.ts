/**
 * webhook.routes.ts — Public webhook handler for Paychangu payment callbacks.
 *
 * CRITICAL SECURITY: This route is PUBLIC (no auth token required).
 * Authentication is entirely via HMAC-SHA256 signature verification.
 * The signature check is the FIRST operation — before any DB access.
 *
 * Body parsing:
 *   This route uses its own body parser (express.raw + parseRawBodyAsJson)
 *   instead of the global express.json() middleware. This is necessary to
 *   capture the raw bytes for HMAC verification. The route is registered
 *   BEFORE the JSON middleware mount in app.ts using the WEBHOOK path prefix.
 *
 * Idempotency:
 *   Always returns 200 OK, even if the webhook is a duplicate or references
 *   an unknown tx_ref. Non-2xx responses cause Paychangu to retry indefinitely.
 *   Business outcomes are determined by the service layer, not the HTTP status.
 *
 * Rate limiting:
 *   The global rate limiter (100/15min per IP) applies. Paychangu's IPs are
 *   in a known range — a per-IP whitelist can be added in Phase 7 if needed.
 *
 * Timeouts:
 *   Paychangu expects a response within 30 seconds. Our DB RPCs complete in
 *   < 100ms in normal operation. The 15-second Paychangu client timeout does
 *   NOT apply here — we are the server, not the client.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import {
  captureRawBody,
  parseRawBodyAsJson,
} from '../middleware/raw-body.middleware.js';
import { verifyPaychanguWebhook } from '../utils/webhook-verification.js';
import { asyncHandler } from '../utils/async-handler.js';
import { paymentService } from '../services/payment.service.js';
import { logger } from '../utils/logger.js';
import type { PaychanguWebhookPayload } from '../clients/paychangu.client.js';

export const webhookRouter = Router();

// Apply raw body capture BEFORE JSON parsing for this route
webhookRouter.use(captureRawBody);
webhookRouter.use(parseRawBodyAsJson);

// ─── POST /api/v1/webhooks/paychangu ─────────────────────────────────────────
/**
 * Paychangu payment callback.
 *
 * Expected payload (PaychanguWebhookPayload):
 *   {
 *     tx_ref:          string  — our provider_reference (PAY-xxx-xxx)
 *     transaction_id:  string  — Paychangu internal ID
 *     status:          'successful' | 'failed' | 'cancelled'
 *     amount:          number  — amount in MWK (whole number)
 *     currency:        'MWK'
 *     timestamp?:      number  — Unix epoch seconds
 *     payment_type?:   string
 *     customer?:       { name, email, phone }
 *   }
 *
 * Response: ALWAYS 200 OK with { received: true }.
 * Paychangu retries on non-2xx — we handle idempotency internally.
 *
 * Error responses: 400 for signature failure, 400 for malformed payload.
 * These are intentional — a 400 for bad signature prevents replay exploitation.
 */
webhookRouter.post(
  '/paychangu',
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-paychangu-signature'] as string | undefined;
    const payload   = req.body as PaychanguWebhookPayload;
    const rawBody   = req.rawBody;

    // ── HMAC verification (first, always) ────────────────────────────
    if (!rawBody) {
      logger.warn('Paychangu webhook received without raw body buffer');
      res.status(400).json({ error: 'INVALID_WEBHOOK', message: 'Body not captured' });
      return;
    }

    const verification = verifyPaychanguWebhook(rawBody, signature, payload);

    if (!verification.valid) {
      // Return 400 for bad signature — this signals tampering, not a Paychangu retry.
      // Paychangu's own retries always carry a valid signature.
      res.status(400).json({
        error:   'INVALID_SIGNATURE',
        message: 'Webhook signature verification failed',
      });
      return;
    }

    // ── Payload shape validation ──────────────────────────────────────
    if (!payload.tx_ref || !payload.status) {
      logger.warn({ payload }, 'Paychangu webhook missing required fields');
      res.status(400).json({
        error:   'INVALID_PAYLOAD',
        message: 'Webhook payload missing required fields: tx_ref, status',
      });
      return;
    }

    // ── Process the webhook ───────────────────────────────────────────
    // Errors in processing should NOT return non-2xx (would cause retries).
    // Log the error and return 200 — the payment state remains recoverable
    // via the reconciliation worker (Phase 7).
    try {
      const result = await paymentService.processWebhook(
        payload,
        req.ip ?? 'unknown',
      );

      logger.info(
        {
          txRef:     payload.tx_ref,
          action:    result.action,
          paymentId: result.payment_id,
          status:    result.status,
        },
        'Paychangu webhook processed',
      );

      // Always 200 — tells Paychangu "received, stop retrying"
      res.status(200).json({ received: true });

    } catch (err) {
      // Processing error — log and return 200 to prevent infinite retries.
      // The reconciliation worker will detect and fix the inconsistency.
      logger.error(
        { err, txRef: payload.tx_ref },
        'Paychangu webhook processing error — returning 200 to prevent retry storm',
      );

      // Note: returning 200 here is intentional and documented.
      // The payment is left in a non-terminal state for the reconciliation worker.
      res.status(200).json({ received: true, processing_error: true });
    }
  }),
);
