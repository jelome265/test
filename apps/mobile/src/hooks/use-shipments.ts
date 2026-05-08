// src/hooks/use-shipments.ts
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import type { ShipmentStatus } from '@courier/shared-types';
import Toast from 'react-native-toast-message';

import type { CourierApiError } from '../api/client';
import { shipmentsApi } from '../api/shipments';
import { useDraftStore } from '../stores/shipment-draft.store';

import { queryClient } from './query-client';

// ─── Query keys ───────────────────────────────────────────────────────────────
export const shipmentKeys = {
  all:         ['shipments'] as const,
  list:        (filters: { status?: ShipmentStatus }) => [...shipmentKeys.all, 'list', filters] as const,
  detail:      (id: string)      => [...shipmentKeys.all, 'detail', id] as const,
  history:     (id: string)      => [...shipmentKeys.all, 'history', id] as const,
  adminList:   (filters: { status?: ShipmentStatus; search?: string }) => [...shipmentKeys.all, 'admin-list', filters] as const,
  quote:       (params: { pickup_city: string; delivery_city: string; weight_kg: number; is_fragile: boolean } | {})  => ['quote', params] as const,
};

// ─── Quote (public, no auth required) ────────────────────────────────────────
export function useQuote(params: {
  pickup_city:   string;
  delivery_city: string;
  weight_kg:     number;
  is_fragile:    boolean;
} | null) {
  const quoteParams = params ?? undefined;

  return useQuery({
    queryKey: shipmentKeys.quote(quoteParams ?? {}),
    queryFn:  async () => {
      if (!quoteParams) {
        throw new Error('Quote parameters are required');
      }
      return shipmentsApi.getQuote(quoteParams);
    },
    enabled:  quoteParams !== undefined && !!quoteParams.pickup_city && !!quoteParams.delivery_city && quoteParams.weight_kg > 0,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Customer shipment list (infinite / cursor) ───────────────────────────────
export function useMyShipments(status?: ShipmentStatus) {
  return useInfiniteQuery({
    queryKey:  shipmentKeys.list({ status }),
    queryFn:   ({ pageParam }: { pageParam: string | undefined }) =>
      shipmentsApi.listShipments({ cursor: pageParam, status, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}

// ─── Single shipment detail ───────────────────────────────────────────────────
export function useShipment(id: string) {
  return useQuery({
    queryKey: shipmentKeys.detail(id),
    queryFn:  () => shipmentsApi.getShipment(id),
    enabled:  !!id,
  });
}

// ─── Shipment history (with status event timeline) ───────────────────────────
export function useShipmentHistory(id: string) {
  return useQuery({
    queryKey: shipmentKeys.history(id),
    queryFn:  () => shipmentsApi.getShipmentHistory(id),
    enabled:  !!id,
  });
}

// ─── Public tracking (no auth) ───────────────────────────────────────────────
export function useTrackShipment(trackingNumber: string) {
  return useQuery({
    queryKey: ['track', trackingNumber],
    queryFn:  () => shipmentsApi.trackShipment(trackingNumber),
    enabled:  !!trackingNumber,
  });
}

// ─── Create shipment ──────────────────────────────────────────────────────────
export function useCreateShipmentMutation() {
  const reset = useDraftStore((s) => s.reset);

  return useMutation({
    mutationFn: shipmentsApi.createShipment,
    onSuccess: async (shipment) => {
      await queryClient.invalidateQueries({ queryKey: shipmentKeys.all });
      reset();
      const shipmentRoute: Href = {
        pathname: '/(app)/shipments/[id]',
        params: { id: shipment.id },
      };
      router.replace(shipmentRoute);
      Toast.show({
        type:  'success',
        text1: 'Shipment Created',
        text2: `Tracking: ${shipment.tracking_number}`,
      });
    },
    onError: (error: CourierApiError) => {
      Toast.show({
        type:  'error',
        text1: 'Failed to Create Shipment',
        text2: error.message,
      });
    },
  });
}

// ─── Confirm delivery ─────────────────────────────────────────────────────────
export function useConfirmDeliveryMutation(shipmentId: string) {
  return useMutation({
    mutationFn: () => shipmentsApi.confirmDelivery(shipmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(shipmentId) });
      await queryClient.invalidateQueries({ queryKey: shipmentKeys.all });
      Toast.show({ type: 'success', text1: 'Delivery Confirmed', text2: 'Thank you for using CourierApp.' });
    },
    onError: (error: CourierApiError) => {
      Toast.show({ type: 'error', text1: 'Failed to Confirm', text2: error.message });
    },
  });
}

// ─── Cancel shipment ──────────────────────────────────────────────────────────
export function useCancelShipmentMutation(shipmentId: string) {
  return useMutation({
    mutationFn: (reason?: string) => shipmentsApi.cancelShipment(shipmentId, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(shipmentId) });
      await queryClient.invalidateQueries({ queryKey: shipmentKeys.all });
      Toast.show({ type: 'success', text1: 'Shipment Cancelled' });
      router.back();
    },
    onError: (error: CourierApiError) => {
      Toast.show({ type: 'error', text1: 'Cancellation Failed', text2: error.message });
    },
  });
}

// ─── Admin hooks ──────────────────────────────────────────────────────────────
export function useAdminShipments(filters: {
  status?: ShipmentStatus;
  search?: string;
} = {}) {
  return useInfiniteQuery({
    queryKey:  shipmentKeys.adminList(filters),
    queryFn:   ({ pageParam }: { pageParam: string | undefined }) =>
      shipmentsApi.adminListShipments({ cursor: pageParam, ...filters, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}

export function useAdminTransitionMutation(shipmentId: string) {
  return useMutation({
    mutationFn: (body: { status: ShipmentStatus; notes?: string; rejection_reason?: string }) =>
      shipmentsApi.adminTransition(shipmentId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(shipmentId) });
      await queryClient.invalidateQueries({ queryKey: shipmentKeys.all });
      Toast.show({ type: 'success', text1: 'Status Updated' });
    },
    onError: (error: CourierApiError) => {
      Toast.show({ type: 'error', text1: 'Transition Failed', text2: error.message });
    },
  });
}
