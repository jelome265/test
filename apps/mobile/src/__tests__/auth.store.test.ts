// src/__tests__/auth.store.test.ts
/**
 * Auth store unit tests.
 * SecureStore and authApi are mocked — tests verify store state transitions.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  setItemAsync:    jest.fn().mockImplementation(() => Promise.resolve()),
  getItemAsync:    jest.fn().mockImplementation(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn().mockImplementation(() => Promise.resolve()),
}));

// Mock authApi
jest.mock('../api/auth', () => ({
  authApi: {
    logout:                  jest.fn().mockImplementation(() => Promise.resolve()),
    getProfile:              jest.fn(),
    refreshViaRefreshToken:  jest.fn(),
    updateFcmToken:          jest.fn().mockImplementation(() => Promise.resolve()),
  },
}));

import * as SecureStore from 'expo-secure-store';

import { authApi }      from '../api/auth';
import { useAuthStore } from '../stores/auth.store';

const MOCK_USER = {
  id: 'uuid-1', email: 'test@test.com',
  full_name: 'Test', phone_number: '+265991234567',
  role: 'customer' as const, is_active: true, fcm_token: null,
  created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
};

const MOCK_TOKENS = {
  access_token: 'at1', refresh_token: 'rt1',
  expires_in: 3600, token_type: 'bearer' as const,
};

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      isAuthenticated: false, isInitializing: true,
      user: null, accessToken: null,
    });
  });

  it('login() sets isAuthenticated = true and stores tokens', async () => {
    await useAuthStore.getState().login(MOCK_USER, MOCK_TOKENS);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('uuid-1');
    expect(state.accessToken).toBe('at1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('access_token', 'at1', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refresh_token', 'rt1', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  });

  it('logout() calls authApi.logout and clears state', async () => {
    // Set up logged-in state
    await useAuthStore.getState().login(MOCK_USER, MOCK_TOKENS);

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
  });

  it('logout() still clears state even if authApi.logout throws', async () => {
    (authApi.logout as any).mockRejectedValueOnce(new Error('network'));
    await useAuthStore.getState().login(MOCK_USER, MOCK_TOKENS);

    // Should not throw
    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('_initialize() returns unauthenticated when no stored tokens', async () => {
    (SecureStore.getItemAsync as any).mockResolvedValue(null);

    await useAuthStore.getState()._initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isInitializing).toBe(false);
  });

  it('_initialize() refreshes tokens when near expiry', async () => {
    // access_token present, refresh_token present, expires soon (1 min)
    (SecureStore.getItemAsync as any).mockImplementation(async (key: string) => {
      if (key === 'access_token')     return 'stale-at';
      if (key === 'refresh_token')    return 'rt1';
      if (key === 'token_expires_at') return new Date(Date.now() + 60_000).toISOString();
      if (key === 'user_profile')     return JSON.stringify(MOCK_USER);
      return null;
    });

    (authApi.refreshViaRefreshToken as any).mockResolvedValue({
      user: MOCK_USER, tokens: MOCK_TOKENS,
    });

    await useAuthStore.getState()._initialize();

    expect(authApi.refreshViaRefreshToken).toHaveBeenCalledWith('rt1');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
