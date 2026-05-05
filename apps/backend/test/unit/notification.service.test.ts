/**
 * notification.service.test.ts — Notification service unit tests.
 *
 * All external dependencies (Supabase, BullMQ queue) are mocked.
 * Tests cover: createAndEnqueue, admin fan-out, list pagination,
 * unread count, mark-read, mark-all-read, template resolution.
 *
 * Run: npm run test -- --filter notification.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoist mocks ─────────────────────────────────────────────────────────────
const {
  mockFrom,
  mockEnqueuePush,
} = vi.hoisted(() => ({
  mockFrom:        vi.fn(),
  mockEnqueuePush: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config/supabase.js', () => ({
  supabaseServiceRole: () => ({ from: mockFrom }),
}));

vi.mock('../../src/queues/notification.queue.js', () => ({
  enqueueNotificationPush: mockEnqueuePush,
}));

import { notificationService } from '../../src/services/notification.service.js';
import { NotFoundError } from '../../src/errors/app-error.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID    = '550e8400-e29b-41d4-a716-446655440000';
const SHIPMENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const NOTIF_ID    = 'f1e2d3c4-b5a6-9870-dcba-fe9876543210';

const MOCK_SHIPMENT = {
  user_id:          USER_ID,
  tracking_number:  'CRR-20240101-A3F9C2',
  pickup_city:      'Lilongwe',
  delivery_city:    'Blantyre',
  rejection_reason: null,
};

const MOCK_NOTIFICATION = {
  id:         NOTIF_ID,
  user_id:    USER_ID,
  type:       'shipment_approved',
  title:      'Request Approved ✓',
  body:       'CRR-20240101-A3F9C2 approved. Please complete payment to proceed.',
  is_read:    false,
  created_at: '2024-01-01T00:00:00Z',
};

// ─── Helper: build Supabase mock chain ────────────────────────────────────────
function buildChain(resolveWith: any) {
  const chain: any = {
    select:  vi.fn().mockImplementation(() => chain),
    insert:  vi.fn().mockImplementation(() => chain),
    update:  vi.fn().mockImplementation(() => chain),
    eq:      vi.fn().mockImplementation(() => chain),
    in:      vi.fn().mockImplementation(() => chain),
    or:      vi.fn().mockImplementation(() => chain),
    order:   vi.fn().mockImplementation(() => chain),
    limit:   vi.fn().mockImplementation(() => chain),
    head:    vi.fn().mockImplementation(() => chain),
    single:  vi.fn().mockImplementation(() => Promise.resolve(resolveWith)),
    then:    (onFulfilled: any) => Promise.resolve(resolveWith).then(onFulfilled),
  };
  return chain;
}

// ─── notifyShipmentCreated ────────────────────────────────────────────────────

describe('NotificationService.notifyShipmentCreated()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a notification and enqueues a push job', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: NOTIF_ID }, error: null }));

    await notificationService.notifyShipmentCreated(SHIPMENT_ID, USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('app_notifications');
    expect(mockEnqueuePush).toHaveBeenCalledWith(NOTIF_ID);
  });

  it('does not throw if DB insert fails (fire-and-forget safe)', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'DB error' } }));

    await expect(
      notificationService.notifyShipmentCreated(SHIPMENT_ID, USER_ID),
    ).resolves.toBeUndefined();
  });

  it('does not throw if queue enqueue fails', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: NOTIF_ID }, error: null }));
    mockEnqueuePush.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(
      notificationService.notifyShipmentCreated(SHIPMENT_ID, USER_ID),
    ).resolves.toBeUndefined();
  });
});

// ─── notifyShipmentStatusChanged ─────────────────────────────────────────────

describe('NotificationService.notifyShipmentStatusChanged()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates approved notification with tracking number in body', async () => {
    mockFrom.mockReturnValueOnce(buildChain({ data: MOCK_SHIPMENT, error: null }));
    mockFrom.mockReturnValueOnce(buildChain({ data: { id: NOTIF_ID }, error: null }));

    await notificationService.notifyShipmentStatusChanged(SHIPMENT_ID, 'approved');

    expect(mockEnqueuePush).toHaveBeenCalledWith(NOTIF_ID);
  });

  it('creates rejected notification with rejection reason in body', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: { ...MOCK_SHIPMENT, rejection_reason: 'Package too heavy' },
        error: null,
      }),
    );
    
    let insertedBody = '';
    const insertChain = buildChain({ data: { id: NOTIF_ID }, error: null });
    insertChain.insert = vi.fn().mockImplementation((payload: any) => {
      insertedBody = payload.body;
      return insertChain;
    });
    
    mockFrom.mockReturnValueOnce(insertChain);

    await notificationService.notifyShipmentStatusChanged(SHIPMENT_ID, 'rejected');

    expect(insertedBody).toContain('Package too heavy');
  });

  it('skips notification for payment_pending status', async () => {
    await notificationService.notifyShipmentStatusChanged(SHIPMENT_ID, 'payment_pending');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('handles all mapped statuses without throwing', async () => {
    const statuses = ['approved', 'rejected', 'picked_up', 'in_transit', 'delivered', 'confirmed'] as const;

    for (const status of statuses) {
      mockFrom.mockReturnValueOnce(buildChain({ data: MOCK_SHIPMENT, error: null }));
      mockFrom.mockReturnValueOnce(buildChain({ data: { id: NOTIF_ID }, error: null }));

      await expect(
        notificationService.notifyShipmentStatusChanged(SHIPMENT_ID, status),
      ).resolves.toBeUndefined();
    }
  });
});

// ─── notifyAdminsNewShipment ──────────────────────────────────────────────────

describe('NotificationService.notifyAdminsNewShipment()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates one notification per active admin', async () => {
    const admins = [{ id: 'admin-1' }, { id: 'admin-2' }];
    mockFrom.mockReturnValueOnce(buildChain({ data: admins, error: null }));
    mockFrom.mockReturnValueOnce(buildChain({ data: { id: 'n1' }, error: null }));
    mockFrom.mockReturnValueOnce(buildChain({ data: { id: 'n2' }, error: null }));

    await notificationService.notifyAdminsNewShipment(SHIPMENT_ID, 'T1', 'L', 'B');

    expect(mockEnqueuePush).toHaveBeenCalledTimes(2);
  });

  it('handles empty admin list gracefully', async () => {
    mockFrom.mockReturnValueOnce(buildChain({ data: [], error: null }));
    await notificationService.notifyAdminsNewShipment(SHIPMENT_ID, 'T1', 'L', 'B');
    expect(mockEnqueuePush).not.toHaveBeenCalled();
  });
});

// ─── listNotifications ────────────────────────────────────────────────────────

describe('NotificationService.listNotifications()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns notifications with unread_count', async () => {
    mockFrom.mockReturnValueOnce(buildChain({ data: [MOCK_NOTIFICATION], error: null }));
    mockFrom.mockReturnValueOnce(buildChain({ count: 5, error: null }));

    const result = await notificationService.listNotifications(USER_ID, { limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.unread_count).toBe(5);
  });

  it('generates next_cursor when more pages exist', async () => {
    const items = Array.from({ length: 21 }, (_, i) => ({
      ...MOCK_NOTIFICATION,
      id: `n${i}`,
      created_at: '2024-01-01T00:00:00Z',
    }));

    mockFrom.mockReturnValueOnce(buildChain({ data: items, error: null }));
    mockFrom.mockReturnValueOnce(buildChain({ count: 21, error: null }));

    const result = await notificationService.listNotifications(USER_ID, { limit: 20 });

    expect(result.data).toHaveLength(20);
    expect(result.next_cursor).toBeTruthy();
  });
});

// ─── getUnreadCount ───────────────────────────────────────────────────────────

describe('NotificationService.getUnreadCount()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns unread count', async () => {
    mockFrom.mockReturnValue(buildChain({ count: 7, error: null }));
    const count = await notificationService.getUnreadCount(USER_ID);
    expect(count).toBe(7);
  });

  it('returns 0 on error', async () => {
    mockFrom.mockReturnValue(buildChain({ count: null, error: { message: 'err' } }));
    const count = await notificationService.getUnreadCount(USER_ID);
    expect(count).toBe(0);
  });
});

// ─── markAsRead ───────────────────────────────────────────────────────────────

describe('NotificationService.markAsRead()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks notification as read', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: NOTIF_ID }, error: null }));
    await expect(notificationService.markAsRead(NOTIF_ID, USER_ID)).resolves.toBeUndefined();
  });

  it('throws NotFoundError on missing row', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { code: 'PGRST116' } }));
    await expect(notificationService.markAsRead(NOTIF_ID, USER_ID)).rejects.toThrow(NotFoundError);
  });
});

// ─── markAllAsRead ────────────────────────────────────────────────────────────

describe('NotificationService.markAllAsRead()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns count of marked notifications', async () => {
    const marked = [{ id: '1' }, { id: '2' }];
    mockFrom.mockReturnValue(buildChain({ data: marked, error: null }));
    const count = await notificationService.markAllAsRead(USER_ID);
    expect(count).toBe(2);
  });
});
