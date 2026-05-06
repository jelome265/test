/**
 * vitest.config.ts — Test runner configuration.
 *
 * Uses Vitest (Vite-based, drop-in Mocha replacement).
 * See apps/backend/package.json for test scripts.
 *
 * Test file discovery:
 *   - Unit tests:       test/unit/**\/*.test.ts
 *   - Integration tests: test/integration/**\/*.test.ts
 *
 * Environment variables for tests are set in .github/workflows/backend-ci.yml.
 * For local testing, copy apps/backend/.env.example to apps/backend/.env.test
 * and fill in test values.
 *
 * Test isolation:
 *   - Each test file gets its own module context (isolate: true)
 *   - No shared mutable state between test files
 *   - Use vi.mock() for external dependencies (Supabase, Firebase, Redis)
 */

import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Test file patterns
    include: [
      'test/unit/**/*.test.ts',
      'test/integration/**/*.test.ts',
    ],

    // Module isolation: each file gets fresh module registry
    isolate: true,

    // Reporter: verbose in CI, default locally
    reporter: process.env['CI'] ? 'verbose' : 'default',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter:  ['text', 'json', 'html'],
      include:   ['src/**/*.ts'],
      exclude:   ['src/**/*.d.ts', 'src/index.ts'],
      // Minimum thresholds — CI fails if coverage drops below these
      thresholds: {
        statements: 70,
        branches:   65,
        functions:  70,
        lines:      70,
      },
    },

    // Global test timeout: 10 seconds per test
    // Integration tests that make real DB calls should be faster than this
    testTimeout: 10_000,

    // Setup files run before each test file
    setupFiles: ['./test/setup.ts'],
  },

  resolve: {
    alias: {
      '@courier/shared-types':      resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@courier/shared-validation': resolve(__dirname, '../../packages/shared-validation/src/index.ts'),
      '@courier/shared-constants':  resolve(__dirname, '../../packages/shared-constants/src/index.ts'),
    },
  },
});
