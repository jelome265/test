/**
 * notification.worker.ts — BullMQ worker for Firebase Cloud Messaging push dispatch.
 *
 * Processes jobs from the 'notifications' queue.
 *
 * For each job (notificationId):
 *   1. Load the notification row + user FCM token via JOIN
 *   2. If no FCM token: log and skip (push permissions not granted)
 *   3. Build FCM message: notification payload + data payload + platform options
 *   4. Send via Firebase Admin SDK messaging.send()
 *   5. On success: UPDATE app_notifications SET push_sent=TRUE, push_sent_at=NOW()
 *   6. On stale token: clear user_profiles.fcm_token, do NOT retry
 *   7. On transient failure: UPDATE push_failed_at, throw → BullMQ retries
 *
 * FCM message structure:
 *   - notification: { title, body } — shown by OS in notification shade
 *   - data: { notification_type, screen, shipment_id } — for in-app deep link
 *   - android: { channelId, priority: 'high' }
 *   - apns: { sound: 'default', badge: 1 }
 *
 * Concurrency: 10 — up to 10 FCM calls in flight simultaneously.
 * All FCM calls are pure async I/O; event loop is not blocked.
 *
 * STALE TOKEN ERRORS handled without retry:
 *   messaging/registration-token-not-registered
 *   messaging/invalid-registration-token
 *
 * TRANSIENT ERRORS retried by BullMQ (up to 3 attempts):
 *   messaging/internal-error
 *   messaging/server-unavailable
 *   Network timeouts / ECONNRESET
 */

import type { Job, Worker as BullWorker } from 'bullmq';
import { Worker } from 'bullmq';
import type admin from 'firebase-admin';

import { getFirebaseMessaging } from '../config/firebase.js';
import { getRedis } from '../config/redis.js';
import { supabaseServiceRole } from '../config/supabase.js';
import {
  NOTIFICATION_QUEUE_NAME,
  type NotificationJobData,
} from '../queues/notification.queue.js';
import { logger } from '../utils/logger.js';

// ─── FCM error codes that indicate a permanently invalid token ────────────────

const STALE_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

// ─── DB row shape for the notification + user JOIN ────────────────────────────

interface NotificationWithFcmToken {
  id:          string;
  user_id:     string;
  shipment_id: string | null;
  type:        string;
  title:       string;
  body:        string;
  data:        Record<string, string>;
  push_sent:   boolean;
  user_profiles: {
    fcm_token: string | null;
  };
}

// ─── FCM send helper ──────────────────────────────────────────────────────────

async function sendFcmMessage(
  notification: NotificationWithFcmToken,
  fcmToken:     string,
): Promise<void> {
  const messaging = getFirebaseMessaging();

  const message: admin.messaging.Message = {
    token: fcmToken,
    notification: {
      title: notification.title,
      body:  notification.body,
    },
    data: {
      // All data values must be strings for FCM
      notification_id:   notification.id,
      notification_type: notification.type,
      screen:            (notification.data['screen']) ?? '/(app)',
      shipment_id:       notification.shipment_id ?? '',
    },
    android: {
      notification: {
        channelId: 'courier_default',
        priority:  'high',
        sound:     'default',
      },
      priority: 'high',
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          contentAvailable: true,
        },
      },
      headers: {
        'apns-priority': '10',
      },
    },
  };

  await messaging.send(message);
}

// ─── Worker class ─────────────────────────────────────────────────────────────

export class NotificationWorker {
  private readonly worker: BullWorker<NotificationJobData>;

  constructor() {
    this.worker = new Worker<NotificationJobData>(
      NOTIFICATION_QUEUE_NAME,
      this.process.bind(this),
      {
        connection:  getRedis(),
        concurrency: 10,
        // Graceful drain: wait up to 30s for in-flight jobs before shutdown
        drainDelay:  5,
      },
    );

    this.worker.on('completed', (job: Job<NotificationJobData>) => {
      logger.info(
        { jobId: job.id, notificationId: job.data.notificationId },
        'Notification push dispatched',
      );
    });

    this.worker.on('failed', (job: Job<NotificationJobData> | undefined, err: Error) => {
      logger.error(
        {
          jobId:          job?.id,
          notificationId: job?.data.notificationId,
          attempt:        job?.attemptsMade,
          err,
        },
        'Notification push job failed',
      );
    });

    this.worker.on('error', (err: Error) => {
      logger.error({ err }, 'Notification worker connection error');
    });

    logger.info({ concurrency: 10 }, 'Notification worker started');
  }

  // ─── Job processor ─────────────────────────────────────────────────────────

  private async process(job: Job<NotificationJobData>): Promise<void> {
    const { notificationId } = job.data;

    // ── Load notification with user FCM token ──────────────────────────────
    const { data: raw, error } = await supabaseServiceRole()
      .from('app_notifications')
      .select('*, user_profiles!inner(fcm_token)')
      .eq('id', notificationId)
      .single();

    if (error || !raw) {
      logger.warn(
        { notificationId, error: error?.message },
        'Notification not found — skipping push',
      );
      // Do NOT throw — the notification no longer exists, retry is pointless
      return;
    }

    const notification = raw as unknown as NotificationWithFcmToken;

    // ── Skip if already dispatched (idempotency guard) ──────────────────────
    if (notification.push_sent) {
      logger.debug({ notificationId }, 'Notification already sent — skipping');
      return;
    }

    const fcmToken = notification.user_profiles.fcm_token;

    // ── Skip if no FCM token (push permissions not granted) ─────────────────
    if (!fcmToken) {
      logger.debug(
        { notificationId, userId: notification.user_id },
        'User has no FCM token — skipping push',
      );
      return;
    }

    // ── Dispatch via FCM ────────────────────────────────────────────────────
    try {
      await sendFcmMessage(notification, fcmToken);

      // Mark as successfully sent
      await supabaseServiceRole()
        .from('app_notifications')
        .update({
          push_sent:    true,
          push_sent_at: new Date().toISOString(),
          push_error:   null,
        })
        .eq('id', notificationId);

      logger.debug(
        { notificationId, userId: notification.user_id, type: notification.type },
        'FCM push delivered',
      );

    } catch (err: unknown) {
      const errorCode = (err as { errorInfo?: { code?: string } }).errorInfo?.code;
      const errorMsg  =
        errorCode
        ?? (err instanceof Error ? err.message : 'Unknown FCM error');

      // ── Handle permanently invalid tokens ──────────────────────────────
      if (errorCode !== undefined && STALE_TOKEN_CODES.has(errorCode)) {
        logger.warn(
          { notificationId, userId: notification.user_id, errorCode },
          'Stale FCM token detected — clearing from user profile',
        );

        // Clear the stale token
        await supabaseServiceRole()
          .from('user_profiles')
          .update({ fcm_token: null })
          .eq('id', notification.user_id);

        // Do NOT throw — stale token is permanent, retrying is wasteful
        return;
      }

      // ── Mark as failed (transient error — BullMQ will retry) ────────────
      await supabaseServiceRole()
        .from('app_notifications')
        .update({
          push_failed_at: new Date().toISOString(),
          push_error:     errorMsg.substring(0, 500),
        })
        .eq('id', notificationId);

      logger.error(
        { notificationId, userId: notification.user_id, errorCode, errorMsg },
        'FCM push failed — will retry',
      );

      throw err; // Rethrow → BullMQ retries up to 3 attempts
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Gracefully shut down the worker.
   * Waits for in-flight jobs to complete before closing Redis connection.
   */
  async close(): Promise<void> {
    await this.worker.close();
    logger.info('Notification worker closed');
  }

  get isRunning(): boolean {
    return !this.worker.closing;
  }
}
