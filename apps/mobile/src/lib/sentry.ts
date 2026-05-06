// src/lib/sentry.ts
/**
 * Sentry React Native initialization.
 *
 * Call initMobileSentry() as the FIRST statement in app/_layout.tsx,
 * before the QueryClientProvider mounts.
 *
 * Automatic instrumentation covers:
 *   - Expo Router navigation performance
 *   - React component render performance
 *   - Unhandled JS exceptions and Promise rejections
 *   - Native crash reports (via Sentry native SDKs)
 */

import * as Sentry from '@sentry/react-native';
import { reactNativeTracingIntegration } from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN         = Constants.expoConfig?.extra?.['sentryDsn'] as string | undefined;
const ENVIRONMENT = Constants.expoConfig?.extra?.['environment'] as string ?? 'development';
const VERSION     = Constants.expoConfig?.version ?? '1.7.0';

export function initMobileSentry(): void {
  if (!DSN || __DEV__) return;

  Sentry.init({
    dsn:         DSN,
    environment: ENVIRONMENT,
    release:     `courier-mobile@${VERSION}`,

    // Sample 20% of sessions for performance tracing
    tracesSampleRate: ENVIRONMENT === 'production' ? 0.20 : 0.50,

    // Enable automatic Expo Router breadcrumbs
    enableAutoPerformanceTracing: true,
    enableAutoSessionTracking:     true,
    sessionTrackingIntervalMillis: 30_000,

    // Scrub PII from captured events
    beforeSend(event) {
      if (event.extra) {
        const SENSITIVE = ['password', 'access_token', 'refresh_token', 'fcm_token'];
        for (const key of SENSITIVE) {
          if (key in event.extra) {
            event.extra[key] = '[FILTERED]';
          }
        }
      }
      return event;
    },

    integrations: [
      reactNativeTracingIntegration(),
    ],
  });
}

/**
 * Tag the current Sentry scope with the authenticated user.
 * Call after successful login.
 */
export function identifySentryUser(userId: string, role: string): void {
  Sentry.setUser({ id: userId, role });
}

/** Clear user from Sentry scope on logout. */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}
