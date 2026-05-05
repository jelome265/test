/**
 * index.ts — Server entry point.
 *
 * Responsibilities:
 *   1. Create the Express app
 *   2. Initialize all service connections (eagerly, not lazily)
 *   3. Start the HTTP server
 *   4. Handle graceful shutdown on SIGTERM / SIGINT
 *   5. Catch uncaught exceptions and unhandled promise rejections
 *
 * Graceful shutdown sequence (SIGTERM received):
 *   a. Stop accepting new connections
 *   b. Wait for in-flight requests to complete (timeout: 30s)
 *   c. Close BullMQ workers (wait for in-flight jobs to finish)
 *   d. Close Redis connection
 *   e. Exit with code 0
 *
 * Rationale for 30-second shutdown timeout:
 *   Long-running requests (payment initiation, image upload) may take up to
 *   25 seconds. Giving 30 seconds allows most in-flight work to complete
 *   before the process is killed by the orchestrator.
 *
 * SIGTERM vs SIGKILL:
 *   SIGTERM is the polite shutdown signal (Docker stop, Kubernetes pod eviction).
 *   We handle it. SIGKILL cannot be handled — the OS kills the process immediately.
 *   Kubernetes sends SIGTERM, waits terminationGracePeriodSeconds (default 30s),
 *   then sends SIGKILL. Our 30-second shutdown window must fit within this period.
 */

import http from 'http';

import { createApp }  from './app.js';
import { env }        from './config/env.js';
import { getFirebaseApp }       from './config/firebase.js';
import { getRedis, closeRedis } from './config/redis.js';
import { supabaseServiceRole }  from './config/supabase.js';
import { scheduleExpiryJob }  from './queues/expiry.queue.js';
import { logger }               from './utils/logger.js';
import { ExpiryWorker }       from './workers/expiry.worker.js';
import { NotificationWorker } from './workers/notification.worker.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info({ env: env.NODE_ENV, port: env.PORT }, 'Courier backend starting...');

  // ── Eagerly initialize all service connections at startup.
  // Fail-fast here is better than a request failing 20 minutes into uptime
  // because Redis wasn't reachable.

  // Supabase: verify connectivity with a lightweight query
  logger.info('Verifying Supabase connection...');
  const { error: supabaseErr } = await supabaseServiceRole()
    .from('pricing_config')
    .select('id')
    .limit(1);

  if (supabaseErr && supabaseErr.code !== 'PGRST116') {
    logger.error({ error: supabaseErr.message }, 'Supabase connection failed');
    process.exit(1);
  }
  logger.info('Supabase connection verified');

  // Redis: trigger a connection and verify with PING
  logger.info('Connecting to Redis...');
  const redis = getRedis();
  const pong  = await redis.ping();

  if (pong !== 'PONG') {
    logger.error({ pong }, 'Redis connection verification failed');
    process.exit(1);
  }
  logger.info('Redis connection verified');

  // Firebase: initialize the Admin SDK
  logger.info('Initializing Firebase Admin SDK...');
  getFirebaseApp();
  logger.info('Firebase Admin SDK initialized');

  // ── Initialize background workers ──────────────────────────────────────────
  logger.info('Starting background workers...');

  const notificationWorker = new NotificationWorker();
  const expiryWorker       = new ExpiryWorker();

  // Schedule the payment expiry recurring job (idempotent on restart)
  await scheduleExpiryJob();

  logger.info('Background workers started');

  // ── Create and start the HTTP server
  const app    = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info(
      {
        port:        env.PORT,
        environment: env.NODE_ENV,
        pid:         process.pid,
      },
      `Courier backend listening on port ${env.PORT}`,
    );
  });

  // ─── Graceful shutdown ────────────────────────────────────────────────────

  let isShuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received — starting graceful shutdown');

    // Force-kill if shutdown takes too long
    const forceKill = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    // Allow the timeout to be garbage-collected if shutdown completes in time
    forceKill.unref();

    try {
      // Step 1: Stop accepting new connections
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            logger.info('HTTP server closed — no longer accepting connections');
            resolve();
          }
        });
      });

      // Step 2: Close workers (wait for in-flight jobs — drain)
      await Promise.all([
        notificationWorker.close(),
        expiryWorker.close(),
      ]);
      logger.info('Workers closed');

      // Step 3: Close Redis
      await closeRedis();

      clearTimeout(forceKill);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  }

  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT',  () => { void shutdown('SIGINT'); });
}

// ─── Global error handlers ────────────────────────────────────────────────────
// These are last-resort handlers for errors that escaped all other handlers.
// They should be rare — if they fire frequently, find the root cause.

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err, type: 'uncaughtException' }, 'Uncaught exception — process will exit');
  // Allow Sentry to flush before exiting
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ reason, type: 'unhandledRejection' }, 'Unhandled promise rejection — process will exit');
  process.exit(1);
});

// ─── Start ────────────────────────────────────────────────────────────────────
bootstrap().catch((err: unknown) => {
  // Intentional: if bootstrap() itself fails (before the server starts),
  // we want to crash loudly and immediately.
  process.stderr.write(`[FATAL] Bootstrap failed: ${String(err)}\n`);
  process.exit(1);
});
