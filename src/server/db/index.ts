import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
};

const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!, {
    max: 10,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });

export type DrizzleDB = typeof db;

/** Transaction or DB — use this as param type for functions that accept either */
export type DrizzleDBOrTx = Parameters<
  Parameters<DrizzleDB['transaction']>[0]
>[0];

export type DbClient = DrizzleDB | DrizzleDBOrTx;
