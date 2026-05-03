/**
 * webhook-verification.ts — HMAC signature verification for Paychangu webhooks.
 *
 * Paychangu signs each webhook with HMAC-SHA256 using our PAYCHANGU_WEBHOOK_SECRET.
 * The signature is sent in the X-Paychangu-Signature header as a hex string.
 *
 * Verification steps:
 *   1. Compute HMAC-SHA256 of the raw request body using our secret
 *   2. Compare computed digest with the header value using timingSafeEqual()
 *   3. Check timestamp freshness (replay attack prevention)
 *
 * CRITICAL: Use crypto.timingSafeEqual(), not string ===.
 * Timing attacks on HMAC comparison allow an attacker to brute-force the secret
 * byte-by-byte by measuring how long the comparison takes. timingSafeEqual()
 * always takes the same amount of time regardless of how many bytes match.
 *
 * REPLAY ATTACK WINDOW:
 * We reject webhooks where the payload timestamp is more than 5 minutes old.
 * This limits the window during which a captured authentic webhook can be replayed.
 * 5 minutes is chosen to accommodate clock skew and network delays.
 *
 * INVARIANT: verifyPaychanguWebhook() MUST be called before any business logic
 * in the webhook handler. An invalid signature returns 400 immediately.
 */

import crypto from 'crypto';

import type { PaychanguWebhookPayload } from '../clients/paychangu.client.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// 5 minutes in seconds
const REPLAY_WINDOW_SECONDS = 300;

export interface WebhookVerificationResult {
  valid:   boolean;
  reason?: string;
}

/**
 * Verify a Paychangu webhook signature and timestamp.
 *
 * @param rawBody   - Raw request body as a Buffer (from captureRawBody middleware)
 * @param signature - Value of the X-Paychangu-Signature header
 * @param payload   - Parsed webhook payload (for timestamp extraction)
 */
export function verifyPaychanguWebhook(
  rawBody:   Buffer,
  signature: string | undefined,
  payload:   PaychanguWebhookPayload,
): WebhookVerificationResult {
  // ── Step 1: Signature header present ─────────────────────────────
  if (!signature || signature.trim().length === 0) {
    logger.warn('Webhook received with missing X-Paychangu-Signature header');
    return { valid: false, reason: 'Missing signature header' };
  }

  // ── Step 2: Compute expected HMAC ─────────────────────────────────
  const expectedHmac = crypto
    .createHmac('sha256', env.PAYCHANGU_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  // ── Step 3: Timing-safe comparison ────────────────────────────────
  // Both strings must have the same byte length for timingSafeEqual.
  // If they differ in length, the signature is definitely invalid.
  const expectedBuffer = Buffer.from(expectedHmac, 'utf-8');
  const receivedBuffer = Buffer.from(signature.trim(), 'utf-8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    logger.warn(
      {
        expectedLength: expectedBuffer.length,
        receivedLength: receivedBuffer.length,
      },
      'Webhook signature length mismatch — rejecting',
    );
    return { valid: false, reason: 'Signature length mismatch' };
  }

  const signaturesMatch = crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

  if (!signaturesMatch) {
    logger.warn('Webhook HMAC verification failed — signature does not match');
    return { valid: false, reason: 'Signature mismatch' };
  }

  // ── Step 4: Replay attack prevention ──────────────────────────────
  // Only enforce timestamp check if the payload includes one.
  // Not all Paychangu events include a timestamp field — we don't reject those.
  if (payload.timestamp !== undefined && payload.timestamp !== null) {
    const nowSeconds    = Math.floor(Date.now() / 1000);
    const payloadAge    = Math.abs(nowSeconds - payload.timestamp);

    if (payloadAge > REPLAY_WINDOW_SECONDS) {
      logger.warn(
        {
          payloadTimestamp: payload.timestamp,
          nowSeconds,
          ageSeconds: payloadAge,
          window: REPLAY_WINDOW_SECONDS,
        },
        'Webhook timestamp is outside replay window — rejecting',
      );
      return {
        valid:  false,
        reason: `Webhook timestamp too old (${payloadAge}s ago, max ${REPLAY_WINDOW_SECONDS}s)`,
      };
    }
  }

  logger.debug({ txRef: payload.tx_ref }, 'Webhook HMAC verification passed');
  return { valid: true };
}
