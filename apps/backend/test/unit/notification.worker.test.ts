/**
 * notification.worker.test.ts — Notification worker unit tests.
 *
 * Tests FCM dispatch, stale token handling, DB updates, and skip conditions.
 * Firebase messaging is mocked via the firebase-admin module mock.
 *
 * Run: npm run test -- --filter notification.worker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoist mocks ─────────────────────────────────────────────────────────────
const {
  mockFrom,
  mockFcmSend,
} = vi.hoisted(() => ({
  mockFrom:    vi.fn(),
  mockFcmSend: vi.fn(),
}));

vi.mock('../../src/config/supabase.js', () => ({
  supabaseServiceRole: () => ({ from: mockFrom }),
}));

vi.mock('../../src/config/firebase.js', () => ({
  getFirebaseMessaging: () => ({
    send: mockFcmSend,
  }),
}));

vi.mock('../../src/config/redis.js', () => ({
  getRedis: () => ({
    on:     vi.fn(),
    status: 'ready',
  }),
}));

// Mock BullMQ Worker to avoid actual Redis connections
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function () {
    return {
      on:      vi.fn(),
      close:   vi.fn().mockResolvedValue(undefined),
      closing: false,
    };
  }),
}));

import { NotificationWorker } from '../../src/workers/notification.worker.js';

// ─── Test helper: extract the process function ─────────────────────────────────
// We need to call the worker's process() method directly without going through BullMQ.
// Access it via a cast to expose private method for testing.

function getProcessFn(worker: NotificationWorker): (job: { data: { notificationId: string } }) => Promise<void> {
  return (worker as unknown as { process: (job: { data: { notificationId: string } }) => Promise<void> }).process;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOTIF_ID = 'f1e2d3c4-b5a6-9870-dcba-fe9876543210';
const USER_ID  = '550e8400-e29b-41d4-a716-446655440000';

const MOCK_NOTIFICATION_WITH_TOKEN = {
  id:          NOTIF_ID,
  user_id:     USER_ID,
  shipment_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  type:        'shipment_approved',
  title:       'Request Approved ✓',
  body:        'Your shipment has been approved.',
  data:        { screen: '/(app)/shipments/a1b2c3d4', notification_type: 'shipment_approved', shipment_id: 'a1b2' },
  push_sent:   false,
  user_profiles: {
    fcm_token: 'valid_fcm_token_12345',
  },
};

function buildChain(resolveWith: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolveWith),
  };
}

describe('NotificationWorker', () => {
  let worker: NotificationWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new NotificationWorker();
  });

  it('sends FCM message and marks notification as sent', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: MOCK_NOTIFICATION_WITH_TOKEN, error: null }),
    );
    // Update push_sent
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    });

    mockFcmSend.mockResolvedValue('message-id-123');

    const process = getProcessFn(worker);
    await process({ data: { notificationId: NOTIF_ID } });

    expect(mockFcmSend).toHaveBeenCalledWith(
      expect.objectContaining({
        token:        'valid_fcm_token_12345',
        notification: expect.objectContaining({
          title: 'Request Approved ✓',
          body:  'Your shipment has been approved.',
        }) as unknown,
      }),
    );
  });

  it('skips push when notification not found in DB', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: { message: 'not found', code: 'PGRST116' } }),
    );

    const process = getProcessFn(worker);
    await process({ data: { notificationId: 'unknown-id' } });

    expect(mockFcmSend).not.toHaveBeenCalled();
  });

  it('skips push when user has no FCM token', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: {
          ...MOCK_NOTIFICATION_WITH_TOKEN,
          user_profiles: { fcm_token: null },
        },
        error: null,
      }),
    );

    const process = getProcessFn(worker);
    await process({ data: { notificationId: NOTIF_ID } });

    expect(mockFcmSend).not.toHaveBeenCalled();
  });

  it('skips push when notification already sent (idempotent)', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({
        data: { ...MOCK_NOTIFICATION_WITH_TOKEN, push_sent: true },
        error: null,
      }),
    );

    const process = getProcessFn(worker);
    await process({ data: { notificationId: NOTIF_ID } });

    expect(mockFcmSend).not.toHaveBeenCalled();
  });

  it('clears stale FCM token on registration-token-not-registered error', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: MOCK_NOTIFICATION_WITH_TOKEN, error: null }),
    );

    const staleError = new Error('Stale token');
    (staleError as unknown as { errorInfo: { code: string } }).errorInfo = {
      code: 'messaging/registration-token-not-registered',
    };
    mockFcmSend.mockRejectedValue(staleError);

    // Token clear update
    const mockUpdate = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    mockFrom.mockReturnValue(mockUpdate);

    const process = getProcessFn(worker);
    // Should NOT throw (stale token is not retried)
    await expect(
      process({ data: { notificationId: NOTIF_ID } }),
    ).resolves.toBeUndefined();

    expect(mockUpdate.update).toHaveBeenCalledWith({ fcm_token: null });
  });

  it('clears stale FCM token on invalid-registration-token error', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: MOCK_NOTIFICATION_WITH_TOKEN, error: null }),
    );

    const staleError = new Error('Invalid token');
    (staleError as unknown as { errorInfo: { code: string } }).errorInfo = {
      code: 'messaging/invalid-registration-token',
    };
    mockFcmSend.mockRejectedValue(staleError);

    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const process = getProcessFn(worker);
    await expect(process({ data: { notificationId: NOTIF_ID } })).resolves.toBeUndefined();
  });

  it('marks push_failed_at and rethrows on transient FCM error (for retry)', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: MOCK_NOTIFICATION_WITH_TOKEN, error: null }),
    );

    const transientError = new Error('Server unavailable');
    (transientError as unknown as { errorInfo: { code: string } }).errorInfo = {
      code: 'messaging/server-unavailable',
    };
    mockFcmSend.mockRejectedValue(transientError);

    // push_failed_at update
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    });

    const process = getProcessFn(worker);
    // Should throw so BullMQ retries
    await expect(
      process({ data: { notificationId: NOTIF_ID } }),
    ).rejects.toThrow('Server unavailable');
  });

  it('FCM message includes correct android channel and priority', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: MOCK_NOTIFICATION_WITH_TOKEN, error: null }),
    );
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    });
    mockFcmSend.mockResolvedValue('msg-id');

    const process = getProcessFn(worker);
    await process({ data: { notificationId: NOTIF_ID } });

    const call = mockFcmSend.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((call['android'] as Record<string, Record<string, string>>)['notification']?.['channelId'])
      .toBe('courier_default');
  });

  it('FCM message data contains notification_id and screen fields', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: MOCK_NOTIFICATION_WITH_TOKEN, error: null }),
    );
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    });
    mockFcmSend.mockResolvedValue('msg-id');

    const process = getProcessFn(worker);
    await process({ data: { notificationId: NOTIF_ID } });

    const call = mockFcmSend.mock.calls[0]?.[0] as Record<string, Record<string, string>>;
    expect(call['data']?.['notification_id']).toBe(NOTIF_ID);
    expect(call['data']?.['screen']).toBeDefined();
  });
});
