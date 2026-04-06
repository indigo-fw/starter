import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { db } from '@/server/db';
import { getRedis } from '@/core/lib/redis';

export const dynamic = 'force-dynamic';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

interface CheckResult {
  status: 'ok' | 'error';
  latencyMs: number;
  error?: string;
}

export async function GET() {
  const checks: Record<string, CheckResult> = {};

  // Database check
  const dbStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: 'error', latencyMs: Date.now() - dbStart, error: String(err) };
  }

  // Redis check (optional — "ok" when not configured)
  const redis = getRedis();
  if (redis) {
    const redisStart = Date.now();
    try {
      await redis.ping();
      checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
    } catch (err) {
      checks.redis = { status: 'error', latencyMs: Date.now() - redisStart, error: String(err) };
    }
  } else {
    checks.redis = { status: 'ok', latencyMs: 0 };
  }

  const healthy = Object.values(checks).every((c) => c.status === 'ok');

  // Strip error details in production to avoid leaking internals
  if (IS_PRODUCTION) {
    for (const check of Object.values(checks)) {
      if (check.error) check.error = 'unavailable';
    }
  }

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      checks,
    },
    { status: healthy ? 200 : 503 },
  );
}
