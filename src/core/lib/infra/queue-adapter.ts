import { createLogger } from '@/core/lib/infra/logger';
import { getOrCreateQueue } from '@/core/lib/infra/queue';
import { getRedis } from '@/core/lib/infra/redis';

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
  // Through the shared registry so the job lands under BULLMQ_PREFIX with the
  // queue-wide defaults — the consumer (`createWorker`) listens there, so a
  // bare `new Queue()` would be invisible to it under a custom prefix.
  const bullQueue = getOrCreateQueue(queue);

  if (bullQueue) {
    const job = await bullQueue.add('task', payload, {
      priority: opts?.priority,
      attempts: opts?.maxAttempts ?? 3,
      delay: opts?.runAfter
        ? Math.max(0, opts.runAfter.getTime() - Date.now())
        : undefined,
    });
    return job.id ?? crypto.randomUUID();
  }

  // DB queue fallback
  const { enqueueTask } = await import('./db-queue');
  log.debug('Using DB queue fallback', { queue });
  return enqueueTask(queue, payload, opts);
}
