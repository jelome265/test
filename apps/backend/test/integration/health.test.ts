/**
 * health.test.ts — Health endpoint integration tests.
 *
 * Tests the actual HTTP layer using supertest.
 * Supabase and Redis are mocked — this tests routing and response structure,
 * not real connectivity (connectivity is tested by bootstrap() in index.ts).
 *
 * Run: npm run test -- --filter health
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// ─── Mock external dependencies BEFORE importing app ──────────────────────────
// This prevents real connections in test environment

vi.mock('../../src/config/supabase.js', () => ({
  supabaseServiceRole: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'No token' },
      }),
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
  checkSupabaseHealth: vi.fn().mockResolvedValue({ ok: true, latencyMs: 5 }),
}));

vi.mock('../../src/config/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue({ ping: vi.fn().mockResolvedValue('PONG') }),
  checkRedisHealth: vi.fn().mockResolvedValue({ ok: true, latencyMs: 2 }),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config/firebase.js', () => ({
  getFirebaseApp: vi.fn().mockReturnValue({ name: 'test' }),
  checkFirebaseHealth: vi.fn().mockResolvedValue({ ok: true }),
  getFirebaseMessaging: vi.fn(),
}));

// ─── Import app AFTER mocks are in place ──────────────────────────────────────
import { createApp } from '../../src/app.js';

describe('GET /api/v1/health', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns service name', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.body.service).toBe('courier-backend');
  });

  it('returns environment', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.body.environment).toBe('test');
  });

  it('returns ISO 8601 timestamp', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(new Date(res.body.timestamp as string).toISOString()).toBeTruthy();
  });

  it('does not include sensitive config data', async () => {
    const res = await request(app).get('/api/v1/health');
    const body = JSON.stringify(res.body);

    expect(body).not.toContain('supabase');
    expect(body).not.toContain('redis');
    expect(body).not.toContain('key');
    expect(body).not.toContain('secret');
  });
});

describe('GET /api/v1/health/detailed', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it('returns 401 without authorization token', async () => {
    const res = await request(app).get('/api/v1/health/detailed');
    expect(res.status).toBe(401);
  });

  it('returns error code UNAUTHORIZED when not authenticated', async () => {
    const res = await request(app).get('/api/v1/health/detailed');
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('Unknown routes', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it('returns 404 for undefined routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('ROUTE_NOT_FOUND');
  });

  it('returns 404 for POST to health route', async () => {
    const res = await request(app).post('/api/v1/health');
    expect(res.status).toBe(404);
  });
});

describe('Security headers', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it('sets X-Content-Type-Options: nosniff (helmet)', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not expose X-Powered-By', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets X-Frame-Options (helmet)', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-frame-options']).toBeTruthy();
  });
});

describe('Error response envelope', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it('error responses always have error and message fields', async () => {
    const res = await request(app).get('/api/v1/nonexistent-route');

    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
    expect(typeof res.body.error).toBe('string');
    expect(typeof res.body.message).toBe('string');
  });

  it('error responses never include stack traces in test env', async () => {
    // In test env, isDev = false (NODE_ENV=test), so stacks are suppressed
    const res = await request(app).get('/api/v1/nonexistent-route');
    expect(res.body.stack).toBeUndefined();
  });
});
