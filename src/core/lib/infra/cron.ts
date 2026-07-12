/**
 * Cron job registry — register recurring jobs, core handles
 * BullMQ repeatable jobs vs DB-queue fallback automatically.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { createQueue, createWorker } from './queue';
import { createLogger } from './logger';
import { getRequestRedis } from './redis';

const logger = createLogger('cron');

/**
 * Probe whether Redis is actually reachable (not merely configured).
 *
 * Uses the fail-fast request-profile connection and a bounded timeout so a
 * configured-but-unreachable Redis can't block `server.ts` startup. A plain
 * `REDIS_URL`-is-set check (or a BullMQ queue whose commands buffer forever)
 * would hang here instead.
 */
async function isRedisReachable(timeoutMs = 2000): Promise<boolean> {
  const redis = getRequestRedis();
  if (!redis) return false;
  const TIMED_OUT = Symbol('redis-ping-timeout');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ping = redis.ping();
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
      // Don't let the timer keep the event loop alive.
      if (typeof timer === 'object' && 'unref' in timer) timer.unref();
    });
    const result = await Promise.race([ping, timeout]);
    return result === 'PONG';
  } catch (err: unknown) {
    logger.warn('Redis ping probe failed — falling back to DB queue cron', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface CronJobDef {
  /** Unique job name (used as queue name) */
  name: string;
  /** Cron pattern (e.g. '0 3 * * *' for daily at 3 AM) */
  pattern: string;
  /** Job handler */
  handler: () => Promise<void>;
}

const cronJobs: CronJobDef[] = [];

/** Register a cron job. Call during server startup before `startCronScheduler()`. */
export function registerCronJob(def: CronJobDef): void {
  cronJobs.push(def);
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Start all registered cron jobs.
 * - If Redis is available: uses BullMQ repeatable jobs.
 * - If no Redis: falls back to DB-queue with re-enqueue pattern.
 */
export async function startCronScheduler(): Promise<void> {
  if (cronJobs.length === 0) return;

  // Probe whether Redis is actually reachable (bounded, fail-fast) — a merely
  // configured-but-unreachable Redis must not hang startup or the request path.
  const redisReachable = await isRedisReachable();

  if (redisReachable) {
    // Redis available — use BullMQ repeatable jobs
    for (const job of cronJobs) {
      const queue = createQueue(job.name);
      if (!queue) continue;

      await queue.add('run', {}, {
        repeat: { pattern: job.pattern },
      });

      createWorker(job.name, async () => {
        await job.handler();
      });

      logger.info(`Cron job "${job.name}" scheduled (${job.pattern})`);
    }
  } else {
    // No Redis — fall back to DB queue
    try {
      const { startDbQueueWorker, enqueueTask } = await import('./db-queue');

      for (const job of cronJobs) {
        // Seed the next run only if one isn't already pending. Without this
        // guard the job fired immediately (default runAfter = now) on every
        // boot and each restart stacked a fresh chain, multiplying runs.
        if (!(await hasPendingTask(job.name))) {
          await enqueueTask(job.name, { action: 'run' }, {
            runAfter: getNextCronRun(job.pattern),
          }).catch((err: unknown) => {
            logger.error(`Failed to seed cron "${job.name}"`, {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        startDbQueueWorker(job.name, async () => {
          await job.handler();

          // Re-enqueue for next run based on cron pattern
          const nextRun = getNextCronRun(job.pattern);
          await enqueueTask(job.name, { action: 'run' }, {
            runAfter: nextRun,
          }).catch((err: unknown) => {
            // Fallback: re-enqueue for 24h from now
            logger.error(`Failed to re-enqueue cron "${job.name}", using 24h fallback`, { error: String(err) });
            enqueueTask(job.name, { action: 'run' }, {
              runAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
            }).catch(() => {});
          });
        }, 60_000);

        logger.info(`Cron job "${job.name}" scheduled via DB queue (${job.pattern})`);
      }
    } catch (err: unknown) {
      logger.error('Failed to start DB queue cron scheduler', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * True if the DB task queue already has an unfinished task for this cron job,
 * so a restart doesn't seed a duplicate chain. Treats `pending` and
 * `processing` as unfinished; failures during the check fail open (seed anyway).
 */
async function hasPendingTask(queue: string): Promise<boolean> {
  try {
    const { db } = await import('@/server/db');
    const { saasTaskQueue } = await import('@/server/db/schema/task-queue');
    const [existing] = await db
      .select({ id: saasTaskQueue.id })
      .from(saasTaskQueue)
      .where(
        and(
          eq(saasTaskQueue.queue, queue),
          inArray(saasTaskQueue.status, ['pending', 'processing']),
        ),
      )
      .limit(1);
    return Boolean(existing);
  } catch (err: unknown) {
    logger.warn(`Pending-task check failed for cron "${queue}"`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cron pattern → next run time (simple parser for daily patterns)
// ---------------------------------------------------------------------------

/**
 * Calculate next run time from a cron pattern (5-field: min hour dom month dow).
 *
 * Supported patterns:
 * - Fixed daily: `30 3 * * *` → every day at 03:30 UTC
 * - Fixed hourly: `0 * * * *` → every hour at :00
 * - Step minutes: `*\/5 * * * *` → every 5 minutes
 * - Step hours: `0 *\/2 * * *` → every 2 hours at :00
 * - Wildcards: `* * * * *` → every minute
 *
 * Day-of-month, month, and day-of-week fields are not evaluated for scheduling;
 * only minute and hour are used. For unsupported patterns, falls back to 24h.
 * BullMQ handles the full cron spec via Redis — this is only the DB-queue fallback.
 */
/** @internal Exported for testing only. */
export function getNextCronRun(pattern: string): Date {
  const parts = pattern.split(/\s+/);
  if (parts.length < 5) {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  const [minuteField, hourField] = parts;

  // Parse a field: returns { fixed: number } | { step: number } | { wild: true } | null
  function parseField(field: string): { type: 'fixed'; value: number } | { type: 'step'; value: number } | { type: 'wild' } | null {
    if (field === '*') return { type: 'wild' };
    const stepMatch = field.match(/^\*\/(\d+)$/);
    if (stepMatch) return { type: 'step', value: parseInt(stepMatch[1], 10) };
    const num = parseInt(field, 10);
    if (!isNaN(num)) return { type: 'fixed', value: num };
    return null;
  }

  const minSpec = parseField(minuteField);
  const hrSpec = parseField(hourField);

  if (!minSpec || !hrSpec) {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  const now = new Date();

  // Case: fixed hour + fixed minute (e.g. `0 3 * * *`)
  if (hrSpec.type === 'fixed' && minSpec.type === 'fixed') {
    const next = new Date(now);
    next.setUTCHours(hrSpec.value, minSpec.value, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  // Case: step minutes, wildcard hour (e.g. `*/5 * * * *`)
  if (minSpec.type === 'step' && hrSpec.type === 'wild') {
    return new Date(now.getTime() + minSpec.value * 60 * 1000);
  }

  // Case: fixed minute, wildcard hour (e.g. `0 * * * *` → next hour at :00)
  if (minSpec.type === 'fixed' && hrSpec.type === 'wild') {
    const next = new Date(now);
    next.setUTCMinutes(minSpec.value, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCHours(next.getUTCHours() + 1);
    }
    return next;
  }

  // Case: fixed minute, step hour (e.g. `0 */2 * * *`)
  if (minSpec.type === 'fixed' && hrSpec.type === 'step') {
    return new Date(now.getTime() + hrSpec.value * 60 * 60 * 1000);
  }

  // Case: wildcard minute + wildcard hour (every minute)
  if (minSpec.type === 'wild' && hrSpec.type === 'wild') {
    return new Date(now.getTime() + 60 * 1000);
  }

  // Fallback for unsupported combinations
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
