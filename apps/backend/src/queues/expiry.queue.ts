/**
 * expiry.queue.ts — BullMQ queue for periodic payment expiry reconciliation.
 *
 * Queue name: 'payment-expiry'
 *
 * Schedule: One repeatable job fires every 5 minutes.
 * Consumer: ExpiryWorker (expiry.worker.ts)
 *
 * The repeatable job calls expire_stale_payments() PostgreSQL RPC which:
 *   - Marks payments past their 30-minute window as 'expired'
 *   - Reverts shipments from 'payment_pending' → 'approved'
 *   - Is fully idempotent and safe to call concurrently
 *
 * Why polling and not per-payment timers:
 *   See ADR-034. Maximum expiry latency is 35 minutes (30min window + 5min poll).
 *   This is acceptable for a courier service. Polling is simpler, more observable,
 *   and avoids BullMQ delayed-job overhead per shipment created.
 *
 * Startup idempotency: BullMQ persists the repeatable schedule in Redis.
 * Calling scheduleExpiryJob() again on server restart is a no-op — BullMQ
 * detects the existing schedule by jobId and does not duplicate it.
 */

import { Queue } from 'bullmq';

import { getRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

// ─── Job payload ──────────────────────────────────────────────────────────────

export interface ExpiryJobData {
  /** ISO timestamp when the job was scheduled — for log correlation only */
  scheduledAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const EXPIRY_QUEUE_NAME     = 'payment-expiry';
export const EXPIRY_JOB_NAME       = 'expire-stale-payments';
export const EXPIRY_REPEAT_JOB_ID  = 'payment-expiry-schedule';
export const EXPIRY_INTERVAL_MS    = 5 * 60 * 1_000;  // 5 minutes

// ─── Singleton ────────────────────────────────────────────────────────────────

let _expiryQueue: Queue<ExpiryJobData> | null = null;

export function getExpiryQueue(): Queue<ExpiryJobData> {
  if (_expiryQueue) return _expiryQueue;

  _expiryQueue = new Queue<ExpiryJobData>(EXPIRY_QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts:         1,
      removeOnComplete: { count: 10 },
      removeOnFail:     { count: 10 },
    },
  });

  _expiryQueue.on('error', (err: Error) => {
    logger.error({ err }, 'Expiry queue connection error');
  });

  return _expiryQueue;
}

/**
 * Schedule the recurring payment expiry job.
 *
 * Call once at application startup — idempotent, safe to call on restart.
 * The existing schedule in Redis will be detected and not duplicated.
 */
export async function scheduleExpiryJob(): Promise<void> {
  const queue = getExpiryQueue();

  await queue.add(
    EXPIRY_JOB_NAME,
    { scheduledAt: new Date().toISOString() },
    {
      repeat: { every: EXPIRY_INTERVAL_MS },
      jobId:  EXPIRY_REPEAT_JOB_ID,
    },
  );

  logger.info(
    { intervalMs: EXPIRY_INTERVAL_MS, jobId: EXPIRY_REPEAT_JOB_ID },
    'Payment expiry recurring job scheduled',
  );
}
