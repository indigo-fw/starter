#!/usr/bin/env bun
/**
 * Integration-test harness — runs `*.db.test.ts` against a real Postgres DB.
 *
 * Flow:
 *   1. Connect to admin DB, create a temp DB `indigo_test_<ts>_<rand>`.
 *   2. Run `drizzle-kit migrate` against the temp DB.
 *   3. Run vitest with `vitest.db.config.ts` (which only picks up `*.db.test.ts`).
 *   4. Drop the temp DB. Cleanup runs even on failure.
 *
 * Overrides (env):
 *   TEST_DB_URL          — admin postgres URL (default: postgres://postgres@127.0.0.1:5432/postgres)
 *   TEST_DB_KEEP=1       — don't drop the temp DB on exit (debugging)
 */
import postgres from 'postgres';
import { spawnSync } from 'node:child_process';

const ADMIN_URL = process.env.TEST_DB_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres';
const TEST_DB = `indigo_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Replace the dbname segment in a postgres URL, preserving query string. */
function withDb(url: string, dbname: string): string {
  return url.replace(/\/[^/?]+(\?.*)?$/, `/${dbname}$1`);
}
const TEST_URL = withDb(ADMIN_URL, TEST_DB);

function maskPassword(url: string): string {
  return url.replace(/:\/\/([^:@]+):([^@]+)@/, '://$1:***@');
}

console.log(`[test-db] admin → ${maskPassword(ADMIN_URL)}`);
console.log(`[test-db] temp  → ${TEST_DB}`);

const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {}, connect_timeout: 5 });
let exitCode = 1;

// Preflight: a friendly message beats a cryptic ECONNREFUSED stack trace.
try {
  await admin.unsafe('SELECT 1');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  const refused = /ECONNREFUSED|ENOTFOUND|connection.*refused|timeout/i.test(msg);
  console.error(`[test-db] ✗ cannot reach Postgres at ${maskPassword(ADMIN_URL)}`);
  console.error(`[test-db]   ${msg}`);
  if (refused) {
    console.error(`[test-db]`);
    console.error(`[test-db]   • is your local Postgres running? (Laragon "Start All", \`pg_ctl start\`, etc.)`);
    console.error(`[test-db]   • override the admin URL: TEST_DB_URL=postgres://user:pass@host:5432/postgres bun run test:db`);
  }
  await admin.end({ timeout: 2 });
  process.exit(1);
}

try {
  await admin.unsafe(`CREATE DATABASE "${TEST_DB}"`);
  console.log(`[test-db] ✓ created ${TEST_DB}`);

  const env = { ...process.env, DATABASE_URL: TEST_URL };

  // shell:true → cross-platform (bunx.cmd on Windows, bunx on Unix)
  const migrate = spawnSync('bunx drizzle-kit migrate', { env, stdio: 'inherit', shell: true });
  if (migrate.status !== 0) throw new Error(`drizzle-kit migrate failed (exit ${migrate.status})`);

  const test = spawnSync('bunx vitest run --config vitest.db.config.ts', { env, stdio: 'inherit', shell: true });
  exitCode = test.status ?? 1;
} catch (e) {
  console.error(`[test-db] ✗`, e instanceof Error ? e.message : String(e));
} finally {
  if (process.env.TEST_DB_KEEP === '1') {
    console.log(`[test-db] ⓘ TEST_DB_KEEP=1 — leaving ${TEST_DB} for inspection`);
    console.log(`[test-db]    connect: ${maskPassword(TEST_URL)}`);
  } else {
    try {
      // Kick any lingering connections so DROP doesn't block.
      await admin.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
        [TEST_DB],
      );
      await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
      console.log(`[test-db] ✓ dropped ${TEST_DB}`);
    } catch (e) {
      console.warn(`[test-db] ⚠ failed to drop ${TEST_DB}:`, e instanceof Error ? e.message : String(e));
    }
  }
  await admin.end({ timeout: 2 });
}

process.exit(exitCode);
