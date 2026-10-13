/**
 * Vitest global setup — runs before every unit-test file (vitest.config.ts).
 *
 * Pins the process environment so importing a server module never trips the
 * Zod env validation in src/lib/env.ts, which throws at import time. Without
 * this, a test file that transitively imports env.ts fails at *collection* —
 * and a failed file reports "0 tests", which is easy to misread as "nothing to
 * run here" instead of "this whole suite silently ran nothing".
 *
 * Values are inert dummies. DATABASE_URL is force-set (not defaulted) so a
 * real URL exported in the developer's shell can never be reached by a unit
 * test; DB-backed tests run under vitest.db.config.ts, which doesn't load this.
 *
 * Also blocks every real network transport (see ./network-guard.ts): a unit
 * test that reaches a live provider is a leak or a flake, and application
 * retry/fallback code can hide the failure so the suite still passes. The
 * global afterEach below closes that gap: a blocked attempt fails the test
 * that caused it even when application code swallowed the error.
 */
import { assertNoNetworkRequests, installNetworkGuard } from './network-guard';
import { afterEach } from 'vitest';

const env = process.env as Record<string, string | undefined>;

env.NODE_ENV = 'test';
env.DATABASE_URL = 'postgresql://test:test@localhost:5432/indigo_unit_test';
env.BETTER_AUTH_SECRET ??=
  'vitest-dummy-secret-0123456789abcdef0123456789abcdef';
env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
env.BETTER_AUTH_URL ??= 'http://localhost:3000';

// Dev-only knobs that change code paths under test.
delete env.EMAIL_DRY_RUN;
delete env.INDIGO_ROBOTS_PROFILE;
delete env.LOG_LEVEL;
delete env.REDIS_URL;

installNetworkGuard();

// Stubbed transports (`global.fetch = vi.fn()`, `vi.mock()` on a client) never
// reach the guard, so only genuinely unmocked attempts are recorded here.
afterEach(() => {
  assertNoNetworkRequests();
});
