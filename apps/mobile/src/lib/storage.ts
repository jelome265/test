// src/lib/storage.ts
/**
 * Typed wrapper around expo-secure-store.
 * All tokens are encrypted at rest by the OS keychain/keystore.
 * Never use AsyncStorage for credentials.
 */

import * as SecureStore from 'expo-secure-store';

export type StorageKey =
  | 'access_token'
  | 'refresh_token'
  | 'token_expires_at'   // ISO 8601 — used to pre-emptively refresh
  | 'user_profile';       // Serialized UserProfile (avoids login screen flash)

export async function setItem(key: StorageKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getItem(key: StorageKey): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function removeItem(key: StorageKey): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

export async function clearAll(): Promise<void> {
  const keys: StorageKey[] = [
    'access_token',
    'refresh_token',
    'token_expires_at',
    'user_profile',
  ];
  await Promise.allSettled(keys.map((k) => SecureStore.deleteItemAsync(k)));
}
