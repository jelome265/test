/**
 * raw-body.middleware.ts — Express middleware to capture raw request body.
 *
 * WHY THIS EXISTS:
 * HMAC webhook verification requires the exact raw bytes of the request body.
 * Express's express.json() middleware parses the body into req.body (a JS object)
 * and discards the original bytes. Once parsed, you cannot reconstruct the exact
 * bytes used for HMAC computation — even re-serializing req.body to JSON may
 * differ in whitespace or key ordering.
 *
 * SOLUTION:
 * For the webhook route, use express.raw() instead of express.json().
 * This captures the body as a Buffer on req.body, which we attach to
 * req.rawBody for the HMAC verification step.
 *
 * INVARIANT: This middleware MUST be applied ONLY to the webhook route,
 * and that route MUST NOT also use express.json(). The route is registered
 * separately in webhook.routes.ts with its own body parser.
 *
 * TypeScript augmentation: req.rawBody is added to the Express Request type.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import express from 'express';

// ─── Augment Express Request type ────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

/**
 * Middleware that parses request body as raw Buffer and attaches it to req.rawBody.
 * Also calls JSON.parse to populate req.body for downstream handlers.
 *
 * Use only for webhook routes that require HMAC verification.
 */
export const captureRawBody: RequestHandler = express.raw({
  type: 'application/json',
  limit: '1mb',
});

/**
 * After captureRawBody runs, this middleware parses the Buffer into a JS object
 * and attaches both rawBody and the parsed body to the request.
 */
export function parseRawBodyAsJson(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.body && Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString('utf-8')) as unknown;
    } catch {
      // JSON parse failure — let the webhook handler return 400
      req.body = {};
    }
  }
  next();
}
