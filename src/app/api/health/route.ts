import { sql } from 'drizzle-orm';

import { db } from '@/server/db';
import { getRedis } from '@/core/lib/infra/redis';
import { createHealthHandler } from '@/core/lib/api/health';

export const dynamic = 'force-dynamic';

export const GET = createHealthHandler([
  {
    name: 'database',
    check: async () => {
      await db.execute(sql`SELECT 1`);
    },
  },
  {
    name: 'redis',
    check: async () => {
      const redis = getRedis();
      if (!redis) return; // Not configured — not an error
      await redis.ping();
    },
  },
]);
