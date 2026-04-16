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
  {
    name: 'memory',
    check: async () => {
      const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      if (heapUsedMB > 512) {
        throw new Error(`High heap usage: ${heapUsedMB}MB`);
      }
    },
  },
  {
    name: 'queue',
    check: async () => {
      const redis = getRedis();
      if (!redis) return;
      const waiting = await redis.llen('bull:email:wait').catch(() => 0);
      if (waiting > 100) {
        throw new Error(`Email queue backlog: ${waiting} jobs waiting`);
      }
    },
  },
]);
