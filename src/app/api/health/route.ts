import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { db } from '@/server/db';
import { getRedis } from '@/core/lib/infra/redis';
import { runHealthChecks, getRegisteredModules } from '@/core/lib/module-hooks';

export const dynamic = 'force-dynamic';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const startedAt = Date.now();

interface CheckResult {
  status: 'ok' | 'error' | 'degraded';
  latencyMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * GET /api/health
 *
 * Returns system health including:
 * - Database connectivity + latency
 * - Redis connectivity (if configured)
 * - All registered module health checks
 * - Loaded module list
 * - Server uptime
 *
 * 200 if healthy, 503 if any core check fails.
 * Production strips error details to avoid leaking internals.
 */
export async function GET() {
  const checks: Record<string, CheckResult> = {};

  // ── Database ────────────────────────────────────────────────────────────────
  const dbStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: 'error', latencyMs: Date.now() - dbStart, error: String(err) };
  }

  // ── Redis ───────────────────────────────────────────────────────────────────
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
    checks.redis = { status: 'ok', latencyMs: 0, details: { configured: false } };
  }

  // ── Module health checks ────────────────────────────────────────────────────
  try {
    const moduleResults = await runHealthChecks();
    for (const [name, result] of Object.entries(moduleResults)) {
      checks[`module:${name}`] = {
        status: result.status,
        latencyMs: 0,
        details: result.details,
        ...(result.status === 'error' ? { error: String(result.details?.error ?? 'unknown') } : {}),
      };
    }
  } catch {
    // Module checks failed — non-critical, don't block health response
  }

  // ── Overall status ──────────────────────────────────────────────────────────
  const coreStatuses = [checks.database?.status, checks.redis?.status];
  const hasCoreFail = coreStatuses.includes('error');
  const hasModuleFail = Object.entries(checks)
    .filter(([k]) => k.startsWith('module:'))
    .some(([, v]) => v.status === 'error');

  const overallStatus = hasCoreFail ? 'unhealthy' : hasModuleFail ? 'degraded' : 'healthy';

  // Strip error details in production
  if (IS_PRODUCTION) {
    for (const check of Object.values(checks)) {
      if (check.error) check.error = 'unavailable';
    }
  }

  return NextResponse.json(
    {
      status: overallStatus,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      modules: getRegisteredModules(),
      checks,
    },
    { status: overallStatus === 'healthy' ? 200 : 503 },
  );
}
