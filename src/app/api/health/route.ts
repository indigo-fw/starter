import { sql } from 'drizzle-orm';

import { createHealthHandler } from '@/core/lib/api/health';
import { getBuildInfo } from '@/core/lib/infra/build-info';
import { getMemorySnapshot } from '@/core/lib/infra/memory-stats';
import { BULLMQ_PREFIX } from '@/core/lib/infra/queue';
import { getRequestRedis } from '@/core/lib/infra/redis';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

const CHECKS = [
  {
    name: 'database',
    check: async () => {
      await db.execute(sql`SELECT 1`);
    },
  },
  {
    name: 'redis',
    check: async () => {
      // Fail-fast connection: the BullMQ profile buffers commands forever
      // while Redis is down, which would hang the probe instead of failing it.
      const redis = getRequestRedis();
      if (!redis) return; // Not configured — not an error
      await redis.ping();
    },
  },
  // Memory and queue backlog describe load, not liveness: reported as
  // `degraded` only. Gating on them would restart-loop a busy process (heap
  // > 512 MB on a 2 GB container) or flip every replica unhealthy at once
  // when one newsletter is sent (>100 queued emails).
  {
    name: 'memory',
    critical: false,
    check: async () => {
      const heapUsedMB = Math.round(
        process.memoryUsage().heapUsed / 1024 / 1024
      );
      if (heapUsedMB > 512) {
        throw new Error(`High heap usage: ${heapUsedMB}MB`);
      }
    },
  },
  {
    name: 'queue',
    critical: false,
    check: async () => {
      const redis = getRequestRedis();
      if (!redis) return;
      const waiting = await redis
        .llen(`${BULLMQ_PREFIX}:email:wait`)
        .catch(() => 0);
      if (waiting > 100) {
        throw new Error(`Email queue backlog: ${waiting} jobs waiting`);
      }
    },
  },
];

let handler: (() => Promise<Response>) | null = null;

async function getHandler(): Promise<() => Promise<Response>> {
  if (handler) return handler;
  const build = await getBuildInfo();
  handler = createHealthHandler(CHECKS, {
    startedAt: Date.now() - process.uptime() * 1000,
    extra: {
      build,
      // A getter: the response spreads `extra`, which reads it per request —
      // so memory + registered counters are live, not frozen at first call.
      get memory() {
        return getMemorySnapshot();
      },
    },
  });
  return handler;
}

export async function GET(): Promise<Response> {
  return (await getHandler())();
}
