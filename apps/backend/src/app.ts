/**
 * app.ts — Express application factory.
 *
 * Returns a configured Express app WITHOUT starting a server.
 * Separation of app creation from server start enables:
 *   - Supertest integration tests (mount the app without binding a port)
 *   - Multiple test suites running in parallel
 *   - Clean shutdown without port conflicts
 *
 * Middleware stack order (IMPORTANT — order matters in Express):
 *
 *   1. Sentry request handler     → Must be FIRST to capture all requests
 *   2. helmet                     → Sets security headers on every response
 *   3. compression                → Gzip before any response body is written
 *   4. cors                       → Set CORS headers before other middleware reads them
 *   5. express.json               → Parse request body (before validation runs)
 *   6. pino-http                  → Request/response logging (after body parse)
 *   7. globalRateLimit            → Applied to ALL routes
 *   8. Routes                     → Business logic
 *   9. notFoundHandler            → Catch unmapped routes (AFTER all routes)
 *  10. Sentry error handler       → Capture errors (BEFORE custom error handler)
 *  11. errorHandler               → Global error serializer (LAST)
 */

import * as Sentry from '@sentry/node';
import compression from 'compression';
import cors from 'cors';
import express, { type Express, Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env, isProd, isTest } from './config/env.js';
import { notFoundHandler , errorHandler } from './middleware/error.middleware.js';
import { globalRateLimit } from './middleware/rate-limit.middleware.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { shipmentRouter, adminShipmentRouter } from './routes/shipment.routes.js';
import { logger } from './utils/logger.js';

// ─── Sentry initialization ────────────────────────────────────────────────────
if (env.SENTRY_DSN && isProd) {
  Sentry.init({
    dsn:         env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: isProd ? 0.1 : 0,
    integrations: [
      Sentry.expressIntegration(),
    ],
  });
}

// ─── App factory ─────────────────────────────────────────────────────────────

export function createApp(): Express {
  const app = express();

  // ── Trust proxy: required for correct req.ip when behind Railway/Fly.io/Nginx
  // '1' = trust exactly one hop of forwarding (our load balancer)
  // DO NOT set to 'true' — that trusts ALL X-Forwarded-For values (spoofable)
  app.set('trust proxy', 1);

  // ── Security: remove the X-Powered-By header (reveals Express version)
  app.disable('x-powered-by');

  // ─── 1. Sentry request handler (handled by expressIntegration during init) ───

  // ─── 2. Helmet (security headers) ──────────────────────────────────────────
  app.use(
    helmet({
      // Content Security Policy: no browser rendering, this is an API
      contentSecurityPolicy: false,
      // Cross-Origin Resource Policy: allow API consumers
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // HSTS: enforce HTTPS in production only
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );

  // ─── 3. Compression ─────────────────────────────────────────────────────────
  app.use(compression());

  // ─── 4. CORS ────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, Postman, mobile apps)
        if (!origin) return callback(null, true);

        if (env.CORS_ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin '${origin}' not permitted`));
        }
      },
      credentials:     true,
      methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders:  ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Request-ID'],
      exposedHeaders:  ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
      maxAge:          86400, // Cache preflight response for 24 hours
    }),
  );

  // ─── 5. Body parsers ─────────────────────────────────────────────────────────
  app.use(
    express.json({
      limit: '1mb', // Shipment payloads are small. Reject large bodies early.
      strict: true, // Only parse arrays and objects (no raw primitives)
    }),
  );

  app.use(
    express.urlencoded({
      extended: false, // Use qs library for nested objects (false = simple parser)
      limit:    '1mb',
    }),
  );

  // ─── 6. HTTP request logging ─────────────────────────────────────────────────
  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        // Do not log health check requests — they are high-frequency noise
        autoLogging: {
          ignore: (req) => req.url?.includes('/health') ?? false,
        },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400)        return 'warn';
          return 'info';
        },
        serializers: {
          req(req: express.Request) {
            return {
              method: req.method,
              url:    req.url,
              // Redact authorization header in access logs
              headers: {
                ...req.headers,
                authorization: req.headers.authorization ? '[REDACTED]' : undefined,
              },
            };
          },
        },
      }),
    );
  }

  // ─── 7. Global rate limiter ──────────────────────────────────────────────────
  app.use(globalRateLimit);

  // ─── 8. Routes (Versioned V1) ──────────────────────────────────────────────
  const v1Router = Router();
  
  // Mount health routes first — they have no auth and must respond fast
  v1Router.use('/health', healthRouter);
  v1Router.use('/auth',   authRouter);
  v1Router.use('/shipments', shipmentRouter);
  v1Router.use('/admin',     adminShipmentRouter);

  // Phase 6: v1Router.use('/payments',      paymentRouter);
  // Phase 7: v1Router.use('/notifications', notificationRouter);
  // Phase 8: v1Router.use('/admin',         adminRouter);

  app.use('/api/v1', v1Router);

  // ─── 9. 404 handler (unmapped routes) ────────────────────────────────────────
  app.use(notFoundHandler);

  // ─── 10. Sentry error handler ─────────────────────────────────────────────
  // Note: Sentry v8 setupExpressErrorHandler has different API. Error capture
  // works via expressIntegration during init. Additional capture in errorHandler
  // is handled by Sentry's automatic integration.

  // ─── 11. Global error handler ────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
