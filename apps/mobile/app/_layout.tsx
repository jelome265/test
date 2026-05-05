// app/_layout.tsx
/**
 * Root layout: initializes auth, registers push notifications,
 * sets up React Query provider and notification listeners.
 *
 * Redirects:
 *   - unauthenticated → /(auth)/login
 *   - authenticated + customer → /(app)/shipments
 *   - authenticated + admin    → /(admin)/shipments
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, router, usePathname } from 'expo-router';
import React, { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Toast from 'react-native-toast-message';

import { queryClient }               from '../src/hooks/query-client';
import {
  addNotificationResponseListener,
  registerForPushNotifications,
  setupAndroidChannel,
}                                    from '../src/lib/notifications';
import { useAuthStore }              from '../src/stores/auth.store';
import { useNotificationStore }      from '../src/stores/notification.store';

function AuthGate() {
  const { isAuthenticated, isInitializing, user, _initialize } = useAuthStore();
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);
  const pathname = usePathname();

  // ── Initialize on mount ────────────────────────────────────────────────────
  useEffect(() => {
    void _initialize();
    void setupAndroidChannel();
  }, []);

  // ── Register push token on auth ─────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      void registerForPushNotifications();
      void refreshUnreadCount();
    }
  }, [isAuthenticated]);

  // ── Refresh FCM token on app foreground ─────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isAuthenticated) {
        void registerForPushNotifications();
        void refreshUnreadCount();
      }
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  // ── Navigation logic ────────────────────────────────────────────────────
  useEffect(() => {
    if (isInitializing) return;

    const isAuthRoute  = pathname.startsWith('/(auth)');
    const isAdminRoute = pathname.startsWith('/(admin)');

    if (!isAuthenticated && !isAuthRoute) {
      router.replace('/(auth)/login');
      return;
    }

    if (isAuthenticated) {
      const role = user?.role;

      if (isAuthRoute) {
        const target = role === 'admin' || role === 'super_admin'
          ? '/(admin)/shipments'
          : '/(app)/shipments';
        router.replace(target as any);
      }

      // Prevent customers from accessing admin routes
      if (isAdminRoute && role === 'customer') {
        router.replace('/(app)/shipments');
      }
    }
  }, [isAuthenticated, isInitializing, pathname, user?.role]);

  // ── Notification tap handler ─────────────────────────────────────────────
  useEffect(() => {
    return addNotificationResponseListener();
  }, []);

  return null; // Navigation logic only — no UI
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)"  />
        <Stack.Screen name="(app)"   />
        <Stack.Screen name="(admin)" />
      </Stack>
      <Toast />
    </QueryClientProvider>
  );
}
