import { and, eq, lte, asc, desc } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasTaskQueue } from '@/server/db/schema/task-queue';
import { createLogger } from '@/core/lib/infra/logger';

const log = createLogger('db-queue');

type TaskHandler = (payload: unknown) => Promise<unknown>;

/** Exponential backoff: 30s, 2min, 10min */
function getBackoff(attempts: number): number {
  const delays = [30_000, 120_000, 600_000];
  return delays[Math.min(attempts, delays.length - 1)] ?? 600_000;
}

/** Enqueue a task into the DB queue */
export async function enqueueTask(
  queue: string,
  payload: unknown,
  opts?: { priority?: number; maxAttempts?: number; runAfter?: Date }
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(saasTaskQueue).values({
    id,
    queue,
    payload,
    priority: opts?.priority ?? 0,
    maxAttempts: opts?.maxAttempts ?? 3,
    runAfter: opts?.runAfter ?? new Date(),
  });
  return id;
}

/** Poll for pending tasks and process them. Returns number processed. */
export async function pollAndProcess(
  queue: string,
  handler: TaskHandler,
  batchSize = 5
): Promise<number> {
  const now = new Date();

  // SELECT pending tasks ready to run, ordered by priority DESC, createdAt ASC
  const tasks = await db
    .select()
    .from(saasTaskQueue)
    .where(
      and(
        eq(saasTaskQueue.queue, queue),
        eq(saasTaskQueue.status, 'pending'),
        lte(saasTaskQueue.runAfter, now)
      )
    )
    .orderBy(desc(saasTaskQueue.priority), asc(saasTaskQueue.createdAt))
    .limit(batchSize);

  let processed = 0;

  for (const task of tasks) {
    // Lock the task (optimistic: only update if still pending)
    const lockUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const [locked] = await db
      .update(saasTaskQueue)
      .set({
        status: 'processing',
        lockedUntil: lockUntil,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(saasTaskQueue.id, task.id),
          eq(saasTaskQueue.status, 'pending')
        )
      )
      .returning({ id: saasTaskQueue.id });

    if (!locked) continue; // Another worker grabbed it

    try {
      const result = await handler(task.payload);
      await db
        .update(saasTaskQueue)
        .set({
          status: 'completed',
          result: result as Record<string, unknown> | null,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(saasTaskQueue.id, task.id));
      processed++;
    } catch (err) {
      const attempts = task.attempts + 1;
      const isDead = attempts >= task.maxAttempts;
      const backoff = getBackoff(attempts);

      await db
        .update(saasTaskQueue)
        .set({
          status: isDead ? 'dead' : 'pending',
          attempts,
          lastError: err instanceof Error ? err.message : String(err),
          lockedUntil: null,
          runAfter: isDead ? task.runAfter : new Date(Date.now() + backoff),
          updatedAt: new Date(),
        })
        .where(eq(saasTaskQueue.id, task.id));

      log.error('Task failed', {
        taskId: task.id,
        queue,
        attempts,
        isDead,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return processed;
}

/** Start a polling worker. Returns stop function. */
export function startDbQueueWorker(
  queue: string,
  handler: TaskHandler,
  intervalMs = 5000
): { stop: () => void } {
  let running = true;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  async function poll() {
    if (!running) return;
    try {
      await pollAndProcess(queue, handler);
    } catch (err) {
      log.error('DB queue poll error', { queue, error: String(err) });
    }
    if (running) {
      timeoutId = setTimeout(poll, intervalMs);
    }
  }

  poll();
  log.info(`DB queue worker started for "${queue}" (interval: ${intervalMs}ms)`);

  return {
    stop() {
      running = false;
      if (timeoutId) clearTimeout(timeoutId);
      log.info(`DB queue worker stopped for "${queue}"`);
    },
  };
}

/** Recover stale tasks (processing but lock expired) */
export async function recoverStaleTasks(): Promise<number> {
  const now = new Date();
  const stale = await db
    .select({ id: saasTaskQueue.id, attempts: saasTaskQueue.attempts, maxAttempts: saasTaskQueue.maxAttempts })
    .from(saasTaskQueue)
    .where(
      and(
        eq(saasTaskQueue.status, 'processing'),
        lte(saasTaskQueue.lockedUntil, now)
      )
    )
    .limit(100);

  let recovered = 0;
  for (const task of stale) {
    const attempts = task.attempts + 1;
    const isDead = attempts >= task.maxAttempts;

    await db
      .update(saasTaskQueue)
      .set({
        status: isDead ? 'dead' : 'pending',
        attempts,
        lockedUntil: null,
        lastError: 'Recovered from stale processing state',
        runAfter: isDead ? undefined : new Date(Date.now() + getBackoff(attempts)),
        updatedAt: new Date(),
      })
      .where(eq(saasTaskQueue.id, task.id));
    recovered++;
  }

  if (recovered > 0) {
    log.info(`Recovered ${recovered} stale tasks`);
  }
  return recovered;
}
