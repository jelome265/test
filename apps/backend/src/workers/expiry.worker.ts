/**
 * expiry.worker.ts — BullMQ worker for periodic payment expiry reconciliation.
 *
 * Processes jobs from the 'payment-expiry' queue.
 * The queue is configured to fire one job every 5 minutes (scheduleExpiryJob()).
 *
 * Each job:
 *   1. Calls expire_stale_payments() PostgreSQL RPC
 *   2. Logs the count of expired payments
 *   3. Logs a warning if count > threshold (potential operational anomaly)
 *
 * The expire_stale_payments() RPC (migration 014):
 *   - Marks payments past their 30-minute window as 'expired'
 *   - Reverts associated shipments from 'payment_pending' → 'approved'
 *   - Returns the count of payments expired
 *   - Is fully idempotent: safe to call multiple times
 *
 * Concurrency: 1 — only one expiry check at a time. The RPC handles
 * its own locking (row-level FOR UPDATE NOWAIT), but running two
 * concurrent expiry checks adds no value.
 *
 * Error handling: the job has attempts=1 — if the RPC fails (DB outage,
 * etc.), BullMQ logs the failure and the next scheduled run (5 minutes
 * later) will pick up any remaining stale payments. Expiry is eventually
 * consistent: at worst, a payment expires 10 minutes late.
 */

import type { Job, Worker as BullWorker } from 'bullmq';
import { Worker } from 'bullmq';

import { getRedis } from '../config/redis.js';
import { supabaseServiceRole } from '../config/supabase.js';
import {
  EXPIRY_QUEUE_NAME,
  type ExpiryJobData,
} from '../queues/expiry.queue.js';
import { logger } from '../utils/logger.js';

// ─── Anomaly detection threshold ──────────────────────────────────────────────
// Warn in logs if more than this many payments expire in a single run.
// A high number may indicate a systemic payment processing problem.
const HIGH_EXPIRY_THRESHOLD = 20;

// ─── Worker class ─────────────────────────────────────────────────────────────

export class ExpiryWorker {
  private readonly worker: BullWorker<ExpiryJobData>;

  constructor() {
    this.worker = new Worker<ExpiryJobData>(
      EXPIRY_QUEUE_NAME,
      this.process.bind(this),
      {
        connection:  getRedis(),
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job: Job<ExpiryJobData>) => {
      logger.debug(
        { jobId: job.id, scheduledAt: job.data.scheduledAt },
        'Expiry worker job completed',
      );
    });

    this.worker.on('failed', (job: Job<ExpiryJobData> | undefined, err: Error) => {
      logger.error(
        { jobId: job?.id, err },
        'Expiry worker job failed — next run in 5 minutes',
      );
    });

    this.worker.on('error', (err: Error) => {
      logger.error({ err }, 'Expiry worker Redis connection error');
    });

    logger.info('Payment expiry worker started');
  }

  // ─── Job processor ─────────────────────────────────────────────────────────

  private async process(job: Job<ExpiryJobData>): Promise<void> {
    const startedAt = Date.now();

    logger.debug(
      { jobId: job.id, scheduledAt: job.data.scheduledAt },
      'Running payment expiry check',
    );

    const { data: expiredCount, error } = await supabaseServiceRole()
      .rpc('expire_stale_payments');

    if (error) {
      logger.error(
        { error: error.message, jobId: job.id },
        'expire_stale_payments RPC failed',
      );
      throw new Error(`expire_stale_payments failed: ${error.message}`);
    }

    const count = (expiredCount as unknown as number) ?? 0;
    const durationMs = Date.now() - startedAt;

    if (count > 0) {
      // Log at info when payments actually expired
      if (count >= HIGH_EXPIRY_THRESHOLD) {
        logger.warn(
          { expiredCount: count, durationMs, jobId: job.id },
          `High payment expiry count (${count} payments) — check for processing issues`,
        );
      } else {
        logger.info(
          { expiredCount: count, durationMs, jobId: job.id },
          'Payment expiry run complete',
        );
      }
    } else {
      // No-op run: debug level only
      logger.debug(
        { expiredCount: 0, durationMs, jobId: job.id },
        'Payment expiry run: no stale payments found',
      );
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.worker.close();
    logger.info('Expiry worker closed');
  }

  get isRunning(): boolean {
    return !this.worker.closing;
  }
}
