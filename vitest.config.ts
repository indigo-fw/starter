import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
      'scripts/__tests__/**/*.test.ts',
    ],
    // Integration tests that hit a real DB use `*.db.test.ts` and run via
    // `bun run test:db` (vitest.db.config.ts). Don't pick them up in the
    // default jsdom run — they'd fail without a DATABASE_URL.
    exclude: ['**/node_modules/**', '**/*.db.test.ts'],
    // Pins NODE_ENV + dummy env so importing server modules never trips the
    // Zod env validation at collection time (a failed file reports 0 tests).
    setupFiles: ['./scripts/vitest-setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**/*.{ts,tsx}',
        'src/core-*/**/*.{ts,tsx}',
        'src/server/**/*.ts',
        'src/lib/**/*.ts',
        'scripts/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.*',
        '**/_templates/**',
        '**/docs/**',
        '**/*.d.ts',
      ],
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
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
