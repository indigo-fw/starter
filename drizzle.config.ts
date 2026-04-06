import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Only include tables WE own. Better Auth tables (user, session, account,
  // verification, organization, member, invitation) are excluded to prevent
  // Drizzle from generating migrations that conflict with Better Auth updates.
  tablesFilter: ['cms_*', 'saas_*'],
} satisfies Config;
