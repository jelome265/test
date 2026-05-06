/**
 * sentry.ts — Sentry SDK initialization.
 *
 * MUST be imported as the VERY FIRST statement in src/index.ts,
 * before any other application code loads.
 *
 * Why first? Sentry patches Node's module system to add automatic
 * instrumentation. If any module loads before Sentry initializes,
 * those modules won't be instrumented and errors inside them won't
 * be captured with full context.
 *
 * Configuration:
 *   - Production: tracesSampleRate 0.10 (10% of requests traced)
 *   - Staging:    tracesSampleRate 0.50
 *   - Development: disabled (no DSN)
 *
 * Tags added to every event:
 *   - service:     'courier-backend'
 *   - version:     package.json version
 *   - environment: NODE_ENV value
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Read environment directly — env.ts validates later.
// This avoids circular import (env.ts imports logger which may import sentry).
const dsn         = process.env['SENTRY_DSN'];
const environment = process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'development';
const version     = process.env['npm_package_version'] ?? '1.7.0';
const isProduction = environment === 'production';
const isTest       = environment === 'test';

export function initSentry(): void {
  // Skip in test and dev without a DSN
  if (isTest || !dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: `courier-backend@${version}`,

    // Traces: only sample a fraction in production to control cost.
    // 10% in production, 50% in staging, 100% in development (if DSN present).
    tracesSampleRate: isProduction ? 0.10 : 0.50,

    // Profiling: only in production, 10% of traced requests
    profilesSampleRate: isProduction ? 0.10 : 0,

    integrations: [
      // Auto-instrument: http, https, net, dns, child_process, fs
      Sentry.httpIntegration(),

      // Connect/Express middleware instrumentation
      Sentry.expressIntegration(),

      // Profiling (requires @sentry/profiling-node)
      ...(isProduction ? [nodeProfilingIntegration()] : []),
    ],

    // Scrub sensitive data before sending to Sentry
    beforeSend(event, _hint) {
      // Never send PII in exception breadcrumbs
      if (event.request?.data) {
        const data = event.request.data as Record<string, unknown>;
        const SENSITIVE = ['password', 'new_password', 'current_password', 'confirm_password',
                           'token', 'access_token', 'refresh_token', 'fcm_token',
                           'card_number', 'cvv'];
        for (const key of SENSITIVE) {
          if (key in data) {
            (event.request.data as Record<string, unknown>)[key] = '[FILTERED]';
          }
        }
      }

      // Drop health check noise
      if (event.request?.url?.includes('/api/v1/health')) {
        return null;
      }

      return event;
    },

    // Ignore these noisy operational errors
    ignoreErrors: [
      'ECONNRESET',
      'ECONNABORTED',
      'EPIPE',
      'ETIMEDOUT',
      'AbortError',
    ],

    // Add global tags to every event
    initialScope: {
      tags: {
        service:     'courier-backend',
        version,
      },
    },
  });
}

/**
 * Wrap an error with additional Sentry context before re-throwing.
 * Use in catch blocks where you want to add structured data.
 *
 * @example
 *   captureWithContext(err, { shipmentId, userId, operation: 'advance_payment' });
 *   throw err;
 */
export function captureWithContext(
  err:     unknown,
  context: Record<string, string | number | boolean>,
): void {
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(err);
  });
}
