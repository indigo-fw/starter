/**
 * Indigo Promote Script
 *
 * Promote a user to superadmin by email:
 *   bun run promote <email>
 */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { invalidateUserSessions } from '@/core/lib/auth/session-invalidation';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: bun run promote <email>');
  process.exit(1);
}

async function main() {
  const sql = postgres(DATABASE_URL!);
  const db = drizzle(sql);

  try {
    const { user } = await import('../server/db/schema/auth');

    const [found] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (!found) {
      console.error(`No user found with email "${email}".`);
      process.exit(1);
    }

    if (found.role === 'superadmin') {
      console.log(`"${found.name}" <${found.email}> is already superadmin.`);
      return;
    }

    await db
      .update(user)
      .set({ role: 'superadmin', updatedAt: new Date() })
      .where(eq(user.id, found.id));

    // The role rides in the cookie-cached session for up to 5 min. This script
    // is its own process, so only the Redis broadcast reaches the running
    // server; without REDIS_URL the promotion bites at the next cache refresh.
    invalidateUserSessions(found.id);

    console.log(
      `Promoted "${found.name}" <${found.email}> from "${found.role}" to superadmin.`
    );
  } finally {
    await sql.end();
    // The broadcast above is fire-and-forget; give the publish a beat to leave,
    // then close the Redis socket — an open ioredis connection would otherwise
    // keep this process alive forever.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const { disconnectAll } = await import('@/core/lib/infra/redis');
    await disconnectAll();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
