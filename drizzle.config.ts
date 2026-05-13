import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // No `tablesFilter` — every table referenced from the schema index (including
  // Better Auth's user/session/account/… defined in src/server/db/schema/auth.ts)
  // is ours to manage, so drizzle-kit owns all of them. Better Auth itself does
  // not push migrations against this DB; bumping the dependency only requires
  // editing auth.ts and running `bun run db:generate` like any other schema change.
} satisfies Config;
