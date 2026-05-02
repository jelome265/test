/**
 * health.routes.ts — Health check endpoints.
 *
 * GET /api/health
 *   Public. Returns 200 if the server is running.
 *   Used by: Docker HEALTHCHECK, Railway health probe, load balancer.
 *   Response time target: < 5ms (no DB or Redis calls).
 *
 * GET /api/health/detailed
 *   Admin-only. Returns connectivity status for all dependencies.
 *   Used by: on-call engineers, deployment verification scripts.
 *   Response time: varies (makes live checks to Supabase + Redis + Firebase).
 *
 * Note on 503 responses:
 *   If any dependency is unhealthy, the endpoint returns HTTP 503
 *   with a JSON body identifying which checks failed.
 *   This allows load balancers to route traffic away from degraded instances.
 */

import { Router } from 'express';

import { checkSupabaseHealth } from '../config/supabase.js';
import { checkRedisHealth } from '../config/redis.js';
import { checkFirebaseHealth } from '../config/firebase.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdminRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { env } from '../config/env.js';

export const healthRouter = Router();

// ─── GET /api/health ──────────────────────────────────────────────────────────
// Intentionally minimal — any computation here adds latency to probe checks.
healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status:      'ok',
    service:     'courier-backend',
    environment: env.NODE_ENV,
    timestamp:   new Date().toISOString(),
  });
});

// ─── GET /api/health/detailed ─────────────────────────────────────────────────
healthRouter.get(
  '/detailed',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (_req, res) => {
    // Run all checks concurrently — don't let a slow check block a fast one
    const [supabase, redis, firebase] = await Promise.all([
      checkSupabaseHealth(),
      checkRedisHealth(),
      checkFirebaseHealth(),
    ]);

    const checks = {
      supabase: {
        ok:        supabase.ok,
        latencyMs: supabase.latencyMs,
      },
      redis: {
        ok:        redis.ok,
        latencyMs: redis.latencyMs,
      },
      firebase: {
        ok: firebase.ok,
      },
    };

    const allHealthy = Object.values(checks).every((c) => c.ok);

    res.status(allHealthy ? 200 : 503).json({
      status:    allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  }),
);
