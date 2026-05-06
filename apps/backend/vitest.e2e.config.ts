import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/e2e/**/*.e2e.test.ts'],
    isolate: true,
    reporter: process.env['CI'] ? 'verbose' : 'default',
    testTimeout: 10_000,
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@courier/shared-types': resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@courier/shared-validation': resolve(__dirname, '../../packages/shared-validation/src/index.ts'),
      '@courier/shared-constants': resolve(__dirname, '../../packages/shared-constants/src/index.ts'),
    },
  },
});
