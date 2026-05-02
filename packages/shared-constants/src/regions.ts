import type { SupportedCity, GeoPoint } from '@courier/shared-types';

// City center coordinates — used as fallback for distance calculation
// when user does not share precise location
export const CITY_CENTERS: Record<SupportedCity, GeoPoint> = {
  Lilongwe: { latitude: -13.9626, longitude: 33.7741 },
  Blantyre: { latitude: -15.7867, longitude: 35.0018 },
  Mzuzu:    { latitude: -11.4634, longitude: 34.0175 },
} as const;

// Preset road distances between cities in km
// Source: verified against Google Maps road network distances
// Used as fallback if Google Maps API is unavailable
export const INTER_CITY_DISTANCES_KM: Record<string, number> = {
  'Lilongwe-Blantyre': 312,
  'Blantyre-Lilongwe': 312,
  'Lilongwe-Mzuzu':    382,
  'Mzuzu-Lilongwe':    382,
  'Blantyre-Mzuzu':    548,
  'Mzuzu-Blantyre':    548,
} as const;

// Default same-city distance when coordinates not available
export const DEFAULT_SAME_CITY_DISTANCE_KM = 5;

export const SUPPORTED_CITIES = ['Lilongwe', 'Blantyre', 'Mzuzu'] as const;
