import type { UserRole } from './user.types.js';

export type SupportedCity = 'Lilongwe' | 'Blantyre' | 'Mzuzu';

export type PackageSize = 'small' | 'medium' | 'large';

// ─── State machine — all valid states ─────────────────────────────
export type ShipmentStatus =
  | 'pending_approval'     // Submitted — awaiting admin review
  | 'approved'             // Admin approved — customer must pay
  | 'payment_pending'      // Payment initiated with provider
  | 'payment_confirmed'    // Payment verified via webhook
  | 'picked_up'            // Courier collected package
  | 'in_transit'           // En route to destination
  | 'delivered'            // Marked delivered — awaiting receiver confirm
  | 'confirmed'            // Receiver confirmed receipt (TERMINAL)
  | 'rejected'             // Admin rejected (TERMINAL)
  | 'cancelled'            // Cancelled by user or admin (TERMINAL)
  | 'failed';              // Delivery failed (can re-submit)

export const TERMINAL_STATUSES: ShipmentStatus[] = [
  'confirmed',
  'rejected',
  'cancelled',
];

export const ACTIVE_STATUSES: ShipmentStatus[] = [
  'approved',
  'payment_pending',
  'payment_confirmed',
  'picked_up',
  'in_transit',
  'delivered',
];

// ─── Shipment record ───────────────────────────────────────────────
export interface Shipment {
  id: string;
  tracking_number: string;       // e.g. "CRR-20240101-A3F9C2"
  user_id: string;

  // Sender snapshot (immutable after creation)
  sender_name: string;
  sender_phone: string;
  sender_email: string | null;
  sender_address: string;
  sender_city: SupportedCity;
  sender_lat: number | null;
  sender_lng: number | null;

  // Receiver snapshot (immutable after creation)
  receiver_name: string;
  receiver_phone: string;
  receiver_email: string | null;
  receiver_address: string;
  receiver_city: SupportedCity;
  receiver_lat: number | null;
  receiver_lng: number | null;

  // Package
  weight_kg: number;
  package_size: PackageSize;
  package_description: string;
  is_fragile: boolean;
  declared_value_mwk: number | null;   // Customer-declared value, tambala

  // Routing
  pickup_city: SupportedCity;
  delivery_city: SupportedCity;
  distance_km: number;

  // Pricing — stored as INTEGER in tambala (MWK × 100)
  quoted_price_mwk: number;
  final_price_mwk: number | null;

  // State
  status: ShipmentStatus;
  rejection_reason: string | null;
  delivery_notes: string | null;
  proof_of_delivery_url: string | null;

  // Admin
  reviewed_by: string | null;
  reviewed_at: string | null;

  // Key timestamps
  estimated_delivery_date: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Status event (immutable audit trail entry) ────────────────────
export interface ShipmentStatusEvent {
  id: string;
  shipment_id: string;
  from_status: ShipmentStatus | null;   // null for first event
  to_status: ShipmentStatus;
  notes: string | null;
  actor_id: string;
  actor_role: UserRole;
  ip_address: string | null;
  created_at: string;
}

// ─── Price breakdown for UI display ───────────────────────────────
export interface PriceBreakdown {
  base_price_mwk: number;
  distance_charge_mwk: number;
  weight_charge_mwk: number;
  fragile_surcharge_mwk: number;
  total_mwk: number;
  distance_km: number;
}
