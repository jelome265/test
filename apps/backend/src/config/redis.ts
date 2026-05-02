/**
 * redis.ts — IORedis singleton with retry strategy and health check.
 *
 * Used by: BullMQ queues, notification.queue.ts, notification.worker.ts
 * NOT used for application-level caching in Phase 1 (future optimization).
 *
 * Connection lifecycle:
 *   - Lazy connect on first use (IORedis default)
 *   - Exponential backoff retry with 30-second cap
 *   - Max 10 reconnection attempts before emitting an error event
 *   - Graceful shutdown via disconnect() called by index.ts SIGTERM handler
 */

import { Redis } from 'ioredis';

import { logger } from '../utils/logger.js';

import { env, isTest } from './env.js';

// ─── Retry strategy ───────────────────────────────────────────────────────────
function retryStrategy(times: number): number | null {
  if (times > 10) {
    // After 10 attempts, stop retrying and let the process handle the error
    logger.error({ times }, 'Redis: max reconnection attempts reached');
    return null; // null = stop retrying
  }

  const delayMs = Math.min(
    // Exponential backoff: 100ms, 200ms, 400ms, 800ms ... capped at 30s
    100 * Math.pow(2, times - 1),
    30_000,
  );

  logger.warn({ attempt: times, delayMs }, 'Redis: reconnecting...');
  return delayMs;
}

// ─── Singleton factory ────────────────────────────────────────────────────────
let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;

  const options = {
    retryStrategy,
    // Fail commands immediately when disconnected (don't queue indefinitely)
    enableOfflineQueue: false,
    // Connection timeout: 10 seconds
    connectTimeout: 10_000,
    // Keep-alive: prevents idle connection from being dropped by network
    keepAlive: 60_000,
    // Max reconnection delay for lazyConnect mode
    maxRetriesPerRequest: 3,
  };

  if (isTest) {
    // In test mode, point to localhost:6379 regardless of REDIS_URL
    // CI starts a Redis service (see .github/workflows/backend-ci.yml)
    _redis = new Redis({ ...options, host: 'localhost', port: 6379 });
  } else {
    _redis = new Redis(env.REDIS_URL, options);
  }

  _redis.on('connect', () => logger.info('Redis: connected'));
  _redis.on('ready',   () => logger.info('Redis: ready'));
  _redis.on('error',   (err: Error) => logger.error({ err }, 'Redis: connection error'));
  _redis.on('close',   () => logger.warn('Redis: connection closed'));
  _redis.on('reconnecting', (delay: number) =>
    logger.warn({ delayMs: delay }, 'Redis: reconnecting'),
  );

  return _redis;
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Called by index.ts SIGTERM/SIGINT handler.
// disconnect() closes the connection without waiting for in-flight commands.
// quit() waits for in-flight commands — prefer this unless process is dying.
export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
    logger.info('Redis: connection closed gracefully');
  }
}

// ─── Health check ─────────────────────────────────────────────────────────────
export async function checkRedisHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const pong = await getRedis().ping();
    return { ok: pong === 'PONG', latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}
