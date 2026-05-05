// src/api/shipments.ts
import type {
  Shipment,
  ShipmentStatus,
  ShipmentStatusEvent,
} from '@courier/shared-types';
import type { CreateShipmentInput } from '@courier/shared-validation';

import { apiClient } from './client';

export interface QuoteResult {
  pickup_city:           string;
  delivery_city:         string;
  weight_kg:             number;
  package_size:          string;
  is_fragile:            boolean;
  distance_km:           number;
  total_mwk:             number;
  base_price_mwk:        number;
  distance_charge_mwk:   number;
  weight_charge_mwk:     number;
  fragile_surcharge_mwk: number;
  currency:              'MWK';
}

export interface ShipmentListResult {
  data:        Shipment[];
  next_cursor: string | null;
  total_count: number | null;
}

export interface ShipmentHistoryResult {
  shipment: Shipment;
  events:   ShipmentStatusEvent[];
}

export interface QuoteInput {
  pickup_city:   string;
  delivery_city: string;
  weight_kg:     number;
  is_fragile:    boolean;
}

export const shipmentsApi = {
  getQuote: async (input: QuoteInput): Promise<QuoteResult> => {
    const res = await apiClient.get<{ data: QuoteResult }>('/v1/shipments/quote', {
      params: input,
    });
    return res.data.data;
  },

  createShipment: async (input: CreateShipmentInput): Promise<Shipment> => {
    const res = await apiClient.post<{ data: { shipment: Shipment } }>('/v1/shipments', input);
    return res.data.data.shipment;
  },

  listShipments: async (params: {
    cursor?:  string;
    limit?:   number;
    status?:  ShipmentStatus;
  }): Promise<ShipmentListResult> => {
    const res = await apiClient.get<ShipmentListResult>('/v1/shipments', { params });
    return res.data;
  },

  getShipment: async (id: string): Promise<Shipment> => {
    const res = await apiClient.get<{ data: Shipment }>(`/v1/shipments/${id}`);
    return res.data.data;
  },

  getShipmentHistory: async (id: string): Promise<ShipmentHistoryResult> => {
    const res = await apiClient.get<{ data: ShipmentHistoryResult }>(`/v1/shipments/${id}/history`);
    return res.data.data;
  },

  confirmDelivery: async (id: string): Promise<Shipment> => {
    const res = await apiClient.post<{ data: Shipment }>(`/v1/shipments/${id}/confirm`);
    return res.data.data;
  },

  cancelShipment: async (id: string, reason?: string): Promise<Shipment> => {
    const res = await apiClient.patch<{ data: Shipment }>(`/v1/shipments/${id}/cancel`, { reason });
    return res.data.data;
  },

  trackShipment: async (trackingNumber: string): Promise<Partial<Shipment>> => {
    const res = await apiClient.get<{ data: Partial<Shipment> }>(
      `/v1/shipments/tracking/${encodeURIComponent(trackingNumber)}`,
    );
    return res.data.data;
  },

  // Admin
  adminListShipments: async (params: {
    cursor?:   string;
    limit?:    number;
    status?:   ShipmentStatus;
    user_id?:  string;
    search?:   string;
  }): Promise<ShipmentListResult> => {
    const res = await apiClient.get<ShipmentListResult>('/v1/admin/shipments', { params });
    return res.data;
  },

  adminTransition: async (
    id: string,
    body: { status: ShipmentStatus; notes?: string; rejection_reason?: string },
  ): Promise<Shipment> => {
    const res = await apiClient.post<{ data: Shipment }>(`/v1/admin/shipments/${id}/transition`, body);
    return res.data.data;
  },
} as const;
