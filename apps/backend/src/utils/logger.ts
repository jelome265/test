/**
 * logger.ts — Pino structured logger.
 *
 * Production: JSON output to stdout (consumed by log aggregator)
 * Development: Pretty-printed output via pino-pretty
 * Test: Silent (suppressed to avoid noise in test output)
 *
 * Redaction: Fields containing sensitive data are redacted before
 * any log is written. This is enforced by Pino's redact option —
 * it runs BEFORE the log is serialized, not after.
 *
 * INVARIANT: Never log passwords, tokens, card numbers, or private keys.
 * The redact list below covers known sensitive field paths. If you add
 * new sensitive fields anywhere in the codebase, add them here.
 */

import pino, { type Logger } from 'pino';

import { isDev, isTest } from '../config/env.js';

// ─── Sensitive field paths to redact ─────────────────────────────────────────
// Pino uses dot-notation paths relative to the log object.
// Wildcards (*) match any key at that depth.
const REDACTED_PATHS = [
  // Auth tokens
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',

  // Request/response bodies with sensitive fields
  'body.password',
  'body.new_password',
  'body.current_password',
  'body.confirm_password',

  // Supabase / Firebase keys that might slip into log calls
  'supabase_service_role_key',
  'firebase_private_key',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FIREBASE_PRIVATE_KEY',

  // Payment data
  'body.card_number',
  'body.cvv',
  'body.card_cvv',
  'callback_payload.card',

  // FCM tokens (PII — tied to device identity)
  'body.fcm_token',
  'fcm_token',

  // ── Phase 9 PII expansion ──────────────────────────────────────
  // Phone numbers and precise addresses are PII
  'body.sender.phone_number',
  'body.receiver.phone_number',
  'body.sender.address',
  'body.receiver.address',
  'shipment.sender_phone',
  'shipment.receiver_phone',
];

// ─── Logger factory ───────────────────────────────────────────────────────────
function createLogger(): Logger {
  if (isTest) {
    return pino({ level: 'silent' });
  }

  if (isDev) {
    return pino({
      level: 'debug',
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          messageFormat: '{msg}',
        },
      },
    });
  }

  // Production: structured JSON, emitted to stdout
  return pino({
    level: 'info',
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    // Disable sync mode — Pino is async by default in production
    // which is correct: never block the event loop on log I/O
    formatters: {
      // Rename 'level' numeric to a human-readable string in JSON output
      level(label: string) {
        return { level: label };
      },
    },
    // Base properties attached to every log entry
    base: {
      service: 'courier-backend',
      version:  process.env['npm_package_version'] ?? '1.0.0',
    },
    // ISO 8601 timestamp
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export const logger = createLogger();

// ─── Child logger factory ─────────────────────────────────────────────────────
// Create a child logger with additional context bound to every log entry.
// Use in services: const log = childLogger({ service: 'payment.service' });
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export type { Logger };
