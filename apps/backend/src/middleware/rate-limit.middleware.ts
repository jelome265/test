/**
 * rate-limit.middleware.ts — Composable rate limiters.
 *
 * Three rate limiters with different configurations:
 *
 *   globalRateLimit    → Applied to all routes: 100 req / 15 min per IP
 *   authRateLimit      → Login/register: 10 req / 15 min per IP (brute-force prevention)
 *   paymentRateLimit   → Payment initiation: 20 req / hour per IP
 *
 * Rationale for IP-based limiting in Phase 1:
 *   User-based limiting (by user ID) is more accurate but requires the auth
 *   middleware to run first. IP-based is simpler and sufficient for Phase 1.
 *   Upgrade to user-based limiting in Phase 4 if abuse patterns emerge.
 *
 * Rate limit state is stored in-memory by express-rate-limit's default store.
 * This is adequate for a single-instance deployment.
 *
 * PHASE 2 UPGRADE PATH: If you horizontally scale beyond one instance,
 * switch to rate-limit-redis store:
 *   npm install rate-limit-redis
 *   store: new RedisStore({ client: getRedis() })
 * Without this, each instance has independent counters and effective limits
 * are multiplied by instance count.
 */

import rateLimit from 'express-rate-limit';

import { GLOBAL_RATE_LIMIT_PER_15MIN, AUTH_RATE_LIMIT_PER_15MIN, PAYMENT_RATE_LIMIT_PER_HOUR } from '@courier/shared-constants';
import { RateLimitError } from '../errors/app-error.js';

// ─── Helper: rate limiter factory ────────────────────────────────────────────

function createLimiter(options: {
  windowMs:   number;
  max:        number;
  message:    string;
  prefix:     string;
}): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs:         options.windowMs,
    max:              options.max,
    standardHeaders:  'draft-7',  // Emit RateLimit-* headers per RFC 6585 draft 7
    legacyHeaders:    false,       // Disable X-RateLimit-* headers (deprecated)
    keyGenerator:     (req) => {
      // Use forwarded IP if behind a trusted proxy (Railway, Fly.io, etc.)
      const forwardedFor = req.headers['x-forwarded-for'];
      const ip = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : (forwardedFor?.split(',')[0] ?? req.ip ?? 'unknown');
      return `${options.prefix}:${ip}`;
    },
    handler: (_req, _res, next) => {
      next(new RateLimitError(options.message));
    },
    // Skip rate limiting in test environment
    skip: () => process.env['NODE_ENV'] === 'test',
  });
}

// ─── Global rate limiter ──────────────────────────────────────────────────────
// Applied to ALL routes via app.ts. Provides a baseline protection layer.

export const globalRateLimit = createLimiter({
  windowMs: 15 * 60 * 1000,        // 15 minutes
  max:      GLOBAL_RATE_LIMIT_PER_15MIN,
  message:  'Too many requests from this IP. Please try again in 15 minutes.',
  prefix:   'global',
});

// ─── Auth rate limiter ────────────────────────────────────────────────────────
// Applied to: POST /api/auth/login, POST /api/auth/register
// Prevents brute-force password attacks and account enumeration.

export const authRateLimit = createLimiter({
  windowMs: 15 * 60 * 1000,        // 15 minutes
  max:      AUTH_RATE_LIMIT_PER_15MIN,
  message:  'Too many authentication attempts. Please wait 15 minutes before trying again.',
  prefix:   'auth',
});

// ─── Payment rate limiter ─────────────────────────────────────────────────────
// Applied to: POST /api/payments/initiate
// Prevents payment abuse and accidental duplicate initiations.

export const paymentRateLimit = createLimiter({
  windowMs: 60 * 60 * 1000,        // 1 hour
  max:      PAYMENT_RATE_LIMIT_PER_HOUR,
  message:  'Too many payment attempts. Please wait before trying again.',
  prefix:   'payment',
});
