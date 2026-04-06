import { z } from 'zod';
import { createTRPCRouter, superadminProcedure } from '@/server/trpc';
import { getQueues } from '@/core/lib/queue';

/**
 * Admin task queue visibility. Superadmin only.
 * Provides insight into BullMQ job queues.
 */
export const taskQueueRouter = createTRPCRouter({
  /** List all queues with their job counts */
  list: superadminProcedure.query(async () => {
    const queues = getQueues();
    const results = [];

    for (const queue of queues) {
      try {
        const counts = await queue.getJobCounts();
        results.push({
          name: queue.name,
          ...counts,
        });
      } catch {
        results.push({ name: queue.name, error: 'Failed to get counts' });
      }
    }

    return results;
  }),

  /** Get failed jobs for a queue */
  failed: superadminProcedure
    .input(z.object({
      queueName: z.string().min(1).max(100),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const queues = getQueues();
      const queue = queues.find((q) => q.name === input.queueName);
      if (!queue) return [];

      try {
        const jobs = await queue.getFailed(0, input.limit);
        return jobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
        }));
      } catch {
        return [];
      }
    }),

  /** Retry a failed job */
  retry: superadminProcedure
    .input(z.object({
      queueName: z.string().min(1).max(100),
      jobId: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const queues = getQueues();
      const queue = queues.find((q) => q.name === input.queueName);
      if (!queue) return { success: false, error: 'Queue not found' };

      try {
        const job = await queue.getJob(input.jobId);
        if (!job) return { success: false, error: 'Job not found' };
        await job.retry();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }),
});
