/**
 * error.middleware.ts — Global Express error handler.
 *
 * INVARIANT: This MUST be the LAST middleware registered in app.ts.
 * Express recognizes error handlers by their 4-argument signature (err, req, res, next).
 *
 * Responsibilities:
 *   1. Distinguish operational errors (expected) from programmer errors (bugs)
 *   2. Log errors with appropriate severity
 *   3. Serialize error to a consistent JSON envelope
 *   4. Never leak stack traces or internal details to clients in production
 *   5. Capture non-operational errors in Sentry
 *
 * Error envelope format (always):
 *   {
 *     "error":   "MACHINE_READABLE_CODE",
 *     "message": "Human-readable description",
 *     "details": [{ "field": "weight_kg", "message": "Must be ≤ 10kg" }]  // optional
 *   }
 *
 * The 'details' field is only present when the error is a ValidationError.
 * Clients should check 'error' (the code) for programmatic handling,
 * and 'message' for display to users.
 */

import * as Sentry from '@sentry/node';
import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { isDev } from '../config/env.js';
import { AppError, ValidationError, InternalError, formatZodError } from '../errors/app-error.js';
import { logger } from '../utils/logger.js';

// ─── Error normalizer ─────────────────────────────────────────────────────────
// Converts any thrown value into an AppError subclass.

function normalizeError(err: unknown): AppError {
  // Already an AppError — pass through
  if (err instanceof AppError) return err;

  // Zod errors that escaped the validate() middleware (direct schema.parse() calls)
  if (err instanceof ZodError) {
    return new ValidationError('Validation failed', formatZodError(err));
  }

  // JSON parse errors from express.json() middleware
  if (err instanceof SyntaxError && 'body' in err) {
    return new ValidationError('Invalid JSON in request body');
  }

  // Unknown error — treat as internal (non-operational)
  const message = err instanceof Error ? err.message : String(err);
  const internal = new InternalError(message);

  // Copy the original stack trace for logging
  if (err instanceof Error && err.stack) {
    internal.stack = err.stack;
  }

  return internal;
}

// ─── Global error handler ─────────────────────────────────────────────────────

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  const appError = normalizeError(err);

  // ─── Logging ───────────────────────────────────────────────────────────────
  const logContext = {
    errorCode:  appError.code,
    statusCode: appError.statusCode,
    url:        req.url,
    method:     req.method,
    userId:     req.user?.id,
    requestId:  req.headers['x-request-id'],
  };

  if (appError.isOperational) {
    // Operational errors: expected failures, log at warn level
    if (appError.statusCode >= 500) {
      logger.error({ err: appError, ...logContext }, appError.message);
    } else {
      logger.warn({ ...logContext, message: appError.message }, 'Operational error');
    }
  } else {
    // Non-operational errors: programming bugs or infrastructure failures
    // Log at error level with full stack trace
    logger.error({ err: appError, ...logContext }, 'Non-operational error — possible bug');

    // ─── Capture in Sentry (non-operational errors only) ──────────────────────
    if (!appError.isOperational) {
      Sentry.withScope((scope) => {
        scope.setTag('error.code',         appError.code);
        scope.setTag('error.operational',  'false');
        scope.setTag('http.method',        req.method);
        scope.setTag('http.url',           req.originalUrl);
        scope.setLevel('error');

        if (req.user?.id) {
          scope.setUser({
            id:    req.user.id,
            email: req.user.email,
            role:  req.user.role,
          });
        }

        // Add request body (scrubbed of sensitive fields)
        const safeBody = { ...(req.body as Record<string, unknown> ?? {}) };
        const SCRUB    = ['password', 'new_password', 'current_password',
                          'confirm_password', 'token', 'fcm_token'];
        for (const k of SCRUB) delete safeBody[k];
        scope.setExtra('request.body', safeBody);
        scope.setExtra('request.id',   req.headers['x-request-id']);

        Sentry.captureException(appError);
      });
    }
  }

  // ─── Response ──────────────────────────────────────────────────────────────
  // In development, include the stack trace for debugging ease.
  // In production, NEVER include stack traces — they reveal internal structure.
  const body = appError.toJSON(isDev);

  res.status(appError.statusCode).json(body);
};

// ─── 404 handler ─────────────────────────────────────────────────────────────
// Catches requests to undefined routes BEFORE the error handler.
// Must be registered AFTER all routes but BEFORE errorHandler in app.ts.

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const err = new AppError(`Route not found: ${req.method} ${req.path}`, {
    statusCode: 404,
    code: 'ROUTE_NOT_FOUND',
  });
  next(err);
}
