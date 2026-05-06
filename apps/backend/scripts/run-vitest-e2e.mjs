import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

process.env.NODE_ENV = 'test';

const envFile = resolve(process.cwd(), '.env.test');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const vitestEntrypoint = resolve(process.cwd(), 'node_modules/vitest/vitest.mjs');
const result = spawnSync(
  process.execPath,
  [
    vitestEntrypoint,
    '--config',
    'vitest.e2e.config.ts',
    '--configLoader',
    'native',
    '--pool',
    'threads',
    '--maxWorkers',
    '1',
    'run',
  ],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

process.exit(result.status ?? 1);
