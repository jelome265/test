/**
 * notification.integration.test.ts — Notification HTTP integration tests.
 *
 * Tests routing, auth enforcement, response shapes, and error handling
 * for all 4 notification endpoints.
 *
 * Run: npm run test -- --filter notification.integration
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// ─── Hoist mocks ─────────────────────────────────────────────────────────────
const {
  mockListNotifications,
  mockGetUnreadCount,
  mockMarkAsRead,
  mockMarkAllAsRead,
} = vi.hoisted(() => ({
  mockListNotifications: vi.fn(),
  mockGetUnreadCount:    vi.fn(),
  mockMarkAsRead:        vi.fn(),
  mockMarkAllAsRead:     vi.fn(),
}));

vi.mock('../../src/config/supabase.js', () => ({
  supabaseServiceRole: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } }, error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'user-123', email: 'test@example.com',
          role: 'customer', full_name: 'Test',
          phone_number: '+265991234567', is_active: true, fcm_token: null,
        },
        error: null,
      }),
    }),
  }),
}));

vi.mock('../../src/config/redis.js', () => ({
  getRedis:         vi.fn().mockReturnValue({ ping: vi.fn().mockResolvedValue('PONG'), on: vi.fn() }),
  checkRedisHealth: vi.fn().mockResolvedValue({ ok: true, latencyMs: 2 }),
  closeRedis:       vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config/firebase.js', () => ({
  getFirebaseApp:      vi.fn().mockReturnValue({ name: 'test' }),
  checkFirebaseHealth: vi.fn().mockResolvedValue({ ok: true }),
  getFirebaseMessaging: vi.fn(),
}));

vi.mock('../../src/services/notification.service.js', () => ({
  notificationService: {
    listNotifications: mockListNotifications,
    getUnreadCount:    mockGetUnreadCount,
    markAsRead:        mockMarkAsRead,
    markAllAsRead:     mockMarkAllAsRead,
  },
}));

// Mock workers to avoid starting real ones in integration test
vi.mock('../../src/workers/notification.worker.js', () => ({
  NotificationWorker: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('../../src/workers/expiry.worker.js', () => ({
  ExpiryWorker: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('../../src/queues/expiry.queue.js', () => ({
  scheduleExpiryJob: vi.fn().mockResolvedValue(undefined),
}));

import { createApp } from '../../src/app.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_NOTIFICATION = {
  id:          'notif-1',
  user_id:     'user-123',
  shipment_id: 'ship-1',
  type:        'shipment_approved',
  title:       'Request Approved ✓',
  body:        'CRR-20240101-A3F9C2 approved.',
  data:        { screen: '/(app)/shipments/ship-1' },
  is_read:     false,
  push_sent:   true,
  created_at:  '2024-01-01T00:00:00Z',
};

const MOCK_LIST_RESULT = {
  data:         [MOCK_NOTIFICATION],
  next_cursor:  null,
  unread_count: 1,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

let app: Express;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /api/v1/notifications ────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  it('returns 200 with notifications list and unread_count', async () => {
    mockListNotifications.mockResolvedValue(MOCK_LIST_RESULT);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.unread_count).toBe(1);
    expect(res.body.next_cursor).toBeNull();
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('passes limit query parameter to service', async () => {
    mockListNotifications.mockResolvedValue({ data: [], next_cursor: null, unread_count: 0 });

    await request(app)
      .get('/api/v1/notifications?limit=10')
      .set('Authorization', 'Bearer valid-token');

    expect(mockListNotifications).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('passes cursor query parameter to service', async () => {
    mockListNotifications.mockResolvedValue({ data: [], next_cursor: null, unread_count: 0 });

    const cursor = Buffer.from(JSON.stringify({ created_at: '2024-01-01', id: 'abc' })).toString('base64url');

    await request(app)
      .get(`/api/v1/notifications?cursor=${cursor}`)
      .set('Authorization', 'Bearer valid-token');

    expect(mockListNotifications).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ cursor }),
    );
  });

  it('passes unread_only=true when query param is true', async () => {
    mockListNotifications.mockResolvedValue({ data: [], next_cursor: null, unread_count: 0 });

    await request(app)
      .get('/api/v1/notifications?unread_only=true')
      .set('Authorization', 'Bearer valid-token');

    expect(mockListNotifications).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ unread_only: true }),
    );
  });

  it('defaults to unread_only=false when not specified', async () => {
    mockListNotifications.mockResolvedValue({ data: [], next_cursor: null, unread_count: 0 });

    await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', 'Bearer valid-token');

    expect(mockListNotifications).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ unread_only: false }),
    );
  });
});

// ─── GET /api/v1/notifications/unread-count ───────────────────────────────────

describe('GET /api/v1/notifications/unread-count', () => {
  it('returns 200 with count', async () => {
    mockGetUnreadCount.mockResolvedValue(5);

    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(5);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/notifications/unread-count');
    expect(res.status).toBe(401);
  });

  it('returns 0 when no unread notifications', async () => {
    mockGetUnreadCount.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', 'Bearer valid-token');

    expect(res.body.data.count).toBe(0);
  });
});

// ─── PATCH /api/v1/notifications/read-all ────────────────────────────────────

describe('PATCH /api/v1/notifications/read-all', () => {
  it('returns 200 with marked_count', async () => {
    mockMarkAllAsRead.mockResolvedValue(7);

    const res = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.marked_count).toBe(7);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).patch('/api/v1/notifications/read-all');
    expect(res.status).toBe(401);
  });

  it('returns 0 when all already read', async () => {
    mockMarkAllAsRead.mockResolvedValue(0);

    const res = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', 'Bearer valid-token');

    expect(res.body.data.marked_count).toBe(0);
  });
});

// ─── PATCH /api/v1/notifications/:id/read ────────────────────────────────────

describe('PATCH /api/v1/notifications/:id/read', () => {
  it('returns 204 when notification is marked read', async () => {
    mockMarkAsRead.mockResolvedValue(undefined);

    const res = await request(app)
      .patch('/api/v1/notifications/notif-1/read')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(204);
    expect(mockMarkAsRead).toHaveBeenCalledWith('notif-1', 'user-123');
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).patch('/api/v1/notifications/notif-1/read');
    expect(res.status).toBe(401);
  });

  it('returns 404 when notification not found', async () => {
    const { NotFoundError } = await import('../../src/errors/app-error.js');
    mockMarkAsRead.mockRejectedValue(new NotFoundError('Notification'));

    const res = await request(app)
      .patch('/api/v1/notifications/nonexistent/read')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('enforces ownership — 404 for wrong user', async () => {
    const { NotFoundError } = await import('../../src/errors/app-error.js');
    mockMarkAsRead.mockRejectedValue(new NotFoundError('Notification'));

    const res = await request(app)
      .patch('/api/v1/notifications/other-users-notif/read')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);  // 404, not 403 (don't reveal existence)
  });

  it('calls markAsRead with correct userId from req.user', async () => {
    mockMarkAsRead.mockResolvedValue(undefined);

    await request(app)
      .patch('/api/v1/notifications/notif-1/read')
      .set('Authorization', 'Bearer valid-token');

    expect(mockMarkAsRead).toHaveBeenCalledWith('notif-1', 'user-123');
  });
});

// ─── Route ordering: /unread-count and /read-all must not match /:id ──────────

describe('Route ordering — static paths take precedence over /:id', () => {
  it('/unread-count is not matched as /:id', async () => {
    mockGetUnreadCount.mockResolvedValue(3);

    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', 'Bearer valid-token');

    // Should hit the unread-count handler, not the /:id handler
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('count');
    // Crucially, markAsRead should NOT have been called
    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });

  it('/read-all is not matched as /:id', async () => {
    mockMarkAllAsRead.mockResolvedValue(0);

    const res = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', 'Bearer valid-token');

    // Should hit read-all handler
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('marked_count');
    // markAsRead (the /:id handler) should NOT have been called
    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });
});
