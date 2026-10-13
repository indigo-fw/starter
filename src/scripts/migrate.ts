/**
 * Production migration runner with a PostgreSQL advisory lock.
 *
 * On deploy, replicas boot at roughly the same moment and each runs this from
 * `docker-entrypoint.sh`. `drizzle-kit migrate` takes no coordination lock, so
 * concurrent runs race: every instance sees the same pending set, the losers
 * fail on an already-applied object ("relation already exists") and, under the
 * entrypoint's `set -e`, the container crash-loops. A session-scoped advisory
 * lock serializes them — the first replica migrates while the rest block, then
 * each waiter runs a no-op because the migrations are already recorded.
 *
 * Scope: this fixes CONCURRENCY only. It does not make a breaking
 * (non-additive) schema change safe during a rolling deploy — old code is
 * still serving while the new schema lands, which needs expand/contract
 * migrations across two deploys. Additive changes (new column/index/table) are
 * safe for the still-running old instances, so applying them at boot costs no
 * downtime.
 *
 *   bun run db:migrate
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/** Shared across all instances so they contend for the same lock. */
const LOCK_NAME = 'indigo_migrate';
/**
 * Must exceed the longest expected migration so waiters block rather than give
 * up. A waiter that still times out exits non-zero (restart + retry) instead of
 * proceeding against a possibly half-migrated schema.
 */
const LOCK_TIMEOUT_MS = 300_000;
const MIGRATIONS_FOLDER = 'drizzle';

function getDbUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required to run migrations');
  return raw;
}

async function main(): Promise<void> {
  const url = getDbUrl();

  // A dedicated single connection holds the lock for the whole run: advisory
  // locks taken with pg_advisory_lock are session-scoped, so the lock lives
  // exactly as long as this connection. `max: 1` guarantees the lock and its
  // release run on the same physical session.
  const lockSql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    // `lock_timeout` applies to advisory-lock waits, so a stuck peer surfaces
    // as an error here instead of hanging the deploy forever.
    await lockSql.unsafe(`SET lock_timeout = ${LOCK_TIMEOUT_MS}`);
    try {
      await lockSql`SELECT pg_advisory_lock(hashtext(${LOCK_NAME})::bigint)`;
    } catch (err) {
      throw new Error(
        `Could not acquire migration lock '${LOCK_NAME}' within ${LOCK_TIMEOUT_MS}ms ` +
          `(${err instanceof Error ? err.message : String(err)}). Aborting so this instance ` +
          'restarts and retries instead of serving against an unmigrated schema.'
      );
    }

    console.log(`[migrate] Acquired '${LOCK_NAME}' — applying migrations…`);

    // Separate connection for the migrator itself; the lock connection stays
    // idle holding the lock.
    const migrateSql = postgres(url, { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(migrateSql), {
        migrationsFolder: MIGRATIONS_FOLDER,
      });
      console.log('[migrate] Migrations applied.');
    } finally {
      await migrateSql.end({ timeout: 5 });
    }
  } finally {
    // Release explicitly; if the connection already died the lock auto-releases
    // with the session, so a failure here is harmless.
    try {
      await lockSql`SELECT pg_advisory_unlock(hashtext(${LOCK_NAME})::bigint)`;
    } catch {
      // ignore — the lock is released on connection close regardless
    }
    await lockSql.end({ timeout: 5 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[migrate] Migration failed:', err);
    process.exit(1);
  });
