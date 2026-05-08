// src/types/navigation.ts
import type { Href } from 'expo-router';

/**
 * Strongly typed navigation parameters for common app routes.
 * Used to ensure router.push() calls are type-safe.
 */

export type AppRoute = Href;

export interface ShipmentParams {
  id: string;
}

export interface TrackingParams {
  trackingNumber: string;
}

export interface PaymentParams {
  shipmentId: string;
}
