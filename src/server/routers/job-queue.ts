import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getQueues } from '@/core/lib/infra/queue';
import { createTRPCRouter, sectionProcedure } from '../trpc';

const settingsProcedure = sectionProcedure('settings');

export const jobQueueRouter = createTRPCRouter({
  /** Get job counts for all queues */
  stats: settingsProcedure.query(async () => {
    const queues = getQueues();
    const stats: Record<
      string,
      { waiting: number; active: number; completed: number; failed: number; delayed: number }
    > = {};

    for (const queue of queues) {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed'
      );
      stats[queue.name] = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    }

    return stats;
  }),

  /** List jobs for a specific queue + status */
  list: settingsProcedure
    .input(
      z.object({
        queue: z.string().max(100),
        status: z.enum(['waiting', 'active', 'completed', 'failed', 'delayed']),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const queues = getQueues();
      const queue = queues.find((q) => q.name === input.queue);
      if (!queue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Queue not found' });
      }

      const start = (input.page - 1) * input.pageSize;
      const end = start + input.pageSize - 1;

      let jobs;
      switch (input.status) {
        case 'waiting':
          jobs = await queue.getWaiting(start, end);
          break;
        case 'active':
          jobs = await queue.getActive(start, end);
          break;
        case 'completed':
          jobs = await queue.getCompleted(start, end);
          break;
        case 'failed':
          jobs = await queue.getFailed(start, end);
          break;
        case 'delayed':
          jobs = await queue.getDelayed(start, end);
          break;
      }

      return jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: JSON.stringify(job.data).slice(0, 200),
        timestamp: job.timestamp,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
        failedReason: job.failedReason ?? null,
        attemptsMade: job.attemptsMade,
      }));
    }),

  /** Retry a failed job */
  retry: settingsProcedure
    .input(
      z.object({
        queue: z.string().max(100),
        jobId: z.string().max(100),
      })
    )
    .mutation(async ({ input }) => {
      const queues = getQueues();
      const queue = queues.find((q) => q.name === input.queue);
      if (!queue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Queue not found' });
      }

      const job = await queue.getJob(input.jobId);
      if (!job) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      }

      await job.retry();
      return { success: true };
    }),

  /** Remove a job */
  remove: settingsProcedure
    .input(
      z.object({
        queue: z.string().max(100),
        jobId: z.string().max(100),
      })
    )
    .mutation(async ({ input }) => {
      const queues = getQueues();
      const queue = queues.find((q) => q.name === input.queue);
      if (!queue) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Queue not found' });
      }

      const job = await queue.getJob(input.jobId);
      if (!job) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      }

      await job.remove();
      return { success: true };
    }),
});
