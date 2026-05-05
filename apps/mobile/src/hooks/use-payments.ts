// src/hooks/use-payments.ts
import { useMutation, useQuery } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import type { CourierApiError } from '../api/client';
import { paymentsApi } from '../api/payments';
import { queryClient } from './query-client';
import { shipmentKeys } from './use-shipments';
import { useEffect } from 'react';

export function useInitiatePaymentMutation() {
  return useMutation({
    mutationFn: paymentsApi.initiatePayment,
    onError: (error: CourierApiError) => {
      Toast.show({
        type:  'error',
        text1: 'Payment Failed',
        text2: error.message,
      });
    },
  });
}

export function useShipmentPayments(shipmentId: string) {
  const query = useQuery({
    queryKey: ['payments', 'shipment', shipmentId],
    queryFn:  () => paymentsApi.getShipmentPayments(shipmentId),
    enabled:  !!shipmentId,
    // Refresh every 5s while payment is in flight (polling for webhook result)
    refetchInterval: (query) => {
      const payments = query.state.data;
      if (!payments) return false;
      const hasActive = payments.some((p) => p.status === 'processing' || p.status === 'pending');
      return hasActive ? 5_000 : false;
    },
  });

  // Handle side-effects in an effect instead of onSuccess (removed in v5)
  useEffect(() => {
    if (query.data) {
      const hasPaid = query.data.some((p) => p.status === 'paid');
      if (hasPaid) {
        queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(shipmentId) });
      }
    }
  }, [query.data, shipmentId]);

  return query;
}
