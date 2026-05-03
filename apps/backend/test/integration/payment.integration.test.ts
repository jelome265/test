/**
 * payment.integration.test.ts — Payment HTTP layer integration tests.
 *
 * Tests routing, validation, auth, idempotency, webhook HMAC, and response shape.
 * All services are mocked — we test the HTTP + middleware stack.
 *
 * Run: npm run test -- --filter payment.integration
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import crypto from 'crypto';

// ─── Hoist mocks ─────────────────────────────────────────────────────────────
const {
  mockInitiatePayment,
  mockGetPayment,
  mockGetShipmentPayments,
  mockProcessWebhook,
} = vi.hoisted(() => ({
  mockInitiatePayment:      vi.fn(),
  mockGetPayment:           vi.fn(),
  mockGetShipmentPayments:  vi.fn(),
  mockProcessWebhook:       vi.fn(),
}));

vi.mock('../../src/config/supabase.js', () => ({
  supabaseServiceRole: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123', role: 'customer' } }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'user-123', email: 'test@example.com', role: 'customer',
          full_name: 'Test', phone_number: '+265991234567', is_active: true, fcm_token: null,
        },
        error: null,
      }),
    }),
  }),
  supabaseAnon: () => ({}),
  checkSupabaseHealth: vi.fn().mockResolvedValue({ ok: true, latencyMs: 5 }),
}));

vi.mock('../../src/config/redis.js', () => ({
  getRedis:         vi.fn().mockReturnValue({ ping: vi.fn().mockResolvedValue('PONG') }),
  checkRedisHealth: vi.fn().mockResolvedValue({ ok: true, latencyMs: 2 }),
  closeRedis:       vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config/firebase.js', () => ({
  getFirebaseApp:      vi.fn().mockReturnValue({ name: 'test' }),
  checkFirebaseHealth: vi.fn().mockResolvedValue({ ok: true }),
  getFirebaseMessaging: vi.fn(),
}));

vi.mock('../../src/services/payment.service.js', () => ({
  paymentService: {
    initiatePayment:      mockInitiatePayment,
    getPayment:           mockGetPayment,
    getShipmentPayments:  mockGetShipmentPayments,
    processWebhook:       mockProcessWebhook,
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV:                 'test',
    PAYCHANGU_WEBHOOK_SECRET: 'test-webhook-signing-secret-minimum-32-characters',
    PAYCHANGU_BASE_URL:       'https://api.paychangu.com',
    BACKEND_BASE_URL:         'https://api.yourcourier.com',
    CORS_ALLOWED_ORIGINS:     ['http://localhost:8081'],
  },
  isTest: true,
  isDev:  false,
  isProd: false,
}));

import { createApp } from '../../src/app.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_IDEM_KEY = '12345678-1234-4321-a234-123456789abc';
const VALID_SHIPMENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const VALID_INITIATE_BODY = {
  shipment_id:     VALID_SHIPMENT_ID,
  method:          'airtel_money',
  phone_number:    '+265991234567',
  idempotency_key: VALID_IDEM_KEY,
};

const MOCK_INITIATE_RESULT = {
  payment_id:         'f1e2d3c4-b5a6-9870-dcba-fe9876543210',
  provider_reference: 'PAY-ABCD1234-E5F6A7B8',
  status:             'processing',
  expires_at:         new Date(Date.now() + 30 * 60 * 1000).toISOString(),
};

const MOCK_PAYMENT = {
  id:                 'f1e2d3c4-b5a6-9870-dcba-fe9876543210',
  shipment_id:        VALID_SHIPMENT_ID,
  user_id:            'user-123',
  amount_mwk:         200000,
  method:             'airtel_money',
  status:             'processing',
  provider_reference: 'PAY-ABCD1234-E5F6A7B8',
  created_at:         '2024-01-01T00:00:00Z',
};

// Helper: compute valid HMAC for test
function computeHmac(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const TEST_WEBHOOK_SECRET = 'test-webhook-signing-secret-minimum-32-characters';

// ─── POST /api/v1/payments/initiate ──────────────────────────────────────────

describe('POST /api/v1/payments/initiate', () => {
  let app: Express;

  beforeAll(() => { app = createApp(); });

  it('returns 201 with payment data on success', async () => {
    mockInitiatePayment.mockResolvedValue(MOCK_INITIATE_RESULT);

    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', 'Bearer valid-token')
      .send(VALID_INITIATE_BODY);

    expect(res.status).toBe(201);
    expect(res.body.data.payment_id).toBe(MOCK_INITIATE_RESULT.payment_id);
    expect(res.body.data.provider_reference).toBeDefined();
    expect(res.body.data.expires_at).toBeDefined();
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .send(VALID_INITIATE_BODY);

    expect(res.status).toBe(401);
  });

  it('returns 400 for missing shipment_id', async () => {
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', 'Bearer valid-token')
      .send({ method: 'airtel_money', idempotency_key: VALID_IDEM_KEY });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid idempotency key (not UUID v4)', async () => {
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', 'Bearer valid-token')
      .send({ ...VALID_INITIATE_BODY, idempotency_key: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(
      (res.body.details as Array<{ field: string }>).some((d) => d.field === 'idempotency_key'),
    ).toBe(true);
  });

  it('returns 400 for invalid payment method', async () => {
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', 'Bearer valid-token')
      .send({ ...VALID_INITIATE_BODY, method: 'bitcoin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when service throws BusinessRuleError', async () => {
    const { BusinessRuleError } = await import('../../src/errors/app-error.js');
    mockInitiatePayment.mockRejectedValue(
      new BusinessRuleError(
        "Shipment must be in 'approved' state",
        'INVALID_STATE_FOR_PAYMENT',
      ),
    );

    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', 'Bearer valid-token')
      .send(VALID_INITIATE_BODY);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('INVALID_STATE_FOR_PAYMENT');
  });

  it('response never includes sensitive fields (phone, keys)', async () => {
    mockInitiatePayment.mockResolvedValue(MOCK_INITIATE_RESULT);

    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', 'Bearer valid-token')
      .send(VALID_INITIATE_BODY);

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('idempotency_key');
    expect(bodyStr).not.toContain('265991234567');
  });
});

// ─── GET /api/v1/payments/:id ─────────────────────────────────────────────────

describe('GET /api/v1/payments/:id', () => {
  let app: Express;

  beforeAll(() => { app = createApp(); });

  it('returns 200 with payment data', async () => {
    mockGetPayment.mockResolvedValue(MOCK_PAYMENT);

    const res = await request(app)
      .get(`/api/v1/payments/${MOCK_PAYMENT.id}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(MOCK_PAYMENT.id);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get(`/api/v1/payments/${MOCK_PAYMENT.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when payment not found', async () => {
    const { NotFoundError } = await import('../../src/errors/app-error.js');
    mockGetPayment.mockRejectedValue(new NotFoundError('Payment'));

    const res = await request(app)
      .get('/api/v1/payments/nonexistent-id')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

// ─── GET /api/v1/payments/shipment/:shipmentId ────────────────────────────────

describe('GET /api/v1/payments/shipment/:shipmentId', () => {
  let app: Express;

  beforeAll(() => { app = createApp(); });

  it('returns 200 with payments array', async () => {
    mockGetShipmentPayments.mockResolvedValue([MOCK_PAYMENT]);

    const res = await request(app)
      .get(`/api/v1/payments/shipment/${VALID_SHIPMENT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/api/v1/payments/shipment/${VALID_SHIPMENT_ID}`);
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/v1/webhooks/paychangu ─────────────────────────────────────────

describe('POST /api/v1/webhooks/paychangu', () => {
  let app: Express;

  beforeAll(() => { app = createApp(); });

  const WEBHOOK_PAYLOAD = {
    tx_ref:         'PAY-ABCD1234-E5F6A7B8',
    transaction_id: '12345',
    status:         'successful',
    amount:         2000,
    currency:       'MWK',
    timestamp:      Math.floor(Date.now() / 1000),
  };

  function makeWebhookRequest(payload: unknown, secret = TEST_WEBHOOK_SECRET) {
    const body      = JSON.stringify(payload);
    const signature = computeHmac(body, secret);
    return request(app)
      .post('/api/v1/webhooks/paychangu')
      .set('Content-Type', 'application/json')
      .set('X-Paychangu-Signature', signature)
      .send(body);
  }

  it('returns 200 on valid signature and successful processing', async () => {
    mockProcessWebhook.mockResolvedValue({
      action:     'advanced',
      payment_id: 'f1e2d3c4-b5a6-9870-dcba-fe9876543210',
      status:     'paid',
    });

    const res = await makeWebhookRequest(WEBHOOK_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('returns 400 for missing X-Paychangu-Signature header', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/paychangu')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(WEBHOOK_PAYLOAD));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
  });

  it('returns 400 for tampered body (signature mismatch)', async () => {
    const body      = JSON.stringify(WEBHOOK_PAYLOAD);
    const signature = computeHmac(body, TEST_WEBHOOK_SECRET);

    // Tamper the body AFTER computing signature
    const tamperedBody = JSON.stringify({ ...WEBHOOK_PAYLOAD, amount: 1 });

    const res = await request(app)
      .post('/api/v1/webhooks/paychangu')
      .set('Content-Type', 'application/json')
      .set('X-Paychangu-Signature', signature)
      .send(tamperedBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
  });

  it('returns 200 even when processing throws (prevents retry storm)', async () => {
    mockProcessWebhook.mockRejectedValue(new Error('DB connection failed'));

    const res = await makeWebhookRequest(WEBHOOK_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.processing_error).toBe(true);
  });
});
