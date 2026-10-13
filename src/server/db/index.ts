import * as schema from './schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { infraConfig } from '@/config/infra';

const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
};

const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!, {
    max: infraConfig.db.maxConnections,
    idle_timeout: infraConfig.db.idleTimeoutSeconds,
    // Without this a down/unreachable Postgres leaves the first query hanging
    // on the OS TCP timeout (minutes) instead of failing fast.
    connect_timeout: infraConfig.db.connectTimeoutSeconds,
  });

// Memoise on globalThis in ALL environments, not just dev. In dev it survives
// HMR; in production it dedupes the pool across the separate server bundles
// that share one process (Next's route bundles, the unbundled `server.ts`
// entry, BullMQ workers). Each of those would otherwise call `postgres()` and
// open its own `maxConnections`, multiplying the connection count per process
// and blowing past the server's `max_connections` during deploy overlap.
globalForDb.pgClient = client;

export const db = drizzle(client, { schema });

export type DrizzleDB = typeof db;

/** Transaction or DB — use this as param type for functions that accept either */
export type DrizzleDBOrTx = Parameters<
  Parameters<DrizzleDB['transaction']>[0]
>[0];

export type DbClient = DrizzleDB | DrizzleDBOrTx;
