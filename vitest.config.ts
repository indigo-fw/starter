import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx', 'scripts/__tests__/**/*.test.ts'],
    // Integration tests that hit a real DB use `*.db.test.ts` and run via
    // `bun run test:db` (vitest.db.config.ts). Don't pick them up in the
    // default jsdom run — they'd fail without a DATABASE_URL.
    exclude: ['**/node_modules/**', '**/*.db.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The real `server-only` package throws outside Next.js webpack's
      // `react-server` export condition. In vitest (jsdom env, no condition)
      // it would block any test that touches a server-only module.
      // Stub it out — `next build` still enforces the guard at build time.
      'server-only': path.resolve(__dirname, './scripts/server-only-stub.js'),
    },
  },
});
