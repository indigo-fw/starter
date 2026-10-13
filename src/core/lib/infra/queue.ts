import { type Processor, Queue, Worker } from 'bullmq';

import { createLogger, wasLogged } from '@/core/lib/infra/logger';
import {
  disconnectAll,
  getProducerRedis,
  getRedis,
} from '@/core/lib/infra/redis';

const log = createLogger('queue');

/**
 * BullMQ key prefix. Override with BULLMQ_PREFIX to isolate queues sharing one
 * Redis instance (e.g. a test server or a worktree slot next to the main dev
 * server — otherwise both consume each other's jobs).
 */
export const BULLMQ_PREFIX = process.env.BULLMQ_PREFIX || 'bull';

/**
 * Queue-wide defaults. Without `removeOnComplete`/`removeOnFail`, BullMQ keeps
 * every finished job forever and Redis grows without bound in production —
 * keep the last N for inspection only. Per-job options (e.g. the email retry
 * policy) override these on `queue.add()`.
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

const queues: Queue[] = [];
const workers: Worker[] = [];

/**
 * Create a BullMQ queue (job producer).
 *
 * Producers ride the request path (signup email, webhook dispatch), so they
 * use the bounded-retry producer connection: with Redis down, `queue.add()`
 * rejects in bounded time instead of buffering forever like the worker
 * profile. `getRedis()` stays the "is Redis configured" probe so installs
 * without REDIS_URL never open a producer socket (and test doubles that stub
 * only `getRedis` keep working).
 */
export function createQueue(name: string): Queue | null {
  if (!getRedis()) return null;
  const conn = getProducerRedis();
  if (!conn) return null;

  const queue = new Queue(name, {
    connection: conn,
    prefix: BULLMQ_PREFIX,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  queues.push(queue);
  return queue;
}

/**
 * Reuse the already-created queue for `name`, creating one on first use.
 * For call sites that enqueue ad hoc (queue-adapter): a fresh `Queue` per
 * enqueue would leak instances into `queues` and skip the shared prefix and
 * job defaults, so the consumer never sees the job under a custom prefix.
 */
export function getOrCreateQueue(name: string): Queue | null {
  return queues.find((q) => q.name === name) ?? createQueue(name);
}

/** Create a BullMQ worker with shared Redis connection */
export function createWorker(
  name: string,
  processor: Processor,
  concurrency?: number,
  opts?: { limiter?: { max: number; duration: number } }
): Worker | null {
  const conn = getRedis();
  if (!conn) return null;

  const worker = new Worker(name, processor, {
    connection: conn,
    prefix: BULLMQ_PREFIX,
    concurrency: concurrency ?? 1,
    limiter: opts?.limiter,
  });

  worker.on('failed', (job, err) => {
    // Catch-all for handlers that don't log their own failure. When the handler
    // already did (with ids this layer can't see) logging again would double
    // every failure — keep a debug breadcrumb so jobId↔queue stays recoverable.
    if (wasLogged(err)) {
      log.debug('Job failed (logged by handler)', {
        queue: name,
        jobId: job?.id,
      });
      return;
    }
    log.error('Job failed', {
      queue: name,
      jobId: job?.id,
      jobName: job?.name,
      attempt: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    // Connection-level errors (Redis blips). BullMQ reconnects itself; an
    // unhandled 'error' event would otherwise crash the process.
    log.warn('Worker error', { queue: name, error: err.message });
  });

  workers.push(worker);
  return worker;
}

/** Get all registered queues (for monitoring) */
export function getQueues(): Queue[] {
  return queues;
}

function logCloseFailures(
  kind: 'worker' | 'queue',
  names: string[],
  results: PromiseSettledResult<void>[]
): void {
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      log.warn(`Failed to close ${kind}`, {
        name: names[i],
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });
}

/**
 * Gracefully shutdown all workers and queues. Every close is attempted even
 * when one rejects: with `Promise.all` a single failing `worker.close()` would
 * skip the remaining workers and `disconnectAll()`, leaving in-flight jobs to
 * be killed by the force-exit timer instead of being drained.
 */
export async function shutdownAllWorkers(): Promise<void> {
  logCloseFailures(
    'worker',
    workers.map((w) => w.name),
    await Promise.allSettled(workers.map((w) => w.close()))
  );
  logCloseFailures(
    'queue',
    queues.map((q) => q.name),
    await Promise.allSettled(queues.map((q) => q.close()))
  );
  await disconnectAll();
}
