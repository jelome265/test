/**
 * geo.service.ts — Geographic distance calculation service.
 *
 * Three-tier distance resolution (ADR-021):
 *
 *   Tier 1 — Google Maps Distance Matrix API
 *     Uses real road distances. Most accurate. Requires GOOGLE_MAPS_SERVER_KEY.
 *     Timeout: 5 seconds. If it fails for any reason, falls to tier 2.
 *
 *   Tier 2 — Preset inter-city road distances
 *     INTER_CITY_DISTANCES_KM from shared-constants. Same-city uses tier 3.
 *     Source: verified against Google Maps, accurate to ±5km.
 *     No external dependency. Used when Google Maps is unavailable.
 *
 *   Tier 3 — Default same-city distance
 *     DEFAULT_SAME_CITY_DISTANCE_KM (5km). Used for same-city deliveries
 *     when no coordinates are available.
 *
 * Why not use straight-line (haversine) distance?
 *   Road distance between cities is significantly higher than straight-line.
 *   Lilongwe to Blantyre: ~190km straight-line, ~312km road.
 *   Pricing based on straight-line would systematically undercharge.
 *   We use road distances from the start to avoid a pricing correction later.
 *
 * INVARIANT: This service always returns a positive integer (whole km).
 * It never throws — all failures fall back gracefully.
 */

import {
  CITY_CENTERS,
  INTER_CITY_DISTANCES_KM,
  DEFAULT_SAME_CITY_DISTANCE_KM,
  SUPPORTED_CITIES,
} from '@courier/shared-constants';
import type { SupportedCity, GeoPoint } from '@courier/shared-types';
import axios from 'axios';

import { env, isTest } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DistanceResult {
  distance_km: number;
  source: 'google_maps' | 'preset_table' | 'same_city_default';
}

interface GoogleMapsDistanceResponse {
  rows: Array<{
    elements: Array<{
      status: string;
      distance?: { value: number };   // meters
    }>;
  }>;
  status: string;
}

// ─── Google Maps Distance Matrix ──────────────────────────────────────────────

const GOOGLE_MAPS_TIMEOUT_MS = 5_000;
const GOOGLE_MAPS_BASE_URL   = 'https://maps.googleapis.com/maps/api/distancematrix/json';

/**
 * Attempt to get road distance from Google Maps Distance Matrix API.
 * Returns null on any failure (network, auth, rate limit, bad response).
 */
async function getDistanceFromGoogleMaps(
  origin:      GeoPoint,
  destination: GeoPoint,
): Promise<number | null> {
  if (isTest || !env.GOOGLE_MAPS_SERVER_KEY || env.GOOGLE_MAPS_SERVER_KEY === 'AIzaSy_test_key_here') {
    return null; // Skip in test mode
  }

  try {
    const params = new URLSearchParams({
      origins:      `${origin.latitude},${origin.longitude}`,
      destinations: `${destination.latitude},${destination.longitude}`,
      mode:         'driving',
      key:          env.GOOGLE_MAPS_SERVER_KEY,
    });

    const response = await axios.get<GoogleMapsDistanceResponse>(
      `${GOOGLE_MAPS_BASE_URL}?${params.toString()}`,
      { timeout: GOOGLE_MAPS_TIMEOUT_MS },
    );

    const data = response.data;

    if (data.status !== 'OK') {
      logger.warn({ status: data.status }, 'Google Maps API returned non-OK status');
      return null;
    }

    const element = data.rows[0]?.elements[0];

    if (!element || element.status !== 'OK' || !element.distance) {
      logger.warn(
        { elementStatus: element?.status },
        'Google Maps returned no distance element',
      );
      return null;
    }

    // Convert meters to km, round up to nearest whole km
    const distanceKm = Math.ceil(element.distance.value / 1000);
    return Math.max(distanceKm, 1); // Minimum 1km
  } catch (err) {
    // Any error: timeout, network, auth — fall through to preset
    logger.warn({ err }, 'Google Maps Distance Matrix call failed — using preset distance');
    return null;
  }
}

// ─── Preset distance lookup ───────────────────────────────────────────────────

/**
 * Look up a preset road distance between two supported cities.
 * Returns the value from INTER_CITY_DISTANCES_KM, or null if not found.
 */
function getPresetDistance(
  pickupCity:   SupportedCity,
  deliveryCity: SupportedCity,
): number | null {
  if (pickupCity === deliveryCity) {
    return null; // Same city — handled by tier 3
  }

  const key = `${pickupCity}-${deliveryCity}`;
  const distance = (INTER_CITY_DISTANCES_KM as any)[key];

  if (typeof distance !== 'number' || distance <= 0) {
    logger.error(
      { key, availableKeys: Object.keys(INTER_CITY_DISTANCES_KM) },
      'Preset distance not found for city pair — check INTER_CITY_DISTANCES_KM',
    );
    return null;
  }

  return distance;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CalculateDistanceInput {
  pickup_city:        SupportedCity;
  delivery_city:      SupportedCity;
  sender_lat?:        number | null;
  sender_lng?:        number | null;
  receiver_lat?:      number | null;
  receiver_lng?:      number | null;
}

/**
 * Calculate road distance between pickup and delivery locations.
 *
 * Priority:
 *   1. Google Maps API (if coordinates available and API reachable)
 *   2. Preset inter-city table
 *   3. Same-city default (5km)
 *
 * Always returns a positive integer (whole km). Never throws.
 */
export async function calculateDistance(
  input: CalculateDistanceInput,
): Promise<DistanceResult> {
  const { pickup_city, delivery_city, sender_lat, sender_lng, receiver_lat, receiver_lng } = input;

  // ── Same-city delivery ─────────────────────────────────────────────────────
  if (pickup_city === delivery_city) {
    // Try Google Maps if we have both coordinates
    if (
      typeof sender_lat === 'number' &&
      typeof sender_lng === 'number' &&
      typeof receiver_lat === 'number' &&
      typeof receiver_lng === 'number'
    ) {
      const googleDistance = await getDistanceFromGoogleMaps(
        { latitude: sender_lat, longitude: sender_lng },
        { latitude: receiver_lat, longitude: receiver_lng },
      );

      if (googleDistance !== null) {
        logger.debug(
          { pickup_city, delivery_city, distance_km: googleDistance, source: 'google_maps' },
          'Distance calculated via Google Maps',
        );
        return { distance_km: googleDistance, source: 'google_maps' };
      }
    }

    // Fall to same-city default
    logger.debug(
      { pickup_city, delivery_city, distance_km: DEFAULT_SAME_CITY_DISTANCE_KM },
      'Same-city delivery — using default distance',
    );
    return {
      distance_km: DEFAULT_SAME_CITY_DISTANCE_KM,
      source: 'same_city_default',
    };
  }

  // ── Inter-city delivery ────────────────────────────────────────────────────
  // Determine origin and destination coordinates (user-supplied or city centers)
  const origin: GeoPoint =
    typeof sender_lat === 'number' && typeof sender_lng === 'number'
      ? { latitude: sender_lat, longitude: sender_lng }
      : (CITY_CENTERS as any)[pickup_city];

  const destination: GeoPoint =
    typeof receiver_lat === 'number' && typeof receiver_lng === 'number'
      ? { latitude: receiver_lat, longitude: receiver_lng }
      : (CITY_CENTERS as any)[delivery_city];

  // Tier 1: Google Maps
  const googleDistance = await getDistanceFromGoogleMaps(origin, destination);

  if (googleDistance !== null) {
    logger.debug(
      { pickup_city, delivery_city, distance_km: googleDistance, source: 'google_maps' },
      'Distance calculated via Google Maps',
    );
    return { distance_km: googleDistance, source: 'google_maps' };
  }

  // Tier 2: Preset table
  const presetDistance = getPresetDistance(pickup_city, delivery_city);

  if (presetDistance !== null) {
    logger.debug(
      { pickup_city, delivery_city, distance_km: presetDistance, source: 'preset_table' },
      'Distance from preset table (Google Maps unavailable)',
    );
    return { distance_km: presetDistance, source: 'preset_table' };
  }

  // Tier 3: Should never reach here for valid city pairs, but fail safe
  logger.error(
    { pickup_city, delivery_city },
    'All distance calculation tiers failed — using emergency fallback',
  );
  return {
    distance_km: DEFAULT_SAME_CITY_DISTANCE_KM,
    source: 'same_city_default',
  };
}

/**
 * Validate that a city is in the supported service area.
 * Returns true if the city is supported, false otherwise.
 */
export function isSupportedCity(city: string): city is SupportedCity {
  return (SUPPORTED_CITIES as readonly string[]).includes(city);
}
