/**
 * paychangu.client.test.ts — Paychangu HTTP client unit tests.
 *
 * All HTTP calls are intercepted via axios mock adapter.
 * Tests verify: request construction, response parsing, error mapping.
 *
 * Run: npm run test -- --filter paychangu.client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios to intercept HTTP calls
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    ...actual,
    default: {
      ...actual.default,
      create: vi.fn().mockReturnValue({
        post: vi.fn(),
        get:  vi.fn(),
        interceptors: {
          response: {
            use: vi.fn(),
          },
        },
      }),
    },
  };
});

import { PaychanguClient } from '../../src/clients/paychangu.client.js';
import {
  ExternalServiceError,
  BusinessRuleError,
} from '../../src/errors/app-error.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_INITIATE_REQUEST = {
  tx_ref:       'PAY-ABCD1234-E5F6A7B8',
  amount:       2000,
  currency:     'MWK' as const,
  payment_type: 'airtel' as const,
  mobile_number: '+265991234567',
  description:  'Courier delivery payment',
  callback_url: 'https://api.yourcourier.com/webhooks/paychangu',
  customer: {
    name:  'Test User',
    email: 'test@example.com',
    phone: '+265991234567',
  },
};

const MOCK_INITIATE_SUCCESS = {
  status:  'success' as const,
  message: 'Payment initiated',
  data: {
    tx_ref: 'PAY-ABCD1234-E5F6A7B8',
  },
};

const MOCK_VERIFY_SUCCESS = {
  status:  'success' as const,
  message: 'Payment verified',
  data: {
    tx_ref:         'PAY-ABCD1234-E5F6A7B8',
    transaction_id: 12345,
    amount:         2000,
    currency:       'MWK',
    charged_amount: 2000,
    status:         'successful' as const,
    payment_type:   'airtel',
    created_at:     '2024-01-01T00:00:00Z',
  },
};

describe('PaychanguClient.mapPaymentMethod()', () => {
  let client: PaychanguClient;

  beforeEach(() => {
    client = new PaychanguClient();
  });

  it('maps airtel_money to airtel', () => {
    expect(client.mapPaymentMethod('airtel_money')).toBe('airtel');
  });

  it('maps tnm_mpamba to tnm', () => {
    expect(client.mapPaymentMethod('tnm_mpamba')).toBe('tnm');
  });

  it('maps bank_transfer to bank_transfer', () => {
    expect(client.mapPaymentMethod('bank_transfer')).toBe('bank_transfer');
  });

  it('maps card to card', () => {
    expect(client.mapPaymentMethod('card')).toBe('card');
  });
});

describe('PaychanguClient.initiatePayment()', () => {
  let client: PaychanguClient;
  let mockHttp: any;

  beforeEach(() => {
    mockHttp = {
      post: vi.fn(),
      get:  vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    };
    (axios.create as any).mockReturnValue(mockHttp);
    client = new PaychanguClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls the correct endpoint with Authorization header', async () => {
    mockHttp.post.mockResolvedValue({ data: MOCK_INITIATE_SUCCESS });

    await client.initiatePayment(MOCK_INITIATE_REQUEST as any);

    expect(mockHttp.post).toHaveBeenCalledWith(
      '/payment',
      MOCK_INITIATE_REQUEST,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer '),
        }),
      }),
    );
  });

  it('returns the response data on success', async () => {
    mockHttp.post.mockResolvedValue({ data: MOCK_INITIATE_SUCCESS });

    const result = await client.initiatePayment(MOCK_INITIATE_REQUEST as any);

    expect(result.status).toBe('success');
    expect(result.data?.tx_ref).toBe('PAY-ABCD1234-E5F6A7B8');
  });

  it('throws ExternalServiceError when Paychangu returns status error', async () => {
    mockHttp.post.mockResolvedValue({
      data: {
        status:  'error',
        message: 'Invalid phone number format',
      },
    });

    await expect(
      client.initiatePayment(MOCK_INITIATE_REQUEST as any),
    ).rejects.toThrow(ExternalServiceError);
  });

  it('throws BusinessRuleError on 400 response (validation failure)', async () => {
    const axiosError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: {
        status: 400,
        data:   { status: 'error', message: 'Invalid phone number' },
      },
    });
    mockHttp.post.mockRejectedValue(axiosError);

    await expect(
      client.initiatePayment(MOCK_INITIATE_REQUEST as any),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError on 422 response', async () => {
    const axiosError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: {
        status: 422,
        data:   { status: 'error', message: 'Amount below minimum' },
      },
    });
    mockHttp.post.mockRejectedValue(axiosError);

    await expect(
      client.initiatePayment(MOCK_INITIATE_REQUEST as any),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('throws ExternalServiceError on timeout (ECONNABORTED)', async () => {
    const timeoutError = Object.assign(new Error('Timeout'), {
      isAxiosError: true,
      code:         'ECONNABORTED',
    });
    mockHttp.post.mockRejectedValue(timeoutError);

    const err = await client
      .initiatePayment(MOCK_INITIATE_REQUEST as any)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(ExternalServiceError);
    expect((err as any).message).toContain('timed out');
  });

  it('throws ExternalServiceError on network error (no response)', async () => {
    const networkError = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
    });
    mockHttp.post.mockRejectedValue(networkError);

    await expect(
      client.initiatePayment(MOCK_INITIATE_REQUEST as any),
    ).rejects.toThrow(ExternalServiceError);
  });
});

describe('PaychanguClient.verifyPayment()', () => {
  let client: PaychanguClient;
  let mockHttp: any;

  beforeEach(() => {
    mockHttp = {
      post: vi.fn(),
      get:  vi.fn(),
      interceptors: { response: { use: vi.fn() } },
    };
    (axios.create as any).mockReturnValue(mockHttp);
    client = new PaychanguClient();
  });

  it('calls the correct verify endpoint', async () => {
    mockHttp.get.mockResolvedValue({ data: MOCK_VERIFY_SUCCESS });

    await client.verifyPayment('PAY-ABCD1234-E5F6A7B8');

    expect(mockHttp.get).toHaveBeenCalledWith(
      '/payment/verify/PAY-ABCD1234-E5F6A7B8',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer '),
        }),
      }),
    );
  });

  it('returns status data on success', async () => {
    mockHttp.get.mockResolvedValue({ data: MOCK_VERIFY_SUCCESS });

    const result = await client.verifyPayment('PAY-ABCD1234-E5F6A7B8');

    expect(result.data?.status).toBe('successful');
    expect(result.data?.amount).toBe(2000);
  });

  it('throws ExternalServiceError on 404', async () => {
    const axiosError = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response:     { status: 404, data: {} },
    });
    mockHttp.get.mockRejectedValue(axiosError);

    await expect(
      client.verifyPayment('UNKNOWN-REF'),
    ).rejects.toThrow(ExternalServiceError);
  });

  it('URL-encodes the tx_ref parameter', async () => {
    mockHttp.get.mockResolvedValue({ data: MOCK_VERIFY_SUCCESS });

    // tx_ref with special characters should be encoded
    await client.verifyPayment('PAY-AB+CD-1234').catch(() => {});

    expect(mockHttp.get).toHaveBeenCalledWith(
      '/payment/verify/PAY-AB%2BCD-1234',
      expect.anything(),
    );
  });
});
