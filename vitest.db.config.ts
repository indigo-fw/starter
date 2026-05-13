/**
 * Vitest config for integration tests that hit a real Postgres DB.
 * Run via `bun run test:db` — the `test-db.ts` harness spins up a temp DB,
 * runs migrations, sets DATABASE_URL, then invokes this config.
 *
 * Differences from the default vitest.config.ts:
 *  - `environment: 'node'` (not jsdom — these are pure-server tests).
 *  - `include` only `*.db.test.ts`.
 *  - `fileParallelism: false` — tests serialize on a shared DB; the per-test
 *    `beforeEach` wipes saas_subscriptions + organization rows.
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.db.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './scripts/server-only-stub.js'),
    },
  },
});
