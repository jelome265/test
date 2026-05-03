/**
 * payment.service.test.ts — Payment service unit tests.
 *
 * All external dependencies (Supabase, Paychangu, audit service) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoist mocks ─────────────────────────────────────────────────────────────
const {
  mockInitiatePayment,
  mockVerifyPayment,
  mockAuditLogPayment,
} = vi.hoisted(() => ({
  mockInitiatePayment: vi.fn(),
  mockVerifyPayment:   vi.fn(),
  mockAuditLogPayment: vi.fn().mockResolvedValue(undefined),
}));

// Shared DB mock state
const mockDb = {
  from:   vi.fn().mockReturnThis(),
  rpc:    vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq:     vi.fn().mockReturnThis(),
  order:  vi.fn().mockReturnThis(),
  single: vi.fn(),
};

vi.mock('../../src/config/supabase.js', () => ({
  supabaseServiceRole: () => mockDb,
}));

vi.mock('../../src/clients/paychangu.client.js', () => ({
  paychanguClient: {
    initiatePayment: mockInitiatePayment,
    verifyPayment:   mockVerifyPayment,
    mapPaymentMethod: vi.fn().mockReturnValue('airtel'),
  },
}));

vi.mock('../../src/services/audit.service.js', () => ({
  auditService: {
    logPaymentInitiated: mockAuditLogPayment,
    log:                 vi.fn().mockResolvedValue(undefined),
    logStatusChange:     vi.fn().mockResolvedValue(undefined),
  },
}));

import { paymentService } from '../../src/services/payment.service.js';
import {
  NotFoundError,
  BusinessRuleError,
  ValidationError,
} from '../../src/errors/app-error.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTOR_ID   = '550e8400-e29b-41d4-a716-446655440000';
const SHIPMENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PAYMENT_ID  = 'f1e2d3c4-b5a6-9870-dcba-fe9876543210';
const IDEM_KEY    = '12345678-1234-4321-a234-123456789abc';
const PROVIDER_REF = 'PAY-ABCD1234-E5F6A7B8';

const MOCK_SHIPMENT_APPROVED = {
  id:              SHIPMENT_ID,
  user_id:         ACTOR_ID,
  status:          'approved',
  quoted_price_mwk: 200000,
  final_price_mwk:  null,
};

const MOCK_PAYMENT_PENDING = {
  id:                 PAYMENT_ID,
  shipment_id:        SHIPMENT_ID,
  user_id:            ACTOR_ID,
  amount_mwk:         200000,
  method:             'airtel_money',
  status:             'pending',
  provider_reference: PROVIDER_REF,
  idempotency_key:    IDEM_KEY,
  phone_number:       '+265991234567',
  expires_at:         new Date(Date.now() + 30 * 60 * 1000).toISOString(),
};

const MOCK_PROFILE = {
  full_name:    'Test User',
  email:        'test@example.com',
  phone_number: '+265991234567',
};

describe('PaymentService.initiatePayment()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.from.mockReturnThis();
    mockDb.select.mockReturnThis();
    mockDb.insert.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.delete.mockReturnThis();
    mockDb.eq.mockReturnThis();
    mockDb.order.mockReturnThis();
  });

  const VALID_INPUT = {
    shipment_id:     SHIPMENT_ID,
    method:          'airtel_money' as const,
    phone_number:    '+265991234567',
    idempotency_key: IDEM_KEY,
  };

  it('throws ValidationError for invalid idempotency key format', async () => {
    await expect(
      paymentService.initiatePayment(
        { ...VALID_INPUT, idempotency_key: 'not-a-uuid' },
        ACTOR_ID,
        '1.2.3.4',
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when shipment does not exist', async () => {
    // Idempotency check: no existing payment
    mockDb.single.mockResolvedValueOnce({ data: null, error: null });
    // Shipment check: not found
    mockDb.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    await expect(
      paymentService.initiatePayment(VALID_INPUT, ACTOR_ID, '1.2.3.4'),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws BusinessRuleError when shipment is not approved', async () => {
    mockDb.single.mockResolvedValueOnce({ data: null, error: null });
    mockDb.single.mockResolvedValueOnce({
      data: { ...MOCK_SHIPMENT_APPROVED, status: 'pending_approval' },
      error: null,
    });

    await expect(
      paymentService.initiatePayment(VALID_INPUT, ACTOR_ID, '1.2.3.4'),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('successfully initiates payment', async () => {
    mockDb.single.mockResolvedValueOnce({ data: null, error: null }); // Idem check
    mockDb.single.mockResolvedValueOnce({ data: MOCK_SHIPMENT_APPROVED, error: null }); // Ship check
    mockDb.single.mockResolvedValueOnce({ data: MOCK_PAYMENT_PENDING, error: null }); // Insert payment
    mockDb.single.mockResolvedValueOnce({ data: MOCK_PROFILE, error: null }); // Profile check (in retryPaychanguCall)
    
    mockInitiatePayment.mockResolvedValue({ status: 'success', data: { tx_ref: PROVIDER_REF } });
    mockDb.update.mockReturnThis();
    mockDb.eq.mockReturnThis();
    // Shipment status update mock
    mockDb.from.mockReturnValue(mockDb);

    const result = await paymentService.initiatePayment(VALID_INPUT, ACTOR_ID, '1.2.3.4');

    expect(result.payment_id).toBe(PAYMENT_ID);
    expect(mockInitiatePayment).toHaveBeenCalled();
  });
});

describe('PaymentService.processWebhook()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.from.mockReturnThis();
  });

  it('processes successful webhook', async () => {
    mockDb.single.mockResolvedValueOnce({
      data: { id: PAYMENT_ID, amount_mwk: 200000, shipment_id: SHIPMENT_ID },
      error: null,
    });
    mockDb.rpc.mockResolvedValueOnce({
      data: { id: PAYMENT_ID, status: 'paid' },
      error: null,
    });

    const payload = {
      tx_ref: PROVIDER_REF,
      transaction_id: 't-123',
      status: 'successful' as const,
      amount: 2000,
    };

    const result = await paymentService.processWebhook(payload as any, '1.2.3.4');
    expect(result.action).toBe('advanced');
  });

  it('processes failed webhook', async () => {
    mockDb.single.mockResolvedValueOnce({
      data: { id: PAYMENT_ID, amount_mwk: 200000, shipment_id: SHIPMENT_ID },
      error: null,
    });
    mockDb.rpc.mockResolvedValueOnce({
      data: { id: PAYMENT_ID, status: 'failed' },
      error: null,
    });

    const payload = {
      tx_ref: PROVIDER_REF,
      transaction_id: 't-123',
      status: 'failed' as const,
      amount: 2000,
    };

    const result = await paymentService.processWebhook(payload as any, '1.2.3.4');
    expect(result.action).toBe('reverted');
  });
});

describe('PaymentService.getPayment()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.from.mockReturnThis();
  });

  it('returns payment if authorized', async () => {
    mockDb.single.mockResolvedValueOnce({
      data: { id: PAYMENT_ID, user_id: ACTOR_ID },
      error: null,
    });

    const result = await paymentService.getPayment(PAYMENT_ID, ACTOR_ID, false);
    expect(result.id).toBe(PAYMENT_ID);
  });

  it('throws NotFoundError if not owner', async () => {
    mockDb.single.mockResolvedValueOnce({
      data: { id: PAYMENT_ID, user_id: 'other-user' },
      error: null,
    });

    await expect(
      paymentService.getPayment(PAYMENT_ID, ACTOR_ID, false),
    ).rejects.toThrow(NotFoundError);
  });
});
