import { Queue, Worker, type Processor } from 'bullmq';
import { getRedis, disconnectAll } from '@/core/lib/redis';

const queues: Queue[] = [];
const workers: Worker[] = [];

/** Create a BullMQ queue with shared Redis connection */
export function createQueue(name: string): Queue | null {
  const conn = getRedis();
  if (!conn) return null;

  const queue = new Queue(name, { connection: conn });
  queues.push(queue);
  return queue;
}

/** Create a BullMQ worker with shared Redis connection */
export function createWorker(
  name: string,
  processor: Processor,
  concurrency?: number,
  opts?: { limiter?: { max: number; duration: number } },
): Worker | null {
  const conn = getRedis();
  if (!conn) return null;

  const worker = new Worker(name, processor, {
    connection: conn,
    concurrency: concurrency ?? 1,
    limiter: opts?.limiter,
  });
  workers.push(worker);
  return worker;
}

/** Get all registered queues (for monitoring) */
export function getQueues(): Queue[] {
  return queues;
}

/** Gracefully shutdown all workers and queues */
export async function shutdownAllWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(queues.map((q) => q.close()));
  await disconnectAll();
}
