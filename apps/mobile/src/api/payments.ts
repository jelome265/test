// src/api/payments.ts
import type { Payment } from '@courier/shared-types';

import { apiClient } from './client';

export type PaymentMethod = 'airtel_money' | 'tnm_mpamba' | 'bank_transfer' | 'card';

export interface InitiatePaymentInput {
  shipment_id:     string;
  method:          PaymentMethod;
  phone_number?:   string;
  idempotency_key: string;
}

export interface InitiatePaymentResult {
  payment_id:         string;
  provider_reference: string;
  status:             string;
  expires_at:         string;
  payment_url?:       string;
}

export const paymentsApi = {
  initiatePayment: async (input: InitiatePaymentInput): Promise<InitiatePaymentResult> => {
    const res = await apiClient.post<{ data: InitiatePaymentResult }>('/v1/payments/initiate', input);
    return res.data.data;
  },

  getPayment: async (id: string): Promise<Payment> => {
    const res = await apiClient.get<{ data: Payment }>(`/v1/payments/${id}`);
    return res.data.data;
  },

  getShipmentPayments: async (shipmentId: string): Promise<Payment[]> => {
    const res = await apiClient.get<{ data: Payment[] }>(`/v1/payments/shipment/${shipmentId}`);
    return res.data.data;
  },
} as const;
