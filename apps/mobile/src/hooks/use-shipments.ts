// src/hooks/use-shipments.ts
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';

import type { CourierApiError } from '../api/client';
import { shipmentsApi, type ShipmentListResult } from '../api/shipments';
import { useDraftStore } from '../stores/shipment-draft.store';
import { queryClient } from './query-client';

// ─── Query keys ───────────────────────────────────────────────────────────────
export const shipmentKeys = {
  all:         ['shipments'] as const,
  list:        (filters: object) => [...shipmentKeys.all, 'list', filters] as const,
  detail:      (id: string)      => [...shipmentKeys.all, 'detail', id] as const,
  history:     (id: string)      => [...shipmentKeys.all, 'history', id] as const,
  adminList:   (filters: object) => [...shipmentKeys.all, 'admin-list', filters] as const,
  quote:       (params: object)  => ['quote', params] as const,
};

// ─── Quote (public, no auth required) ────────────────────────────────────────
export function useQuote(params: {
  pickup_city:   string;
  delivery_city: string;
  weight_kg:     number;
  is_fragile:    boolean;
} | null) {
  return useQuery({
    queryKey: shipmentKeys.quote(params ?? {}),
    queryFn:  () => shipmentsApi.getQuote(params!),
    enabled:  params !== null && !!params.pickup_city && !!params.delivery_city && params.weight_kg > 0,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Customer shipment list (infinite / cursor) ───────────────────────────────
export function useMyShipments(status?: string) {
  return useInfiniteQuery<ShipmentListResult, Error, any, any, string | undefined>({
    queryKey:  shipmentKeys.list({ status }),
    queryFn:   ({ pageParam }) =>
      shipmentsApi.listShipments({ cursor: pageParam, status: status as any, limit: 20 }),
    initialPageParam: undefined,
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
    onSuccess: (shipment) => {
      queryClient.invalidateQueries({ queryKey: shipmentKeys.all });
      reset();
      router.replace(`/(app)/shipments/${shipment.id}`);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(shipmentId) });
      queryClient.invalidateQueries({ queryKey: shipmentKeys.all });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(shipmentId) });
      queryClient.invalidateQueries({ queryKey: shipmentKeys.all });
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
  status?: string;
  search?: string;
} = {}) {
  return useInfiniteQuery<ShipmentListResult, Error, any, any, string | undefined>({
    queryKey:  shipmentKeys.adminList(filters),
    queryFn:   ({ pageParam }) =>
      shipmentsApi.adminListShipments({ cursor: pageParam, ...filters as any, limit: 25 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}

export function useAdminTransitionMutation(shipmentId: string) {
  return useMutation({
    mutationFn: (body: { status: any; notes?: string; rejection_reason?: string }) =>
      shipmentsApi.adminTransition(shipmentId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(shipmentId) });
      queryClient.invalidateQueries({ queryKey: shipmentKeys.all });
      Toast.show({ type: 'success', text1: 'Status Updated' });
    },
    onError: (error: CourierApiError) => {
      Toast.show({ type: 'error', text1: 'Transition Failed', text2: error.message });
    },
  });
}
