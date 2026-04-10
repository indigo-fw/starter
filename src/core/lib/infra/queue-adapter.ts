import { getRedis } from '@/core/lib/infra/redis';
import { createLogger } from '@/core/lib/infra/logger';

const log = createLogger('queue-adapter');

/** Get current queue backend type */
export function getQueueType(): 'bullmq' | 'db' {
  return getRedis() ? 'bullmq' : 'db';
}

/**
 * Enqueue a job using the best available backend.
 * If Redis is available -> BullMQ. Otherwise -> DB queue.
 */
export async function enqueue(
  queue: string,
  payload: unknown,
  opts?: { priority?: number; maxAttempts?: number; runAfter?: Date }
): Promise<string> {
  const redis = getRedis();

  if (redis) {
    // BullMQ path
    const { Queue } = await import('bullmq');
    const bullQueue = new Queue(queue, { connection: redis });
    const job = await bullQueue.add('task', payload, {
      priority: opts?.priority,
      attempts: opts?.maxAttempts ?? 3,
      delay: opts?.runAfter ? Math.max(0, opts.runAfter.getTime() - Date.now()) : undefined,
    });
    await bullQueue.close();
    return job.id ?? crypto.randomUUID();
  }

  // DB queue fallback
  const { enqueueTask } = await import('./db-queue');
  log.debug('Using DB queue fallback', { queue });
  return enqueueTask(queue, payload, opts);
}
