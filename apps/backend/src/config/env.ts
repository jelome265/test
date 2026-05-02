/**
 * env.ts — Zod-validated environment configuration.
 *
 * INVARIANT: This module calls process.exit(1) if ANY required variable is
 * missing or malformed. No server socket is opened before this runs.
 *
 * Usage: import { env } from './config/env.js';
 * Never use process.env directly after this module is loaded.
 */

import { z } from 'zod';

// ─── Schema ───────────────────────────────────────────────────────────────────
const EnvSchema = z.object({
  // ─── Node ────────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),

  // ─── CORS ────────────────────────────────────────────────────────────────
  // Comma-separated list of allowed origins.
  // Example: "http://localhost:8081,https://yourcourier.com"
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1, 'CORS_ALLOWED_ORIGINS must not be empty')
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  // ─── Supabase ────────────────────────────────────────────────────────────
  SUPABASE_URL: z
    .string()
    .url('SUPABASE_URL must be a valid URL')
    .refine((url) => url.includes('supabase.co') || url.includes('localhost'), {
      message: 'SUPABASE_URL does not look like a Supabase endpoint',
    }),
  SUPABASE_ANON_KEY: z
    .string()
    .min(100, 'SUPABASE_ANON_KEY appears too short — check your .env'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(100, 'SUPABASE_SERVICE_ROLE_KEY appears too short — check your .env'),

  // ─── Paychangu ───────────────────────────────────────────────────────────
  PAYCHANGU_PUBLIC_KEY: z.string().min(10),
  PAYCHANGU_SECRET_KEY: z.string().min(10),
  PAYCHANGU_WEBHOOK_SECRET: z
    .string()
    .min(32, 'PAYCHANGU_WEBHOOK_SECRET must be at least 32 characters for HMAC security'),
  PAYCHANGU_BASE_URL: z.string().url().default('https://api.paychangu.com'),

  // ─── Firebase ────────────────────────────────────────────────────────────
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  // Private key has escaped newlines in .env — transform restores them
  FIREBASE_PRIVATE_KEY: z
    .string()
    .min(100)
    .transform((key) => key.replace(/\\n/g, '\n')),

  // ─── Google Maps ─────────────────────────────────────────────────────────
  GOOGLE_MAPS_SERVER_KEY: z.string().min(10),

  // ─── Redis ───────────────────────────────────────────────────────────────
  REDIS_URL: z
    .string()
    .url()
    .refine((url) => url.startsWith('redis://') || url.startsWith('rediss://'), {
      message: 'REDIS_URL must use redis:// or rediss:// scheme',
    }),

  // ─── Sentry ──────────────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z
    .enum(['development', 'staging', 'production'])
    .default('development'),

  // ─── Admin ───────────────────────────────────────────────────────────────
  ADMIN_EMAIL: z.string().email(),
});

// ─── Validation ───────────────────────────────────────────────────────────────
function validateEnv(): z.infer<typeof EnvSchema> {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    // Use process.stderr.write directly — logger may not be initialized yet
    process.stderr.write(
      `\n[FATAL] Environment validation failed. Fix these variables and restart:\n${formatted}\n\n`,
    );

    // Exit code 1 — signals container orchestrators to not mark as healthy
    process.exit(1);
  }

  return result.data;
}

// ─── Singleton ────────────────────────────────────────────────────────────────
// Parsed exactly once at module load. Subsequent imports get the cached value.
export const env = validateEnv();

// ─── Derived helpers ──────────────────────────────────────────────────────────
export const isDev  = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
export const isProd = env.NODE_ENV === 'production';

export type Env = typeof env;
