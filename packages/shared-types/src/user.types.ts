import type { SupportedCity } from './shipment.types.js';

export type UserRole = 'customer' | 'admin' | 'super_admin';

export interface UserProfile {
  id: string;                    // UUID — same as auth.users.id
  email: string;
  full_name: string;
  phone_number: string;
  role: UserRole;
  is_active: boolean;
  fcm_token: string | null;      // Firebase Cloud Messaging token
  created_at: string;            // ISO 8601
  updated_at: string;
}

export interface SavedAddress {
  id: string;
  user_id: string;
  label: string;                 // 'Home', 'Office', etc.
  street: string;
  area: string;
  city: SupportedCity;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// Re-export for convenience
export type { SupportedCity } from './shipment.types.js';
