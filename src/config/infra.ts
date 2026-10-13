/**
 * Infrastructure configuration — database, audit, maintenance.
 * Edit these values per project. No .env needed for defaults.
 *
 * Read from `process.env` directly (not `@/lib/env`): this file is imported by
 * `src/server/db`, which CLI scripts load outside Next's server runtime where
 * the `server-only` guard in `@/lib/env` would throw.
 */

/** Positive-integer env override with a fallback, so a typo can't yield NaN or 0. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const infraConfig = {
  /** PostgreSQL connection pool */
  db: {
    /**
     * Maximum connections in pool. Size against Postgres `max_connections` and
     * the number of app instances sharing it (including deploy overlap);
     * override per deployment with `DB_POOL_SIZE`.
     */
    maxConnections: envInt('DB_POOL_SIZE', 10),
    /** Close idle connections after this many seconds */
    idleTimeoutSeconds: 20,
    /** Give up connecting after this many seconds (override: `DB_CONNECT_TIMEOUT_MS`) */
    connectTimeoutSeconds: Math.max(
      1,
      Math.ceil(envInt('DB_CONNECT_TIMEOUT_MS', 5000) / 1000)
    ),
  },

  /** Audit log retention (maintenance cleanup runs daily at 3 AM) */
  audit: {
    /** Days to keep audit log entries. 0 = no cleanup (keep forever). */
    retentionDays: 90,
  },
} as const;
