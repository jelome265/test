// This file must remain the first import in app/_layout.tsx.
// Keep it minimal so Sentry initializes before app modules load.
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = Constants.expoConfig?.extra?.['sentryDsn'] as string | undefined;
const ENVIRONMENT = (Constants.expoConfig?.extra?.['environment'] as string | undefined) ?? 'development';
const VERSION = Constants.expoConfig?.version ?? '1.7.0';

if (DSN && !__DEV__) {
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: `courier-mobile@${VERSION}`,
    tracesSampleRate: ENVIRONMENT === 'production' ? 0.20 : 0.50,
    enableAutoPerformanceTracing: true,
    enableAutoSessionTracking: true,
  });
}
