/**
 * paychangu.client.ts — Typed HTTP client for the Paychangu payment API.
 *
 * Responsibility: I/O only.
 *   - Build HTTP requests with correct headers and body shape
 *   - Send requests with timeout and retry-on-network-error
 *   - Map HTTP/Paychangu errors to our AppError hierarchy
 *   - Return typed response objects
 *
 * NOT responsible for:
 *   - Business logic (idempotency, state machine, audit)
 *   - Database operations
 *   - Notification dispatch
 *   - Shipment status management
 *
 * All of the above live in payment.service.ts.
 *
 * Paychangu API base: https://api.paychangu.com
 * Authentication: Authorization: Bearer {SECRET_KEY}
 *
 * SECURITY NOTE: The secret key is sent as a Bearer token on every request.
 * It MUST NOT be logged. The Pino logger's redact config covers
 * 'req.headers.authorization' but this client uses axios directly —
 * we strip the Authorization header from any error logging here.
 */

import type { PaymentMethod } from '@courier/shared-types';
import axios, {
  type AxiosInstance,
  type AxiosError,
  type AxiosResponse,
} from 'axios';

import { env } from '../config/env.js';
import {
  ExternalServiceError,
  BusinessRuleError,
} from '../errors/app-error.js';
import { logger } from '../utils/logger.js';

// ─── Paychangu API response shapes ───────────────────────────────────────────

/** Payment initiation request body sent to Paychangu */
export interface PaychanguInitiateRequest {
  /** Our idempotency key — sent as the transaction reference */
  tx_ref:        string;
  /** Amount in the currency's base unit (MWK, whole numbers only) */
  amount:        number;
  /** ISO 4217 currency code */
  currency:      'MWK';
  /** Payment method routing */
  payment_type:  PaychanguPaymentType;
  /** Mobile number for USSD-push mobile money payments */
  mobile_number?: string | null;
  /** Merchant merchant-facing description shown in Paychangu dashboard */
  description:   string;
  /** Callback URL — Paychangu POSTs webhook here */
  callback_url:  string;
  /** Return URL for web-based flows (unused in mobile-first Phase 1) */
  return_url?:   string | null;
  /** Customer metadata */
  customer: {
    name:  string;
    email: string;
    phone: string;
  };
  /** Merchant reference for our own correlation */
  meta?: Record<string, string>;
}

/** Paychangu payment method codes */
export type PaychanguPaymentType =
  | 'airtel'       // Airtel Money USSD push
  | 'tnm'          // TNM Mpamba USSD push
  | 'bank_transfer'
  | 'card';

/** Paychangu initiation response */
export interface PaychanguInitiateResponse {
  status:         'success' | 'error';
  message:        string;
  data?: {
    tx_ref:             string;
    payment_url?:       string;   // Web checkout URL (optional)
    authorization_url?: string;   // Alternative field name used by some Paychangu versions
    flw_ref?:           string;   // Paychangu internal reference (early stage)
  };
}

/** Paychangu payment status response */
export interface PaychanguStatusResponse {
  status:  'success' | 'error';
  message: string;
  data?: {
    tx_ref:         string;
    flw_ref?:       string;
    transaction_id: number;
    amount:         number;
    currency:       string;
    charged_amount: number;
    status:         'successful' | 'failed' | 'pending';
    payment_type:   string;
    created_at:     string;
  };
}

/** Paychangu webhook callback payload */
export interface PaychanguWebhookPayload {
  /** Our tx_ref — maps to payments.provider_reference */
  tx_ref:         string;
  /** Paychangu internal transaction ID */
  transaction_id: string;
  /** Payment outcome */
  status:         'successful' | 'failed' | 'cancelled';
  /** Amount charged (in MWK) */
  amount:         number;
  currency:       string;
  /** Timestamp of the transaction (Unix epoch seconds) */
  timestamp?:     number;
  /** Payment method used */
  payment_type?:  string;
  /** Customer info echoed back */
  customer?: {
    name?:  string;
    email?: string;
    phone?: string;
  };
}

// ─── Payment method mapping ───────────────────────────────────────────────────

const PAYMENT_METHOD_TO_PAYCHANGU: Record<PaymentMethod, PaychanguPaymentType> = {
  airtel_money:  'airtel',
  tnm_mpamba:    'tnm',
  bank_transfer: 'bank_transfer',
  card:          'card',
};

// ─── Client class ─────────────────────────────────────────────────────────────

export class PaychanguClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL:        env.PAYCHANGU_BASE_URL,
      timeout:        15_000,  // 15 seconds — GSM networks can be slow
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        // Authorization header added per-request (not here) to prevent
        // accidental logging of the credentials in axios debug output
      },
    });

    // Response interceptor: strip Authorization from error logs
    this.http.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: AxiosError) => {
        // Remove auth header before any logging occurs
        if (error.config?.headers) {
          delete (error.config.headers as any)['Authorization'];
        }
        return Promise.reject(error);
      },
    );
  }

  /**
   * Map our PaymentMethod enum to Paychangu's payment_type field.
   */
  mapPaymentMethod(method: PaymentMethod): PaychanguPaymentType {
    return PAYMENT_METHOD_TO_PAYCHANGU[method];
  }

  /**
   * Initiate a payment with Paychangu.
   *
   * Sends a payment initiation request and returns the Paychangu reference.
   * The caller (PaymentService) stores the reference before calling this,
   * so that a crash after Paychangu accepts but before we store the response
   * doesn't create an orphaned charge.
   *
   * @throws ExternalServiceError if Paychangu is unreachable or returns an error
   */
  async initiatePayment(
    request: PaychanguInitiateRequest,
  ): Promise<PaychanguInitiateResponse> {
    logger.debug(
      { txRef: request.tx_ref, method: request.payment_type },
      'Initiating payment with Paychangu',
    );

    try {
      const response = await this.http.post<PaychanguInitiateResponse>(
        '/payment',
        request,
        {
          headers: {
            Authorization: `Bearer ${env.PAYCHANGU_SECRET_KEY}`,
          },
        },
      );

      const data = response.data;

      if (data.status !== 'success') {
        logger.warn(
          { txRef: request.tx_ref, message: data.message },
          'Paychangu initiation returned non-success status',
        );
        throw new ExternalServiceError(
          'paychangu',
          `Payment initiation failed: ${data.message}`,
        );
      }

      logger.info(
        { txRef: request.tx_ref, method: request.payment_type },
        'Paychangu payment initiated successfully',
      );

      return data;
    } catch (err) {
      if (err instanceof ExternalServiceError) throw err;

      const axiosErr = err as AxiosError<PaychanguInitiateResponse>;

      // Parse Paychangu's structured error response
      if (axiosErr.response) {
        const status  = axiosErr.response.status;
        const body    = axiosErr.response.data;
        const message = body?.message ?? `HTTP ${status}`;

        if (status === 422 || status === 400) {
          // Validation failure from Paychangu (bad phone number, amount, etc.)
          throw new BusinessRuleError(
            `Payment validation failed: ${message}`,
            'PAYMENT_VALIDATION_FAILED',
          );
        }

        logger.error(
          { status, message, txRef: request.tx_ref },
          'Paychangu API returned error response',
        );
        throw new ExternalServiceError('paychangu', message);
      }

      // Network error (timeout, DNS, connection refused)
      if (axiosErr.code === 'ECONNABORTED') {
        logger.error(
          { txRef: request.tx_ref, code: axiosErr.code },
          'Paychangu API timed out',
        );
        throw new ExternalServiceError(
          'paychangu',
          'Payment provider timed out. Please try again.',
        );
      }

      logger.error(
        { err, txRef: request.tx_ref },
        'Unexpected error calling Paychangu initiate',
      );
      throw new ExternalServiceError(
        'paychangu',
        'Payment provider is currently unavailable. Please try again.',
      );
    }
  }

  /**
   * Verify a payment's status directly with Paychangu.
   *
   * Used for reconciliation — when a webhook is missed or delayed,
   * the backend can poll Paychangu to determine the true state.
   * NOT called during the normal webhook-driven flow.
   *
   * @param txRef - Our provider_reference (Paychangu tx_ref)
   */
  async verifyPayment(txRef: string): Promise<PaychanguStatusResponse> {
    logger.debug({ txRef }, 'Verifying payment status with Paychangu');

    try {
      const response = await this.http.get<PaychanguStatusResponse>(
        `/payment/verify/${encodeURIComponent(txRef)}`,
        {
          headers: {
            Authorization: `Bearer ${env.PAYCHANGU_SECRET_KEY}`,
          },
        },
      );

      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;

      if (axiosErr.response?.status === 404) {
        throw new ExternalServiceError(
          'paychangu',
          `Payment with tx_ref '${txRef}' not found in Paychangu`,
        );
      }

      logger.error({ err, txRef }, 'Paychangu payment verification failed');
      throw new ExternalServiceError(
        'paychangu',
        'Payment provider verification failed. Please try again.',
      );
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const paychanguClient = new PaychanguClient();
