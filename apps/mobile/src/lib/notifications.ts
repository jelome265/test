// src/lib/notifications.ts
/**
 * Expo Notifications setup.
 *
 * Responsibilities:
 *   1. Request push permission from the OS
 *   2. Get the Expo Push Token (which wraps the FCM token)
 *   3. Register the FCM token with our backend
 *   4. Handle foreground notification display
 *   5. Handle notification tap → deep link navigation
 *
 * DEVICE REQUIREMENT: Physical device only.
 * Push permissions are not available on simulators.
 * The function getExpoPushToken() will return null on simulator.
 *
 * ANDROID CHANNEL:
 *   Must match channelId sent in FCM message ('courier_default').
 *   Created here during app startup.
 */

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { authApi } from '../api/auth';

// ─── Notification presentation ────────────────────────────────────────────────
// Show notification banner even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:   true,
    shouldPlaySound:   true,
    shouldSetBadge:    true,
    shouldShowBanner:  true,
    shouldShowList:    true,
  }),
});

// ─── Android channel setup ────────────────────────────────────────────────────
export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('courier_default', {
    name:            'CourierApp Notifications',
    importance:       Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor:       '#2563EB',
    sound:            'default',
  });
}

// ─── Token registration ───────────────────────────────────────────────────────
export async function registerForPushNotifications(): Promise<string | null> {
  // Simulators don't support push
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  try {
    // Get FCM device token (not Expo Push Token — we use FCM directly via Firebase Admin)
    const token = (await Notifications.getDevicePushTokenAsync()).data as string;

    // Register with backend
    await authApi.updateFcmToken(token);

    return token;
  } catch (err) {
    console.warn('Push token registration failed:', err);
    return null;
  }
}

// ─── Deep link handler ────────────────────────────────────────────────────────
/**
 * Navigate to the correct screen based on notification data.
 * Data fields: { screen, shipment_id, notification_type }
 */
export function handleNotificationNavigation(
  notification: Notifications.Notification,
): void {
  const data = notification.request.content.data as Record<string, string> | undefined;
  if (!data) return;

  const screen = data['screen'];
  if (!screen) return;

  // Small delay to let any transitional navigation settle
  setTimeout(() => {
    try {
      router.push(screen as any);
    } catch {
      // Screen may not be accessible (e.g. admin screen for a customer)
      router.push('/(app)/notifications');
    }
  }, 100);
}

// ─── Response listener ────────────────────────────────────────────────────────
// Returns an unsubscribe function — call in useEffect cleanup
export function addNotificationResponseListener(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationNavigation(response.notification);
  });
  return () => subscription.remove();
}
