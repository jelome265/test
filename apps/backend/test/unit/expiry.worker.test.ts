/**
 * expiry.worker.test.ts — Payment expiry worker unit tests.
 *
 * Run: npm run test -- --filter expiry.worker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoist mocks ─────────────────────────────────────────────────────────────
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('../../src/config/supabase.js', () => ({
  supabaseServiceRole: () => ({ rpc: mockRpc }),
}));

vi.mock('../../src/config/redis.js', () => ({
  getRedis: () => ({ on: vi.fn(), status: 'ready' }),
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function () {
    return {
      on:      vi.fn(),
      close:   vi.fn().mockResolvedValue(undefined),
      closing: false,
    };
  }),
}));

import { ExpiryWorker } from '../../src/workers/expiry.worker.js';

function getProcessFn(worker: ExpiryWorker): (job: { id: string; data: { scheduledAt: string } }) => Promise<void> {
  return (worker as unknown as { process: (j: { id: string; data: { scheduledAt: string } }) => Promise<void> }).process;
}

describe('ExpiryWorker', () => {
  let worker: ExpiryWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new ExpiryWorker();
  });

  it('calls expire_stale_payments RPC', async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });

    const process = getProcessFn(worker);
    await process({ id: 'job-1', data: { scheduledAt: new Date().toISOString() } });

    expect(mockRpc).toHaveBeenCalledWith('expire_stale_payments');
  });

  it('does not throw when 0 payments expired', async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });

    const process = getProcessFn(worker);
    await expect(
      process({ id: 'job-1', data: { scheduledAt: new Date().toISOString() } }),
    ).resolves.toBeUndefined();
  });

  it('does not throw when payments were expired', async () => {
    mockRpc.mockResolvedValue({ data: 5, error: null });

    const process = getProcessFn(worker);
    await expect(
      process({ id: 'job-1', data: { scheduledAt: new Date().toISOString() } }),
    ).resolves.toBeUndefined();
  });

  it('throws when RPC returns an error (so BullMQ logs it)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB connection failed' } });

    const process = getProcessFn(worker);
    await expect(
      process({ id: 'job-1', data: { scheduledAt: new Date().toISOString() } }),
    ).rejects.toThrow('expire_stale_payments failed');
  });

  it('handles null expiredCount gracefully (treats as 0)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const process = getProcessFn(worker);
    await expect(
      process({ id: 'job-1', data: { scheduledAt: new Date().toISOString() } }),
    ).resolves.toBeUndefined();
  });

  it('closes worker cleanly', async () => {
    await expect(worker.close()).resolves.toBeUndefined();
  });

  it('reports isRunning based on worker.closing', () => {
    expect(worker.isRunning).toBe(true);
  });
});
