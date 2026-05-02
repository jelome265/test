/**
 * test/setup.ts — Global test setup.
 * Runs before every test file (configured in vitest.config.ts setupFiles).
 *
 * Responsibilities:
 *   - Force NODE_ENV=test (affects logger, rate limiters, Firebase init)
 *   - Suppress console output that leaks into test results
 *   - Set required environment variables to valid test values
 */

// Force test environment BEFORE any other module is loaded
process.env['NODE_ENV'] = 'test';

// Set all required env vars to valid test values
// These avoid env.ts calling process.exit(1) in test mode
const testEnv: Record<string, string> = {
  PORT:                    '3001',
  CORS_ALLOWED_ORIGINS:    'http://localhost:3001',
  SUPABASE_URL:            'https://test.supabase.co',
  SUPABASE_ANON_KEY:       'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'x'.repeat(100),
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'x'.repeat(100),
  PAYCHANGU_PUBLIC_KEY:    'pub_test_xxxxxxxxxxxx',
  PAYCHANGU_SECRET_KEY:    'sec_test_xxxxxxxxxxxx',
  PAYCHANGU_WEBHOOK_SECRET: 'test-webhook-secret-minimum-32-chars-here',
  PAYCHANGU_BASE_URL:      'https://api.paychangu.com',
  FIREBASE_PROJECT_ID:     'test-project',
  FIREBASE_CLIENT_EMAIL:   'test@test.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY:    '-----BEGIN PRIVATE KEY-----\n' + 'x'.repeat(100) + '\n-----END PRIVATE KEY-----\n',
  GOOGLE_MAPS_SERVER_KEY:  'AIzaSy_test_key_here',
  REDIS_URL:               'redis://localhost:6379',
  ADMIN_EMAIL:             'admin@test.com',
  SENTRY_ENVIRONMENT:      'development',
};

for (const [key, value] of Object.entries(testEnv)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
