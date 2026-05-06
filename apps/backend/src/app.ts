/**
 * app.ts — Express application factory.
 *
 * Returns a configured Express app WITHOUT starting a server.
 * Separation of app creation from server start enables:
 *   - Supertest integration tests (mount the app without binding to a port)
 *   - Clean server initialization (index.ts handles connections)
 *
 * App lifecycle:
 *   1. Initialize core middleware (security, parsing, logging)
 *   2. Setup webhook routes (must be before body parser for HMAC integrity)
 *   3. Setup health and public routes
 *   4. Apply auth and business routes
 *   5. Global error handling
 */

import compression from 'compression';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { globalRateLimit } from './middleware/rate-limit.middleware.js';
import { captureRawBody } from './middleware/raw-body.middleware.js';
import { requestId } from './middleware/request-id.middleware.js';
import { adminRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { notificationRouter } from './routes/notification.routes.js';
import { paymentRouter } from './routes/payment.routes.js';
import { shipmentRouter, adminShipmentRouter } from './routes/shipment.routes.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();

  // ─── 1. Security & Core Middleware ───────────────────────────────────────────
  // Attach unique request ID
  app.use(requestId);

  // Helmet adds secure HTTP headers (HSTS, CSP, etc.)
  app.use(helmet());

  // CORS configuration — restricted to allowed origins
  app.use(cors({
    origin:         env.CORS_ALLOWED_ORIGINS,
    methods:        ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Expose RateLimit headers to clients
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    // No credentials: we use Bearer tokens in Authorization header, not cookies
    credentials:    false,
  }));

  // Gzip compression for performance
  app.use(compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  }));

  // Standard request logging (Pino-http)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info({
        method: req.method,
        url:    req.originalUrl,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip:     req.ip,
      });
    });
    next();
  });

  // ─── 2. Webhook Routes (RAW BODY REQUIRED) ───────────────────────────────────
  // Webhooks require the raw request body buffer for HMAC signature verification.
  // They MUST be mounted BEFORE express.json() or the body will be parsed
  // into an object, breaking the signature calculation.
  app.use('/api/v1/webhooks', captureRawBody, webhookRouter);

  // ─── 3. Standard Parsing Middleware ──────────────────────────────────────────
  // After webhooks, parse JSON bodies for standard API endpoints.
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ─── 4. Rate Limiting ────────────────────────────────────────────────────────
  // Prevent brute force and DoS.
  app.use(globalRateLimit);

  // ─── 5. API V1 Routes ────────────────────────────────────────────────────────
  const v1Router = Router();

  // Public/Infrastructure
  v1Router.use('/health',        healthRouter);

  // Auth System
  v1Router.use('/auth',          authRouter);

  // Shipment Engine
  v1Router.use('/shipments',     shipmentRouter);
  v1Router.use('/admin',         adminRouter);
  v1Router.use('/admin/shipments', adminShipmentRouter);

  // Payment System
  v1Router.use('/payments',      paymentRouter);

  // Notification System
  v1Router.use('/notifications', notificationRouter);

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
