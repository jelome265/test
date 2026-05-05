/**
 * notification.queue.ts — BullMQ queue for asynchronous push notification dispatch.
 *
 * Queue name: 'notifications'
 *
 * Producers: NotificationService.createAndEnqueue() — called after every
 *            DB INSERT into app_notifications.
 *
 * Consumers: NotificationWorker (notification.worker.ts) — reads jobs,
 *            loads the notification row, fetches the FCM token, dispatches
 *            the push, and updates push_sent / push_failed_at.
 *
 * Job options:
 *   - attempts:  3 retries on transient FCM failures (timeout, 500, rate-limit)
 *   - backoff:   exponential — 1s, 2s, 4s between retries
 *   - removeOnComplete: keep last 100 completed jobs for monitoring dashboards
 *   - removeOnFail:     keep last 50 failed jobs for investigation
 *
 * Idempotency: job ID is set to `notif_${notificationId}` — BullMQ rejects
 * duplicate job IDs, preventing double-dispatch if createAndEnqueue() is
 * called twice for the same notification (e.g. on server restart during
 * processing).
 *
 * IMPORTANT: The queue is a singleton. Import getNotificationQueue() rather
 * than constructing new Queue() instances, to avoid Redis connection leak.
 */

import { Queue } from 'bullmq';

import { getRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

// ─── Job payload ──────────────────────────────────────────────────────────────

export interface NotificationJobData {
  /** UUID of the app_notifications row to dispatch via FCM */
  notificationId: string;
}

// ─── Queue constants ──────────────────────────────────────────────────────────

export const NOTIFICATION_QUEUE_NAME = 'notifications';
export const NOTIFICATION_JOB_NAME   = 'send_push';

// ─── Singleton ────────────────────────────────────────────────────────────────

let _notificationQueue: Queue<NotificationJobData> | null = null;

export function getNotificationQueue(): Queue<NotificationJobData> {
  if (_notificationQueue) return _notificationQueue;

  _notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type:  'exponential',
        delay: 1_000,  // 1s, 2s, 4s
      },
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 50  },
    },
  });

  _notificationQueue.on('error', (err: Error) => {
    logger.error({ err }, 'Notification queue connection error');
  });

  return _notificationQueue;
}

/**
 * Add a notification push job.
 * Uses a deterministic jobId to prevent duplicate dispatch.
 *
 * @param notificationId - UUID from app_notifications.id
 */
export async function enqueueNotificationPush(notificationId: string): Promise<void> {
  const queue = getNotificationQueue();

  await queue.add(
    NOTIFICATION_JOB_NAME,
    { notificationId },
    {
      // Deterministic job ID prevents duplicate dispatch on retry
      jobId: `notif_${notificationId}`,
    },
  );

  logger.debug({ notificationId }, 'Notification push job enqueued');
}
