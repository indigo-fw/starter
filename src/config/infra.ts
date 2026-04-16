/**
 * Infrastructure configuration — database, audit, maintenance.
 * Edit these values per project. No .env needed for defaults.
 */

export const infraConfig = {
  /** PostgreSQL connection pool */
  db: {
    /** Maximum connections in pool */
    maxConnections: 10,
    /** Close idle connections after this many seconds */
    idleTimeoutSeconds: 20,
  },

  /** Audit log retention (maintenance cleanup runs daily at 3 AM) */
  audit: {
    /** Days to keep audit log entries. 0 = no cleanup (keep forever). */
    retentionDays: 90,
  },
} as const;
