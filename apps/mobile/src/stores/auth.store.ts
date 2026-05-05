// src/stores/auth.store.ts
/**
 * Auth store: single source of truth for session state.
 *
 * BOOTSTRAP SEQUENCE (cold start):
 *   1. App mounts → _initialize() called
 *   2. Reads stored tokens + profile from SecureStore
 *   3. Validates token expiry — if expired, refreshes silently
 *   4. Sets isAuthenticated + user
 *   5. Root layout reads isAuthenticated → redirects accordingly
 *
 * TOKEN STORAGE CONTRACT:
 *   All token writes go through setTokens() — never call storage directly.
 */

import type { UserProfile } from '@courier/shared-types';
import { create } from 'zustand';

import { authApi } from '../api/auth';
import * as storage from '../lib/storage';

interface AuthState {
  // Session state
  isAuthenticated:   boolean;
  isInitializing:    boolean;
  user:              UserProfile | null;
  accessToken:       string | null;

  // Actions
  _initialize:       () => Promise<void>;
  _setTokens:        (tokens: {
    access_token:    string;
    refresh_token:   string;
    expires_in:      number;
  }) => Promise<void>;
  setUser:           (user: UserProfile) => void;
  login:             (user: UserProfile, tokens: {
    access_token:    string;
    refresh_token:   string;
    expires_in:      number;
    token_type:      'bearer';
  }) => Promise<void>;
  logout:            () => Promise<void>;
  refreshProfile:    () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isInitializing:  true,
  user:            null,
  accessToken:     null,

  _initialize: async () => {
    try {
      const [accessToken, refreshToken, expiresAt, profileJson] = await Promise.all([
        storage.getItem('access_token'),
        storage.getItem('refresh_token'),
        storage.getItem('token_expires_at'),
        storage.getItem('user_profile'),
      ]);

      if (!accessToken || !refreshToken) {
        set({ isAuthenticated: false, isInitializing: false });
        return;
      }

      // Check token freshness — pre-refresh if within 5 minutes of expiry
      const needsRefresh = expiresAt
        ? new Date(expiresAt).getTime() - Date.now() < 5 * 60 * 1000
        : true;

      if (needsRefresh) {
        try {
          const res = await authApi.refreshViaRefreshToken(refreshToken);
          await get()._setTokens(res.tokens);
        } catch {
          // Refresh failed — session expired, force login
          await storage.clearAll();
          set({ isAuthenticated: false, isInitializing: false });
          return;
        }
      } else {
        set({ accessToken });
      }

      // Restore profile from storage (avoids a network call on cold start)
      const user = profileJson
        ? (JSON.parse(profileJson) as UserProfile)
        : await authApi.getProfile();

      if (!profileJson) {
        await storage.setItem('user_profile', JSON.stringify(user));
      }

      set({ isAuthenticated: true, isInitializing: false, user });
    } catch {
      set({ isAuthenticated: false, isInitializing: false });
    }
  },

  _setTokens: async ({ access_token, refresh_token, expires_in }) => {
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    await Promise.all([
      storage.setItem('access_token',     access_token),
      storage.setItem('refresh_token',    refresh_token),
      storage.setItem('token_expires_at', expiresAt),
    ]);
    set({ accessToken: access_token });
  },

  setUser: (user) => {
    set({ user });
    // Persist latest profile (non-blocking)
    storage.setItem('user_profile', JSON.stringify(user)).catch(() => void 0);
  },

  login: async (user, tokens) => {
    await get()._setTokens(tokens);
    await storage.setItem('user_profile', JSON.stringify(user));
    set({ isAuthenticated: true, user, accessToken: tokens.access_token });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Best-effort: clear local state regardless
    } finally {
      await storage.clearAll();
      set({ isAuthenticated: false, user: null, accessToken: null });
    }
  },

  refreshProfile: async () => {
    const user = await authApi.getProfile();
    get().setUser(user);
  },
}));
